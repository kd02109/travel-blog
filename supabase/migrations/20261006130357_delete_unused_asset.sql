-- Only the authenticated site's owner/admin can request permanent deletion.
-- Storage deletion happens outside the database transaction, so keep assets
-- fenced as `deleting` until the Edge gateway finishes. Pending rows remain
-- visible in the library so an owner/admin can retry after an interruption.
create or replace function public.travel_asset_delete(
  p_action text,
  p_actor uuid,
  p_site_id uuid,
  p_asset_id uuid,
  p_lease_until timestamptz default null
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
#variable_conflict use_column
declare
  asset app_private.media_assets;
  preview app_private.media_assets;
  ids uuid[];
  lease timestamptz;
  targets jsonb;
begin
  if p_site_id is null or p_asset_id is null then
    raise exception 'invalid_input' using errcode = 'PT400';
  end if;

  if p_action = 'begin' then
    perform app_private.require_member(
      p_site_id, p_actor, array['owner', 'admin']::text[]
    );
    select a.* into asset
    from app_private.media_assets a
    where a.id = p_asset_id and a.site_id = p_site_id
    for update;
    -- A retry after a completed delete remains successful, without revealing
    -- whether an asset ID belongs to another site.
    if not found then
      return jsonb_build_object('deleted', true);
    end if;
    if asset.kind <> 'image' or asset.state <> 'ready' or
       asset.object_path not like
         p_site_id::text || '/' || asset.id::text || '/%' then
      raise exception 'invalid_asset' using errcode = 'PT422';
    end if;
    if asset.cleanup_state = 'deleting' and
       asset.cleanup_lease_until > now() then
      raise exception 'asset_delete_in_progress' using errcode = 'PT409';
    end if;
    -- Signed upload URLs can recreate the original object while their token
    -- remains valid. Wait beyond the two-hour token lifetime before deleting.
    if asset.cleanup_state = 'active' and
       asset.created_at + interval '2 hours 5 minutes' > now() then
      raise exception 'asset_upload_token_active' using errcode = 'PT409';
    end if;

    select coalesce(array_agg(a.id order by a.id), array[asset.id]) into ids
    from app_private.media_assets a
    where a.id = asset.id or a.id = asset.preview_asset_id;
    perform 1 from app_private.media_assets a
    where a.id = any(ids) order by a.id for update;
    if asset.preview_asset_id is not null then
      select a.* into preview from app_private.media_assets a
      where a.id = asset.preview_asset_id;
    end if;
    if app_private.media_asset_has_refs(asset.id) or
       (preview.id is not null and
        app_private.media_asset_has_refs(preview.id, asset.id)) then
      raise exception 'asset_in_use' using errcode = 'PT409';
    end if;
    if exists(
      select 1 from app_private.outbox_jobs j
      where j.resource_id = any(ids) and j.status in ('queued', 'running')
    ) then
      raise exception 'asset_processing' using errcode = 'PT409';
    end if;

    lease := now() + interval '5 minutes';
    update app_private.media_assets a
    set cleanup_state = 'deleting', cleanup_after = null,
        cleanup_lease_until = lease
    where a.id = any(ids);
    targets := jsonb_build_array(jsonb_build_object(
      'bucket', asset.bucket,
      'prefix', asset.site_id::text || '/' || asset.id::text
    ));
    if preview.id is not null then
      -- PDF previews currently live below the parent's path. Include both
      -- prefixes so a future thumbnail layout can be removed safely too.
      targets := targets || jsonb_build_array(
        jsonb_build_object(
          'bucket', preview.bucket,
          'prefix', asset.site_id::text || '/' || asset.id::text
        ),
        jsonb_build_object(
          'bucket', preview.bucket,
          'prefix', asset.site_id::text || '/' || preview.id::text
        )
      );
    end if;
    return jsonb_build_object(
      'deleted', false,
      'lease_until', lease,
      'targets', targets
    );

  elsif p_action = 'finalize' then
    select a.* into asset from app_private.media_assets a
    where a.id = p_asset_id and a.site_id = p_site_id for update;
    if not found then
      return jsonb_build_object('deleted', true);
    end if;
    if p_lease_until is null or asset.cleanup_state <> 'deleting' or
       asset.cleanup_lease_until is distinct from p_lease_until then
      raise exception 'stale_delete_lease' using errcode = 'PT409';
    end if;
    if asset.preview_asset_id is not null then
      select a.* into preview from app_private.media_assets a
      where a.id = asset.preview_asset_id for update;
    end if;
    if app_private.media_asset_has_refs(asset.id) or
       (preview.id is not null and
        app_private.media_asset_has_refs(preview.id, asset.id)) then
      -- Keep the deletion fence if an out-of-band writer introduced a ref
      -- after Storage removal. Restoring `active` could expose a broken image.
      raise exception 'asset_in_use' using errcode = 'PT409';
    end if;
    delete from app_private.media_assets a where a.id = asset.id;
    if preview.id is not null then
      delete from app_private.media_assets a where a.id = preview.id;
    end if;
    insert into app_private.audit_events(
      site_id, actor_id, action, resource_id, changes
    ) values (
      p_site_id, p_actor, 'asset.delete', p_asset_id,
      jsonb_build_object('kind', 'image')
    );
    return jsonb_build_object('deleted', true);

  elsif p_action = 'release' then
    -- A failed Storage request might have removed some files. Keep the fence
    -- and let an immediate retry resume from Storage.
    update app_private.media_assets a
    set cleanup_lease_until = now()
    where a.id = p_asset_id and a.site_id = p_site_id
      and a.cleanup_state = 'deleting'
      and a.cleanup_lease_until = p_lease_until;
    return jsonb_build_object('released', true);
  end if;
  raise exception 'unknown_action' using errcode = 'PT400';
end $$;

revoke all on function public.travel_asset_delete(text,uuid,uuid,uuid,timestamptz)
  from public, anon, authenticated;
grant execute on function public.travel_asset_delete(text,uuid,uuid,uuid,timestamptz)
  to service_role;

-- The visible usage badges cover the current home and posts. A hidden
-- historical revision, profile reference, or active media job also prevents
-- deletion, so expose the same authoritative predicate for the UI.
create or replace function public.travel_asset_list(
  p_actor uuid,
  p_site_id uuid,
  p_limit integer default 12,
  p_offset integer default 0
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
#variable_conflict use_column
declare
  result jsonb;
  lim integer := least(greatest(coalesce(p_limit, 12), 1), 50);
  offst integer := least(greatest(coalesce(p_offset, 0), 0), 100000);
begin
  if p_site_id is null then
    raise exception 'site_required' using errcode = 'PT400';
  end if;
  perform app_private.require_member(p_site_id, p_actor);

  select coalesce(
    jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id),
    '[]'::jsonb
  ) into result
  from (
    select
      a.id,
      a.created_at,
      a.bucket,
      a.object_path,
      a.metadata,
      a.cleanup_state = 'deleting' as deletion_pending,
      case when a.cleanup_state = 'active' and
        a.created_at + interval '2 hours 5 minutes' > now()
        then a.created_at + interval '2 hours 5 minutes'
        else null end as delete_available_at,
      (((a.cleanup_state = 'active' and
          a.created_at + interval '2 hours 5 minutes' <= now()) or
        (a.cleanup_state = 'deleting' and
          (a.cleanup_lease_until is null or a.cleanup_lease_until <= now())))
        and a.object_path like a.site_id::text || '/' || a.id::text || '/%'
        and not app_private.media_asset_has_refs(a.id)
        and (a.preview_asset_id is null or not
          app_private.media_asset_has_refs(a.preview_asset_id, a.id))
        and not exists(
          select 1 from app_private.outbox_jobs j
          where j.resource_id in (a.id, a.preview_asset_id)
            and j.status in ('queued', 'running')
        )) as can_delete,
      array_remove(array[
        case when exists(
          select 1 from app_private.sites st
          where st.id = a.site_id
            and (
              st.draft_settings->>'hero_asset_id' = a.id::text
              or st.published_settings->>'hero_asset_id' = a.id::text
              or st.draft_settings->'hero_asset_ids' ? a.id::text
              or st.published_settings->'hero_asset_ids' ? a.id::text
            )
        ) then 'home'::text end,
        case when exists(
          select 1 from public.publication_assets pa
          where pa.asset_id = a.id and pa.purpose = 'cover'
        ) or exists(
          select 1 from app_private.posts p
          where p.site_id = a.site_id
            and p.draft_content->>'cover_asset_id' = a.id::text
        ) then 'post-cover'::text end,
        case when exists(
          select 1 from public.publication_assets pa
          where pa.asset_id = a.id and pa.purpose = 'body'
        ) or exists(
          select 1 from app_private.posts p
          where p.site_id = a.site_id
            and jsonb_path_exists(
              p.draft_content,
              '$.**.asset_id ? (@ == $assetId)',
              jsonb_build_object('assetId', a.id::text)
            )
        ) then 'post-body'::text end,
        case when exists(
          select 1 from public.publication_assets pa
          where pa.asset_id = a.id and pa.purpose = 'pdf-preview'
        ) then 'pdf-preview'::text end
      ], null) as usage
    from app_private.media_assets a
    where a.site_id = p_site_id
      and a.kind = 'image'
      and a.state = 'ready'
      and a.cleanup_state in ('active', 'deleting')
    order by a.created_at desc, a.id
    limit lim offset offst
  ) x;
  return result;
end $$;

revoke all on function public.travel_asset_list(uuid,uuid,integer,integer)
  from public, anon, authenticated;
grant execute on function public.travel_asset_list(uuid,uuid,integer,integer)
  to service_role;

notify pgrst, 'reload schema';
