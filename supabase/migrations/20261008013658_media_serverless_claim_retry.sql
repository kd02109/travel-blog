-- Restrict media claims to conversion jobs and let expired Storage deletion leases retry.
create or replace function public.travel_worker(p_action text,p_input jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
#variable_conflict use_column
declare j app_private.outbox_jobs; a app_private.media_assets; v uuid; meta jsonb; path text; preview uuid;
begin
 if p_action='claim' then
  select * into j from app_private.outbox_jobs
   where type='process_asset'
    and ((status='queued' and next_run_at<=now()) or (status='running' and lease_until<now()))
   order by next_run_at for update skip locked limit 1;
  if j.id is null then return null; end if;
  update app_private.outbox_jobs set status='running',attempts=attempts+1,lease_until=now()+interval '5 minutes' where id=j.id returning * into j;
  select * into a from app_private.media_assets where id=j.resource_id and site_id=j.site_id;
  return jsonb_build_object('job',to_jsonb(j),'asset',case when a.id is not null then to_jsonb(a) end);
 elsif p_action='cancel' then
  select * into a from app_private.media_assets where id=(p_input->>'id')::uuid for update;
  if a.id is null then raise exception 'not_found' using errcode='PT404'; end if;
  if a.state in ('uploading','processing') then
   update app_private.outbox_jobs set status='failed',lease_until=null where type='process_asset' and resource_id=a.id and status in ('queued','running');
   update app_private.media_assets set state='failed',metadata=metadata||jsonb_build_object('error_code','cancelled') where id=a.id;
  end if;
  return jsonb_build_object('cancelled',true);
 elsif p_action='cleanup_candidates' then
  return coalesce((select jsonb_agg(to_jsonb(x)) from (
   select a0.id,a0.site_id,a0.kind,a0.state,a0.created_at from app_private.media_assets a0
   where ((a0.state='uploading' and a0.created_at<now()-interval '1 day')
      or (a0.state='failed' and a0.created_at<now()-interval '30 days')
      or (a0.state='ready' and a0.created_at<now()-interval '180 days'))
    and not exists(select 1 from public.publication_assets pa where pa.asset_id=a0.id)
    and not exists(select 1 from public.profiles pr where pr.avatar_asset_id=a0.id)
    and not exists(select 1 from app_private.media_assets parent where parent.preview_asset_id=a0.id)
    and not exists(select 1 from app_private.sites st where st.draft_settings->>'hero_asset_id'=a0.id::text or st.published_settings->>'hero_asset_id'=a0.id::text)
    and not exists(select 1 from app_private.posts p where p.draft_content::text like '%'||a0.id::text||'%')
    and not exists(select 1 from app_private.outbox_jobs q where q.resource_id=a0.id and q.status='running' and q.lease_until>now())
    and (a0.preview_asset_id is null or (
      not exists(select 1 from public.publication_assets pa where pa.asset_id=a0.preview_asset_id)
      and not exists(select 1 from public.profiles pr where pr.avatar_asset_id=a0.preview_asset_id)
      and not exists(select 1 from app_private.posts p where p.draft_content::text like '%'||a0.preview_asset_id::text||'%')
      and not exists(select 1 from app_private.sites st where st.draft_settings->>'hero_asset_id'=a0.preview_asset_id::text or st.published_settings->>'hero_asset_id'=a0.preview_asset_id::text)))
    and not app_private.media_asset_has_refs(a0.id)
    and (a0.preview_asset_id is null or not app_private.media_asset_has_refs(a0.preview_asset_id,a0.id))
   order by a0.created_at limit 100
  ) x),'[]'::jsonb);
 end if;
 select * into j from app_private.outbox_jobs where id=(p_input->>'job_id')::uuid and status='running' and lease_until=(p_input->>'lease_until')::timestamptz and lease_until>now() and attempts=(p_input->>'attempt')::int for update;
 if j.id is null then raise exception 'stale_job_lease' using errcode='PT409'; end if;
 if p_action='fail' then
  update app_private.outbox_jobs set status=case when attempts>=5 then 'failed' else 'queued' end,next_run_at=now()+interval '1 minute'*power(2,least(attempts,6)),lease_until=null where id=j.id;
  if j.type='process_asset' then update app_private.media_assets set state=case when j.attempts>=5 then 'failed' else 'processing' end,metadata=metadata||jsonb_build_object('error_code','processing_failed') where id=j.resource_id and site_id=j.site_id; end if;
  return jsonb_build_object('recorded',true);
 elsif p_action='complete' then
  if j.type='process_asset' then
   select * into a from app_private.media_assets where id=j.resource_id and site_id=j.site_id for update;
   if a.state<>'processing' then raise exception 'asset_cancelled' using errcode='PT409'; end if;
   meta:=p_input->'metadata';path:=p_input->>'object_path';
   if a.id is null or jsonb_typeof(meta) is distinct from 'object' or (meta->>'bytes')::bigint not between 1 and 20971520 or meta->>'checksum' is null or path not like a.site_id::text||'/'||a.id::text||'/%' or path like '%..%' then raise exception 'invalid_processed_asset' using errcode='PT422'; end if;
   if a.kind='image' then
    if meta->>'mime' not in ('image/png','image/jpeg','image/webp') or (meta->>'width')::int not between 1 and 20000 or (meta->>'height')::int not between 1 and 20000 then raise exception 'invalid_image' using errcode='PT422'; end if;
   else
    if meta->>'mime'<>'application/pdf' or (meta->>'page_count')::int not between 1 and 200 then raise exception 'invalid_pdf' using errcode='PT422'; end if;
    if p_input->>'preview_path' not like a.site_id::text||'/'||a.id::text||'/%' or p_input->>'preview_path' like '%..%' then raise exception 'invalid_preview' using errcode='PT422'; end if;
    v:=gen_random_uuid();
    insert into app_private.media_assets(id,site_id,owner_id,kind,bucket,object_path,state,metadata) values(v,a.site_id,a.owner_id,'image','documents-private',p_input->>'preview_path','ready',p_input->'preview_metadata') returning id into preview;
   end if;
   if not exists(select 1 from storage.objects where bucket_id=a.bucket and name=path) then raise exception 'file_missing' using errcode='PT422'; end if;
   if a.kind='pdf' and not exists(select 1 from storage.objects where bucket_id='documents-private' and name=p_input->>'preview_path') then raise exception 'preview_missing' using errcode='PT422'; end if;
   update app_private.media_assets set state='ready',object_path=path,metadata=meta,preview_asset_id=preview where id=a.id;
  end if;
  update app_private.outbox_jobs set status='done',lease_until=null where id=j.id;
  return jsonb_build_object('completed',true);
 end if;
 raise exception 'unknown_action' using errcode='PT400';
end $$;

create or replace function public.travel_media_cleanup(p_action text,p_input jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare a app_private.media_assets; child app_private.media_assets; ids uuid[]; root_id uuid; lease timestamptz; result jsonb;
begin
 if p_action='cleanup_claim' then
  -- Storage removal can fail after some objects are gone. Keep the deletion
  -- fence, reclaim only an expired lease, and let Storage API removal resume.
  select x.* into a from app_private.media_assets x
   where x.cleanup_state='deleting' and x.cleanup_lease_until<now()
    and not exists(select 1 from app_private.media_assets parent where parent.preview_asset_id=x.id)
   order by x.cleanup_lease_until for update skip locked limit 1;
  if found then
   select coalesce(array_agg(x.id order by x.id),array[a.id]) into ids
    from app_private.media_assets x where x.id=a.id or x.id=a.preview_asset_id;
   perform 1 from app_private.media_assets x where x.id=any(ids) order by x.id for update;
   if a.preview_asset_id is not null then
    select * into child from app_private.media_assets where id=a.preview_asset_id;
   end if;
   if (a.preview_asset_id is not null and (
       child.id is null or child.cleanup_state<>'deleting' or
       child.cleanup_lease_until is distinct from a.cleanup_lease_until)) or
      app_private.media_asset_has_refs(a.id) or
      (a.preview_asset_id is not null and app_private.media_asset_has_refs(a.preview_asset_id,a.id)) or
      exists(select 1 from app_private.outbox_jobs q where q.resource_id=any(ids) and q.status in ('queued','running')) then
    -- Never restore a partly removed asset to active. Give other claims a
    -- chance to run while an operator investigates the unexpected reference.
    update app_private.media_assets set cleanup_lease_until=now()+interval '1 hour' where id=any(ids);
    return jsonb_build_object('stage','blocked','id',a.id,'reason','reference_job_or_preview_changed');
   end if;
   lease:=now()+interval '5 minutes';
   update app_private.media_assets set cleanup_lease_until=lease where id=any(ids);
   return jsonb_build_object('stage','delete','id',a.id,'site_id',a.site_id,'bucket',a.bucket,
     'preview',case when child.id is null then null else jsonb_build_object('id',child.id,'bucket',child.bucket) end,
     'lease_until',lease);
  end if;

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
  if a.preview_asset_id is not null then
   select * into child from app_private.media_assets where id=a.preview_asset_id for update;
   if not found or child.cleanup_state<>'deleting' or child.cleanup_lease_until is distinct from lease then
    raise exception 'stale_cleanup_lease' using errcode='PT409';
   end if;
  end if;
  if app_private.media_asset_has_refs(a.id) or
    (a.preview_asset_id is not null and app_private.media_asset_has_refs(a.preview_asset_id,a.id)) or
    exists(select 1 from app_private.outbox_jobs q
      where q.resource_id in (a.id,a.preview_asset_id) and q.status in ('queued','running')) then
   -- A partial Storage deletion may already have happened. Keep the fence.
   raise exception 'asset_became_referenced' using errcode='PT409';
  end if;
  delete from app_private.media_assets where id=a.id;
  if a.preview_asset_id is not null then delete from app_private.media_assets where id=a.preview_asset_id; end if;
  return jsonb_build_object('deleted',true);
 end if;
 raise exception 'unknown_action' using errcode='PT400';
end $$;

revoke all on function public.travel_worker(text,jsonb) from public,anon,authenticated;
grant execute on function public.travel_worker(text,jsonb) to service_role;
revoke all on function public.travel_media_cleanup(text,jsonb) from public,anon,authenticated;
grant execute on function public.travel_media_cleanup(text,jsonb) to service_role;
notify pgrst,'reload schema';
