-- Keep the image library RPC unchanged for clients that have not upgraded.
-- A PDF is reusable only after both its document and first-page preview are ready.
create or replace function public.travel_pdf_asset_list(
  p_actor uuid,
  p_site_id uuid,
  p_limit integer default 12,
  p_offset integer default 0
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
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
      a.preview_asset_id,
      preview.bucket as preview_bucket,
      preview.object_path as preview_object_path,
      false as can_delete,
      null::timestamptz as delete_available_at,
      false as deletion_pending,
      array_remove(array[
        case when exists (
          select 1 from public.publication_assets pa
          where pa.asset_id = a.id and pa.purpose = 'pdf'
        ) or exists (
          select 1 from app_private.posts p
          where p.site_id = a.site_id
            and p.draft_content->>'pdf_asset_id' = a.id::text
        ) then 'post-pdf'::text end
      ], null) as usage
    from app_private.media_assets a
    join app_private.media_assets preview
      on preview.id = a.preview_asset_id
      and preview.site_id = a.site_id
      and preview.kind = 'image'
      and preview.state = 'ready'
      and preview.cleanup_state = 'active'
    where a.site_id = p_site_id
      and a.kind = 'pdf'
      and a.state = 'ready'
      and a.cleanup_state = 'active'
    order by a.created_at desc, a.id
    limit lim offset offst
  ) x;
  return result;
end $$;

revoke all on function public.travel_pdf_asset_list(uuid,uuid,integer,integer)
  from public, anon, authenticated;
grant execute on function public.travel_pdf_asset_list(uuid,uuid,integer,integer)
  to service_role;

notify pgrst, 'reload schema';
