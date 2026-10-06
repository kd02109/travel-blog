-- Home covers can use an ordered set of up to four photos. Keep the original
-- hero_asset_id for published sites that have not edited their cover yet.
create or replace function app_private.check_settings(p_site uuid,p_settings jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare k text; a uuid; image_id text; image_ids text[]:=array[]::text[];
begin
 if jsonb_typeof(p_settings) is distinct from 'object'
    or p_settings->>'template_id' is null
    or p_settings->>'template_id' not in ('A','B','C','D')
    or octet_length(p_settings::text)>20000 then
  raise exception 'invalid_settings' using errcode='PT422';
 end if;
 for k in select jsonb_object_keys(p_settings) loop
  if k not in ('template_id','title','description','hero_asset_id','hero_asset_ids','featured_post_id') then
   raise exception 'unknown_setting' using errcode='PT422';
  end if;
 end loop;
 if length(coalesce(p_settings->>'title',''))>150
    or length(coalesce(p_settings->>'description',''))>500 then
  raise exception 'invalid_settings' using errcode='PT422';
 end if;
 a:=nullif(p_settings->>'hero_asset_id','')::uuid;
 if a is not null and not exists(
  select 1 from app_private.media_assets
  where id=a and site_id=p_site and kind='image' and state='ready' and cleanup_state='active'
 ) then raise exception 'invalid_asset' using errcode='PT422'; end if;
 if p_settings ? 'hero_asset_ids' then
  if jsonb_typeof(p_settings->'hero_asset_ids') is distinct from 'array' then
   raise exception 'invalid_settings' using errcode='PT422';
  end if;
  if jsonb_array_length(p_settings->'hero_asset_ids')>4 then
   raise exception 'invalid_settings' using errcode='PT422';
  end if;
  for image_id in select jsonb_array_elements_text(p_settings->'hero_asset_ids') loop
   if image_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or image_id=any(image_ids) then
    raise exception 'invalid_settings' using errcode='PT422';
   end if;
   image_ids:=array_append(image_ids,image_id);
   a:=image_id::uuid;
   if not exists(
    select 1 from app_private.media_assets
    where id=a and site_id=p_site and kind='image' and state='ready' and cleanup_state='active'
   ) then raise exception 'invalid_asset' using errcode='PT422'; end if;
  end loop;
  if cardinality(image_ids)>0 and p_settings->>'hero_asset_id' is distinct from image_ids[1] then
   raise exception 'invalid_settings' using errcode='PT422';
  end if;
 end if;
 a:=nullif(p_settings->>'featured_post_id','')::uuid;
 if a is not null and not exists(
  select 1 from app_private.posts where id=a and site_id=p_site and app_private.is_public(id)
 ) then raise exception 'invalid_featured_post' using errcode='PT422'; end if;
end $$;

-- Used only by the API's service role to sign photos listed in the published
-- cover. Draft cover photos remain staff-only through travel_api.
create or replace function public.travel_home_asset(p_site_id uuid,p_asset_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select to_jsonb(a)
 from app_private.media_assets a
 join app_private.sites s on s.id=a.site_id
 where a.id=p_asset_id and a.site_id=p_site_id and a.kind='image'
   and a.state='ready' and a.cleanup_state='active' and s.status='active'
   and (
    s.published_settings->>'hero_asset_id'=a.id::text
    or exists(
     select 1 from jsonb_array_elements_text(
      case when jsonb_typeof(s.published_settings->'hero_asset_ids')='array'
       then s.published_settings->'hero_asset_ids' else '[]'::jsonb end
     ) image_id where image_id.value=a.id::text
    )
   )
$$;

revoke all on function public.travel_home_asset(uuid,uuid) from public,anon,authenticated;
grant execute on function public.travel_home_asset(uuid,uuid) to service_role;
notify pgrst,'reload schema';
