begin;
create extension if not exists pgtap with schema extensions;
select plan(1);

create temporary table home_cover_ids as
select gen_random_uuid() as owner_id,
  gen_random_uuid() as site_id,
  gen_random_uuid() as other_site_id,
  array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()] as photo_ids,
  gen_random_uuid() as draft_photo_id,
  gen_random_uuid() as orphan_photo_id,
  gen_random_uuid() as other_site_photo_id,
  gen_random_uuid() as pending_photo_id;
grant select on home_cover_ids to service_role;

insert into auth.users(id,aud,role,email,created_at,updated_at)
select owner_id,'authenticated','authenticated','home-cover-test@example.invalid',now(),now()
from home_cover_ids;
insert into app_private.sites(id,slug,name)
select site_id,'test-'||site_id,'Home cover test' from home_cover_ids
union all
select other_site_id,'test-'||other_site_id,'Other site' from home_cover_ids;
insert into app_private.site_memberships(site_id,user_id,role)
select site_id,owner_id,'owner' from home_cover_ids;
insert into app_private.media_assets(id,site_id,owner_id,kind,bucket,object_path,state,metadata)
select photo_id,site_id,owner_id,'image','published-media',photo_id::text,'ready','{}'::jsonb
from home_cover_ids cross join lateral unnest(photo_ids) as photos(photo_id)
union all
select draft_photo_id,site_id,owner_id,'image','published-media',draft_photo_id::text,'ready','{}'::jsonb
from home_cover_ids
union all
select orphan_photo_id,site_id,owner_id,'image','published-media',orphan_photo_id::text,'ready','{}'::jsonb
from home_cover_ids
union all
select other_site_photo_id,other_site_id,owner_id,'image','published-media',other_site_photo_id::text,'ready','{}'::jsonb
from home_cover_ids
union all
select pending_photo_id,site_id,owner_id,'image','published-media',pending_photo_id::text,'processing','{}'::jsonb
from home_cover_ids;

set local role service_role;
do $$
declare
 t record;
 photo_count integer;
 photo_id uuid;
 version integer := 0;
 covers jsonb;
 settings jsonb;
 response jsonb;
 published jsonb;
begin
 select * into t from home_cover_ids;

 -- Existing one-photo settings remain readable after the migration.
 settings:=jsonb_build_object('template_id','A','hero_asset_id',(t.photo_ids)[1]);
 response:=public.travel_api('admin.settings.save',t.owner_id,
  jsonb_build_object('site_id',t.site_id,'version',version,'settings',settings));
 version:=(response->>'version')::integer;
 response:=public.travel_api('admin.settings.apply',t.owner_id,
  jsonb_build_object('site_id',t.site_id,'version',version));
 version:=(response->>'version')::integer;
 assert public.travel_home_asset(t.site_id,(t.photo_ids)[1])->>'id'=(t.photo_ids)[1]::text;

 -- Each size from one to four saves as a draft, then becomes public on apply.
 for photo_count in 1..4 loop
  select jsonb_agg(photo_id::text order by ordinal) into covers
  from unnest(t.photo_ids) with ordinality as photos(photo_id,ordinal)
  where ordinal<=photo_count;
  settings:=jsonb_build_object('template_id','A',
   'hero_asset_id',(t.photo_ids)[1],'hero_asset_ids',covers);
  if photo_count>1 then
   assert public.travel_home_asset(t.site_id,(t.photo_ids)[photo_count]) is null;
  end if;
  response:=public.travel_api('admin.settings.save',t.owner_id,
   jsonb_build_object('site_id',t.site_id,'version',version,'settings',settings));
  version:=(response->>'version')::integer;
  response:=public.travel_api('site.get',null,jsonb_build_object('site_id',t.site_id));
  assert response->'settings' is distinct from settings;
  response:=public.travel_api('admin.settings.apply',t.owner_id,
   jsonb_build_object('site_id',t.site_id,'version',version));
  version:=(response->>'version')::integer;
  response:=public.travel_api('site.get',null,jsonb_build_object('site_id',t.site_id));
  assert response->'settings'=settings;
  for photo_id in select id from unnest(t.photo_ids) with ordinality as photos(id,ordinal)
   where ordinal<=photo_count loop
   assert public.travel_home_asset(t.site_id,photo_id)->>'id'=photo_id::text;
  end loop;
 end loop;
 published:=settings;
 assert public.travel_home_asset(t.other_site_id,(t.photo_ids)[1]) is null;
 assert public.travel_home_asset(t.site_id,t.other_site_photo_id) is null;

 -- The array must contain at most four distinct, ready images from this site.
 begin
  perform public.travel_api('admin.settings.save',t.owner_id,
   jsonb_build_object('site_id',t.site_id,'version',version,'settings',
    jsonb_build_object('template_id','A','hero_asset_id',(t.photo_ids)[1],
     'hero_asset_ids',to_jsonb(t.photo_ids)||jsonb_build_array(t.draft_photo_id))));
  raise exception 'five home photos accepted';
 exception when sqlstate 'PT422' then assert sqlerrm='invalid_settings'; end;
 begin
  perform public.travel_api('admin.settings.save',t.owner_id,
   jsonb_build_object('site_id',t.site_id,'version',version,'settings',
    jsonb_build_object('template_id','A','hero_asset_id',(t.photo_ids)[1],
     'hero_asset_ids',jsonb_build_array((t.photo_ids)[1],(t.photo_ids)[1]))));
  raise exception 'duplicate home photo accepted';
 exception when sqlstate 'PT422' then assert sqlerrm='invalid_settings'; end;
 begin
  perform public.travel_api('admin.settings.save',t.owner_id,
   jsonb_build_object('site_id',t.site_id,'version',version,'settings',
    jsonb_build_object('template_id','A','hero_asset_id',(t.photo_ids)[1],
     'hero_asset_ids',(t.photo_ids)[1])));
  raise exception 'non-array home photos accepted';
 exception when sqlstate 'PT422' then assert sqlerrm='invalid_settings'; end;
 begin
  perform public.travel_api('admin.settings.save',t.owner_id,
   jsonb_build_object('site_id',t.site_id,'version',version,'settings',
    jsonb_build_object('template_id','A','hero_asset_id',(t.photo_ids)[2],
     'hero_asset_ids',jsonb_build_array((t.photo_ids)[1],(t.photo_ids)[2]))));
  raise exception 'mismatched primary photo accepted';
 exception when sqlstate 'PT422' then assert sqlerrm='invalid_settings'; end;
 begin
  perform public.travel_api('admin.settings.save',t.owner_id,
   jsonb_build_object('site_id',t.site_id,'version',version,'settings',
    jsonb_build_object('template_id','A','hero_asset_id',(t.photo_ids)[1],
     'hero_asset_ids',jsonb_build_array((t.photo_ids)[1],t.other_site_photo_id))));
  raise exception 'other site photo accepted';
 exception when sqlstate 'PT422' then assert sqlerrm='invalid_asset'; end;
 begin
  perform public.travel_api('admin.settings.save',t.owner_id,
   jsonb_build_object('site_id',t.site_id,'version',version,'settings',
    jsonb_build_object('template_id','A','hero_asset_id',(t.photo_ids)[1],
     'hero_asset_ids',jsonb_build_array((t.photo_ids)[1],t.pending_photo_id))));
  raise exception 'unready photo accepted';
 exception when sqlstate 'PT422' then assert sqlerrm='invalid_asset'; end;
 response:=public.travel_api('admin.settings.get',t.owner_id,
  jsonb_build_object('site_id',t.site_id));
 assert (response->>'version')::integer=version;
 assert response->'published'=published;

 -- A draft-only fifth photo is protected from cleanup but not public access.
 settings:=jsonb_build_object('template_id','A','hero_asset_id',(t.photo_ids)[1],
  'hero_asset_ids',jsonb_build_array((t.photo_ids)[1],t.draft_photo_id));
 response:=public.travel_api('admin.settings.save',t.owner_id,
  jsonb_build_object('site_id',t.site_id,'version',version,'settings',settings));
 assert public.travel_home_asset(t.site_id,t.draft_photo_id) is null;
 update app_private.media_assets set created_at=now()-interval '181 days'
 where id=any(t.photo_ids) or id in (t.draft_photo_id,t.orphan_photo_id);
 assert app_private.media_asset_has_refs(t.draft_photo_id);
 for photo_id in select unnest(t.photo_ids) loop
  assert app_private.media_asset_has_refs(photo_id);
 end loop;
 response:=public.travel_worker('cleanup_candidates','{}'::jsonb);
 assert exists(select 1 from jsonb_array_elements(response) as candidates(item)
  where (item->>'id')::uuid=t.orphan_photo_id);
 assert not exists(select 1 from jsonb_array_elements(response) as candidates(item)
  where (item->>'id')::uuid=any(t.photo_ids)
     or (item->>'id')::uuid=t.draft_photo_id);
 response:=public.travel_media_cleanup('cleanup_claim','{}'::jsonb);
 assert not exists(select 1 from app_private.media_assets
  where (id=any(t.photo_ids) or id=t.draft_photo_id) and cleanup_state<>'active');
 raise notice 'Home cover migration assertions passed';
end $$;

set local role anon;
do $$ begin
 begin
  perform public.travel_home_asset(gen_random_uuid(),gen_random_uuid());
  raise exception 'home asset RPC exposed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select pass('Home covers save, apply, public access and cleanup references passed');
select * from finish();
rollback;
