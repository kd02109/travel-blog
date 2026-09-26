-- Disambiguate the PL/pgSQL site argument from posts.site_id.
create or replace function public.travel_admin_posts(p_actor uuid, p_input jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_site_id uuid := nullif(p_input->>'site_id', '')::uuid;
  list_status text := nullif(p_input->>'status', '');
  list_category text := nullif(p_input->>'category', '');
  search_text text := lower(btrim(coalesce(p_input->>'search', '')));
  page_limit integer := least(greatest(coalesce(nullif(p_input->>'limit', '')::integer, 12), 1), 50);
  page_offset integer := least(greatest(coalesce(nullif(p_input->>'offset', '')::integer, 0), 0), 100000);
  result jsonb;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' or target_site_id is null then
    raise exception 'invalid_input' using errcode = 'PT400';
  end if;
  if list_status is not null and list_status not in ('draft', 'published', 'private', 'trashed') then
    raise exception 'invalid_status' using errcode = 'PT422';
  end if;
  if list_category is not null and list_category not in ('day-walk', 'overnight-trip', 'food-cafe', 'stay-review', 'itinerary-pdf') then
    raise exception 'invalid_category' using errcode = 'PT422';
  end if;
  if length(search_text) > 100 then
    raise exception 'invalid_search' using errcode = 'PT422';
  end if;

  perform app_private.require_member(target_site_id, p_actor);

  select coalesce(jsonb_agg(to_jsonb(listed_posts)), '[]'::jsonb)
  into result
  from (
    select
      p.id,
      p.kind,
      p.status,
      nullif(p.draft_content->>'category_code', '') as category_code,
      nullif(p.draft_content->>'title', '') as title,
      p.lock_version,
      p.updated_at,
      p.first_published_at
    from app_private.posts p
    where p.site_id = target_site_id
      and (list_status is null or p.status = list_status)
      and (list_category is null or p.draft_content->>'category_code' = list_category)
      and (
        search_text = ''
        or position(search_text in lower(coalesce(p.draft_content->>'title', ''))) > 0
        or position(search_text in lower(coalesce(p.draft_content->>'slug', ''))) > 0
      )
    order by p.updated_at desc, p.id
    limit page_limit offset page_offset
  ) as listed_posts;

  return result;
end;
$$;

revoke all on function public.travel_admin_posts(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.travel_admin_posts(uuid, jsonb) to service_role;
