-- Return the current site's reusable image assets to the authenticated admin UI.
-- Storage objects remain private: the Edge gateway signs each path before it is
-- returned to the browser. This RPC intentionally exposes only app-managed
-- media_assets, never an unscoped storage.objects listing.
create or replace function public.travel_asset_list(
  p_actor uuid,
  p_site_id uuid,
  p_limit integer default 12,
  p_offset integer default 0
) returns jsonb
language plpgsql security invoker set search_path='' as $$
#variable_conflict use_column
declare
  result jsonb;
  lim integer := least(greatest(coalesce(p_limit, 12), 1), 50);
  offst integer := least(greatest(coalesce(p_offset, 0), 0), 100000);
begin
  if p_site_id is null then
    raise exception 'site_required' using errcode='PT400';
  end if;
  perform app_private.require_member(p_site_id, p_actor);

  select coalesce(
    jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id),
    '[]'::jsonb
  )
  into result
  from (
    select
      a.id,
      a.created_at,
      a.bucket,
      a.object_path,
      a.metadata,
      array_remove(array[
        case when exists(
          select 1
          from app_private.sites st
          where st.id = a.site_id
            and (
              st.draft_settings->>'hero_asset_id' = a.id::text
              or st.published_settings->>'hero_asset_id' = a.id::text
              or st.draft_settings->'hero_asset_ids' ? a.id::text
              or st.published_settings->'hero_asset_ids' ? a.id::text
            )
        ) then 'home'::text end,
        case when exists(
          select 1
          from public.publication_assets pa
          where pa.asset_id = a.id and pa.purpose = 'cover'
        ) or exists(
          select 1
          from app_private.posts p
          where p.site_id = a.site_id
            and p.draft_content->>'cover_asset_id' = a.id::text
        ) then 'post-cover'::text end,
        case when exists(
          select 1
          from public.publication_assets pa
          where pa.asset_id = a.id and pa.purpose = 'body'
        ) or exists(
          select 1
          from app_private.posts p
          where p.site_id = a.site_id
            and jsonb_path_exists(
              p.draft_content,
              '$.**.asset_id ? (@ == $assetId)',
              jsonb_build_object('assetId', a.id::text)
            )
        ) then 'post-body'::text end,
        case when exists(
          select 1
          from public.publication_assets pa
          where pa.asset_id = a.id and pa.purpose = 'pdf-preview'
        ) then 'pdf-preview'::text end
      ], null) as usage
    from app_private.media_assets a
    where a.site_id = p_site_id
      and a.kind = 'image'
      and a.state = 'ready'
      and a.cleanup_state = 'active'
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
