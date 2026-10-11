-- Avoid colliding with the PL/pgSQL child record when claiming a matured quarantine.
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
     'preview',case when preview_asset.id is null then null else jsonb_build_object('id',preview_asset.id,'bucket',preview_asset.bucket) end,
     'lease_until',lease)
    into result from app_private.media_assets root
    left join app_private.media_assets preview_asset on preview_asset.id=root.preview_asset_id where root.id=a.id;
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

notify pgrst,'reload schema';
