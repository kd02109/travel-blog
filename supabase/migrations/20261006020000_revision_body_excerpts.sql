-- Revision previews should describe the edited body, including photos, rather than repeating a heading.
-- The list action calls this helper at read time, so existing revisions gain the new preview immediately.
create or replace function app_private.revision_excerpt(p_snapshot jsonb) returns text
language sql immutable set search_path='' as $$
 with recursive document_blocks as (
  select item.value as block, lpad(item.ordinality::text,8,'0') as sort_path
  from jsonb_array_elements(
   case when jsonb_typeof(p_snapshot->'blocks')='array'
    then p_snapshot->'blocks' else '[]'::jsonb end
  ) with ordinality as item(value,ordinality)
  union all
  select child.value, parent.sort_path||'.'||lpad(child.ordinality::text,8,'0')
  from document_blocks parent
  cross join lateral jsonb_array_elements(
   case when jsonb_typeof(parent.block->'children')='array'
    then parent.block->'children' else '[]'::jsonb end
  ) with ordinality as child(value,ordinality)
 ), body_blocks as (
  select sort_path,
   nullif(btrim(case
    when jsonb_typeof(block->'content')='string' then block->>'content'
    when jsonb_typeof(block->'content')='array' then (
     select string_agg(coalesce(part.value->>'text',''),'' order by part.ordinality)
     from jsonb_array_elements(block->'content') with ordinality as part(value,ordinality)
     where part.value->>'type'='text'
    )
    else '' end),'') as body_text
  from document_blocks
  where block->>'type' in ('paragraph','bulletListItem','numberedListItem','quote','codeBlock')
 ), preview as (
  select string_agg(body_text,' · ' order by sort_path) as body_text
  from (
   select sort_path,body_text from body_blocks
   where body_text is not null order by sort_path limit 2
  ) first_blocks
 ), photos as (
  select count(*)::integer as photo_count
  from document_blocks where block->>'type'='image'
 )
 select case
  when preview.body_text is not null and photos.photo_count>0
   then left(preview.body_text,110)||' · 사진 '||photos.photo_count::text||'장'
  when preview.body_text is not null then left(preview.body_text,140)
  when photos.photo_count>0 then '사진 '||photos.photo_count::text||'장'
  else left(coalesce(nullif(p_snapshot->>'summary',''),'본문 없음'),140)
 end
 from preview cross join photos
$$;
revoke all on function app_private.revision_excerpt(jsonb) from public,anon,authenticated;
grant execute on function app_private.revision_excerpt(jsonb) to service_role;
