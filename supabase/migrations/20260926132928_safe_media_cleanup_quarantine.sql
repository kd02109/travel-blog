-- Safe media cleanup is staged: references are fenced in the database, then
-- Storage objects are removed through the Storage API after a quarantine.
alter table app_private.media_assets
  add column cleanup_state text not null default 'active'
    check (cleanup_state in ('active','quarantined','deleting')),
  add column cleanup_after timestamptz,
  add column cleanup_lease_until timestamptz;

create or replace function app_private.assert_active_asset_refs(p_site uuid,p_doc jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare token text; found_state text;
begin
 for token in
  select m[1] from regexp_matches(coalesce(p_doc,'{}'::jsonb)::text,
   '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})','g') m
  group by m[1] order by m[1]
 loop
  select a.cleanup_state into found_state from app_private.media_assets a
   where a.id=token::uuid for share;
  if found and found_state<>'active' then raise exception 'asset_cleanup_in_progress' using errcode='PT409'; end if;
 end loop;
end $$;

create or replace function app_private.guard_media_asset_reference_write()
returns trigger language plpgsql security invoker set search_path='' as $$
declare a app_private.media_assets; sid uuid;
begin
 if tg_table_name='posts' then
  perform app_private.assert_active_asset_refs(new.site_id,new.draft_content);
 elsif tg_table_name='post_revisions' then
  select p.site_id into sid from app_private.posts p where p.id=new.post_id;
  perform app_private.assert_active_asset_refs(sid,new.snapshot);
 elsif tg_table_name='sites' then
  perform app_private.assert_active_asset_refs(new.id,new.draft_settings);
  perform app_private.assert_active_asset_refs(new.id,new.published_settings);
 elsif tg_table_name='profiles' and new.avatar_asset_id is not null then
  select * into a from app_private.media_assets where id=new.avatar_asset_id for share;
  if found and a.cleanup_state<>'active' then raise exception 'asset_cleanup_in_progress' using errcode='PT409'; end if;
 elsif tg_table_name='post_publications' then
  perform app_private.assert_active_asset_refs(new.site_id,
    to_jsonb(coalesce(new.body_html,'')||coalesce(new.metadata::text,'')));
  for a in select * from app_private.media_assets
    where id in (new.cover_asset_id,new.pdf_asset_id) order by id for share
  loop
   if a.cleanup_state<>'active' or a.state<>'ready' then raise exception 'invalid_asset' using errcode='PT422'; end if;
  end loop;
 end if;
 return new;
end $$;

create trigger media_asset_ref_posts before insert or update of draft_content on app_private.posts
 for each row execute function app_private.guard_media_asset_reference_write();
create trigger media_asset_ref_revisions before insert or update of snapshot on app_private.post_revisions
 for each row execute function app_private.guard_media_asset_reference_write();
create trigger media_asset_ref_sites before update of draft_settings,published_settings on app_private.sites
 for each row execute function app_private.guard_media_asset_reference_write();
create trigger media_asset_ref_profiles before insert or update of avatar_asset_id on public.profiles
 for each row execute function app_private.guard_media_asset_reference_write();
create trigger media_asset_ref_publications before insert or update of cover_asset_id,pdf_asset_id,body_html,metadata on public.post_publications
 for each row execute function app_private.guard_media_asset_reference_write();

create or replace function app_private.guard_media_asset_cleanup_state()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.cleanup_state<>'active' and (
   new.state is distinct from old.state or new.object_path is distinct from old.object_path or
   new.metadata is distinct from old.metadata or new.preview_asset_id is distinct from old.preview_asset_id
 ) then raise exception 'asset_cleanup_in_progress' using errcode='PT409'; end if;
 return new;
end $$;
create trigger media_asset_cleanup_write_guard before update on app_private.media_assets
 for each row execute function app_private.guard_media_asset_cleanup_state();

create or replace function app_private.guard_publication_asset()
returns trigger language plpgsql security invoker set search_path='' as $$
declare a app_private.media_assets;
begin
 select x.* into a from app_private.media_assets x join public.post_publications p on p.site_id=x.site_id
 where p.post_id=new.post_id and x.id=new.asset_id for share of x;
 if not found or a.state<>'ready' or a.cleanup_state<>'active' then raise exception 'invalid_asset' using errcode='PT422'; end if;
 return new;
end $$;

create or replace function app_private.media_asset_has_refs(p_id uuid,p_allowed_parent uuid default null)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.publication_assets x where x.asset_id=p_id)
  or exists(select 1 from public.post_publications x where x.cover_asset_id=p_id or x.pdf_asset_id=p_id)
  or exists(select 1 from public.profiles x where x.avatar_asset_id=p_id)
  or exists(select 1 from public.post_publications x where x.body_html ~* ('"'||p_id::text||'"') or x.metadata::text ~* ('"'||p_id::text||'"'))
  or exists(select 1 from app_private.media_assets x where x.preview_asset_id=p_id and x.id is distinct from p_allowed_parent)
  or exists(select 1 from app_private.sites x where x.draft_settings::text ~* ('"'||p_id::text||'"') or x.published_settings::text ~* ('"'||p_id::text||'"'))
  or exists(select 1 from app_private.posts x where x.draft_content::text ~* ('"'||p_id::text||'"'))
  or exists(select 1 from app_private.post_revisions x where x.snapshot::text ~* ('"'||p_id::text||'"'))
$$;

create or replace function public.travel_media_cleanup(p_action text,p_input jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare a app_private.media_assets; child app_private.media_assets; ids uuid[]; root_id uuid; lease timestamptz; result jsonb;
begin
 if p_action='cleanup_claim' then
  select x.* into a from app_private.media_assets x
   where x.cleanup_state='active'
    and ((x.state='uploading' and x.created_at<now()-interval '1 day')
      or (x.state='failed' and x.created_at<now()-interval '30 days')
      or (x.state='ready' and x.created_at<now()-interval '180 days'))
    and not exists(select 1 from app_private.media_assets parent where parent.preview_asset_id=x.id)
    and not exists(select 1 from app_private.outbox_jobs q where q.resource_id=x.id and q.status in ('queued','running'))
    and not app_private.media_asset_has_refs(x.id)
    and (x.preview_asset_id is null or not app_private.media_asset_has_refs(x.preview_asset_id,x.id))
   order by x.created_at for update skip locked limit 1;
  if found then
   select coalesce(array_agg(x.id order by x.id),array[a.id]) into ids
    from app_private.media_assets x where x.id=a.id or x.id=a.preview_asset_id;
   perform 1 from app_private.media_assets x where x.id=any(ids) order by x.id for update;
   if app_private.media_asset_has_refs(a.id) then return jsonb_build_object('stage','skipped','id',a.id); end if;
   if a.preview_asset_id is not null and app_private.media_asset_has_refs(a.preview_asset_id,a.id) then
    return jsonb_build_object('stage','skipped','id',a.id);
   end if;
   if exists(select 1 from app_private.media_assets x where x.id=any(ids) and x.cleanup_state<>'active') then
    return jsonb_build_object('stage','skipped','id',a.id);
   end if;
   update app_private.media_assets set cleanup_state='quarantined',cleanup_after=now()+interval '7 days'
    where id=any(ids);
   return jsonb_build_object('stage','quarantined','id',a.id,'count',cardinality(ids));
  end if;

  select x.* into a from app_private.media_assets x
   where x.cleanup_state='quarantined' and x.cleanup_after<=now()
    and (x.cleanup_lease_until is null or x.cleanup_lease_until<now())
    and not exists(select 1 from app_private.media_assets parent where parent.preview_asset_id=x.id)
   order by x.cleanup_after for update skip locked limit 1;
  if not found then return null; end if;
  select coalesce(array_agg(x.id order by x.id),array[a.id]) into ids
   from app_private.media_assets x where x.id=a.id or x.id=a.preview_asset_id;
  perform 1 from app_private.media_assets x where x.id=any(ids) order by x.id for update;
  if app_private.media_asset_has_refs(a.id) or
     (a.preview_asset_id is not null and app_private.media_asset_has_refs(a.preview_asset_id,a.id)) or
     exists(select 1 from app_private.outbox_jobs q where q.resource_id=any(ids) and q.status in ('queued','running')) then
   update app_private.media_assets set cleanup_state='active',cleanup_after=null,cleanup_lease_until=null where id=any(ids);
   return jsonb_build_object('stage','restored','id',a.id,'reason','reference_or_job_detected');
  end if;
  lease:=now()+interval '5 minutes';
  update app_private.media_assets set cleanup_state='deleting',cleanup_lease_until=lease where id=any(ids);
  select jsonb_build_object('stage','delete','id',a.id,'site_id',a.site_id,'bucket',a.bucket,
     'preview',case when child.id is null then null else jsonb_build_object('id',child.id,'bucket',child.bucket) end,
     'lease_until',lease)
    into result from app_private.media_assets root
    left join app_private.media_assets child on child.id=root.preview_asset_id where root.id=a.id;
  return result;
 elsif p_action='cleanup_finalize' then
  root_id:=(p_input->>'id')::uuid; lease:=(p_input->>'lease_until')::timestamptz;
  select * into a from app_private.media_assets where id=root_id for update;
  if not found or a.cleanup_state<>'deleting' or a.cleanup_lease_until is distinct from lease or lease<=now() then
   raise exception 'stale_cleanup_lease' using errcode='PT409';
  end if;
  if app_private.media_asset_has_refs(a.id) or
    (a.preview_asset_id is not null and app_private.media_asset_has_refs(a.preview_asset_id,a.id)) then
   update app_private.media_assets set cleanup_state='active',cleanup_after=null,cleanup_lease_until=null
    where id=a.id or id=a.preview_asset_id;
   raise exception 'asset_became_referenced' using errcode='PT409';
  end if;
  delete from app_private.media_assets where id=a.id;
  if a.preview_asset_id is not null then delete from app_private.media_assets where id=a.preview_asset_id; end if;
  return jsonb_build_object('deleted',true);
 end if;
 raise exception 'unknown_action' using errcode='PT400';
end $$;

revoke all on function app_private.assert_active_asset_refs(uuid,jsonb) from public,anon,authenticated;
revoke all on function app_private.guard_media_asset_reference_write() from public,anon,authenticated;
revoke all on function app_private.guard_media_asset_cleanup_state() from public,anon,authenticated;
revoke all on function app_private.media_asset_has_refs(uuid,uuid) from public,anon,authenticated;
revoke all on function public.travel_media_cleanup(text,jsonb) from public,anon,authenticated;
grant execute on function public.travel_media_cleanup(text,jsonb) to service_role;
notify pgrst,'reload schema';
