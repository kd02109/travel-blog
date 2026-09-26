begin;
create temporary table test_ids as select gen_random_uuid() as owner_id,gen_random_uuid() as editor_id,gen_random_uuid() as outsider_id,gen_random_uuid() as site_id,gen_random_uuid() as other_site_id,gen_random_uuid() as asset_id,gen_random_uuid() as metadata_asset_id;
grant select on test_ids to service_role;
insert into auth.users(id,aud,role,email,created_at,updated_at) select owner_id,'authenticated','authenticated','owner-test@example.invalid',now(),now() from test_ids union all select editor_id,'authenticated','authenticated','editor-test@example.invalid',now(),now() from test_ids union all select outsider_id,'authenticated','authenticated','outsider-test@example.invalid',now(),now() from test_ids;
insert into app_private.sites(id,slug,name) select site_id,'test-'||site_id,'Test' from test_ids union all select other_site_id,'test-'||other_site_id,'Other' from test_ids;
insert into app_private.site_memberships(site_id,user_id,role) select site_id,owner_id,'owner' from test_ids union all select site_id,editor_id,'editor' from test_ids;
insert into app_private.media_assets(id,site_id,owner_id,kind,bucket,object_path,state,metadata) select asset_id,site_id,owner_id,'image','published-media',asset_id::text,'ready','{"mime":"image/png","bytes":100,"width":10,"height":10}'::jsonb from test_ids union all select metadata_asset_id,site_id,owner_id,'image','published-media',metadata_asset_id::text,'ready','{"mime":"image/png","bytes":100,"width":10,"height":10}'::jsonb from test_ids;
set local role service_role;
do $$
declare t record; r jsonb; pid uuid; base_pid uuid; cid uuid; ver int; rid uuid; req uuid:=gen_random_uuid(); d jsonb; base_d jsonb; meta_case record; hash text:='$argon2id$v=19$m=19456,t=2,p=1$example$example';
begin
 select * into t from test_ids;
 r:=public.travel_api('site.get',null,jsonb_build_object('site_id',t.site_id)); assert r->>'name'='Test';
 r:=public.travel_api('me',t.owner_id,'{}'); assert jsonb_array_length(r->'memberships')=1;
 perform public.travel_api('profile.save',t.owner_id,'{"display_name":"테스트"}');
 begin perform public.travel_api('admin.post.create',t.outsider_id,jsonb_build_object('site_id',t.site_id,'kind','article')); raise exception 'cross-site authorization failed'; exception when sqlstate 'PT403' then null; end;
 r:=public.travel_api('admin.post.create',t.editor_id,jsonb_build_object('site_id',t.site_id,'kind','article')); pid:=(r->>'id')::uuid;
 begin perform public.travel_api('admin.post.publish',t.outsider_id,jsonb_build_object('id',pid,'version',0)); raise exception 'outsider publish allowed'; exception when sqlstate 'PT403' then null; end;
 begin perform public.travel_api('admin.post.status',t.outsider_id,jsonb_build_object('id',pid,'version',0,'status','trashed')); raise exception 'outsider status change allowed'; exception when sqlstate 'PT403' then null; end;
 d:=jsonb_build_object('title','테스트 글','slug','test-post','category_code','day-walk','tags',jsonb_build_array('서울'),'blocks',jsonb_build_array(jsonb_build_object('type','paragraph','content','hello')),'metadata',jsonb_build_object('region','서울','visited_on','2026-09-18'),'cover_asset_id',t.asset_id);
 base_pid:=pid; base_d:=d;
 r:=public.travel_api('admin.post.save',t.editor_id,jsonb_build_object('id',pid,'version',0,'content',d,'checkpoint',true)); assert (r->>'lock_version')::int=1;
 r:=public.travel_admin_posts(t.editor_id,jsonb_build_object('site_id',t.site_id,'category','day-walk','status','draft','search','테스트')); assert jsonb_array_length(r)=1 and r->0->>'category_code'='day-walk';
 r:=public.travel_admin_posts(t.editor_id,jsonb_build_object('site_id',t.site_id,'category','food-cafe')); assert jsonb_array_length(r)=0;
 begin perform public.travel_admin_posts(t.outsider_id,jsonb_build_object('site_id',t.site_id)); raise exception 'admin listing authorization failed'; exception when sqlstate 'PT403' then null; end;
 begin perform public.travel_api('admin.post.save',t.editor_id,jsonb_build_object('id',pid,'version',0,'content',d)); raise exception 'lost update allowed'; exception when sqlstate 'PT409' then null; end;
 r:=public.travel_api('posts.list',null,jsonb_build_object('site_id',t.site_id)); assert jsonb_array_length(r)=0;
 r:=public.travel_api('admin.post.publish',t.editor_id,jsonb_build_object('id',pid,'version',1,'rendered_html','<p>hello</p>','asset_ids','[]'::jsonb)); rid:=(r->>'revision_id')::uuid;
 r:=public.travel_api('post.get',null,jsonb_build_object('site_id',t.site_id,'id',pid)); assert r->>'title'='테스트 글';
 r:=public.travel_api('posts.list',null,jsonb_build_object('site_id',t.site_id)); assert jsonb_array_length(r)=1;
 for meta_case in select * from (values
  ('day-walk','{"region":"서울","visited_on":"2026-09-18"}'::jsonb,'{"region":"서울","visited_on":"2026-02-30"}'::jsonb,'invalid_date'),
  ('overnight-trip','{"region":"제주","start_date":"2026-09-18","end_date":"2026-09-20"}'::jsonb,'{"region":"제주","start_date":"2026-09-20","end_date":"2026-09-18"}'::jsonb,'invalid_dates'),
  ('food-cafe','{"region":"강릉","visited_on":"2026-09-18","place_name":"바다 카페","venue_type":"cafe"}'::jsonb,'{"region":"강릉","visited_on":"2026-09-18","place_name":"바다 카페","venue_type":"bar"}'::jsonb,'invalid_venue'),
  ('stay-review','{"region":"제주","check_in":"2026-09-18","check_out":"2026-09-20","place_name":"바다 숙소"}'::jsonb,'{"region":"제주","check_in":"2026-09-18","check_out":"2026-09-20"}'::jsonb,'missing_place')
 ) as metadata_cases(category,valid_metadata,invalid_metadata,expected_error) loop
  d:=jsonb_build_object('title','메타데이터 검증','slug','metadata-'||meta_case.category,'category_code',meta_case.category,'cover_asset_id',t.metadata_asset_id,'blocks',jsonb_build_array(jsonb_build_object('type','paragraph','content','검증 본문')),'metadata',meta_case.invalid_metadata);
  r:=public.travel_api('admin.post.create',t.editor_id,jsonb_build_object('site_id',t.site_id,'kind','article','content',d)); pid:=(r->>'id')::uuid;
  begin
   perform public.travel_api('admin.post.publish',t.editor_id,jsonb_build_object('id',pid,'version',0,'rendered_html','<p>검증 본문</p>','asset_ids','[]'::jsonb));
   raise exception 'invalid category metadata accepted: %',meta_case.category;
  exception
   when sqlstate '22007' or sqlstate '22008' then assert meta_case.expected_error='invalid_date';
   when sqlstate 'PT422' then assert sqlerrm=meta_case.expected_error;
  end;
  d:=jsonb_set(d,'{metadata}',meta_case.valid_metadata);
  r:=public.travel_api('admin.post.save',t.editor_id,jsonb_build_object('id',pid,'version',0,'content',d));
  r:=public.travel_api('admin.post.publish',t.editor_id,jsonb_build_object('id',pid,'version',1,'rendered_html','<p>검증 본문</p>','asset_ids','[]'::jsonb));
 end loop;
 r:=public.travel_api('admin.post.save',t.editor_id,jsonb_build_object('id',base_pid,'version',2,'content',base_d||'{"title":"아직 비공개 수정"}'::jsonb));
 r:=public.travel_api('post.get',null,jsonb_build_object('site_id',t.site_id,'slug','test-post')); assert r->>'title'='테스트 글';
 r:=public.travel_api('comment.create',null,jsonb_build_object('id',base_pid,'body','댓글','guest_name','방문자','password_hash',hash,'actor_hash',repeat('a',64),'request_hash','abc','request_key',req)); cid:=(r->>'id')::uuid;
 r:=public.travel_api('comment.create',null,jsonb_build_object('id',base_pid,'body','댓글','guest_name','방문자','password_hash',hash,'actor_hash',repeat('a',64),'request_hash','abc','request_key',req)); assert (r->>'duplicate')::boolean;
 r:=public.travel_api('comments.list',null,jsonb_build_object('id',base_pid)); assert jsonb_array_length(r)=1; assert not (r->0 ? 'request_hash');
 begin perform public.travel_api('comment.edit',t.outsider_id,jsonb_build_object('id',cid,'version',0,'body','bad')); raise exception 'comment hijack allowed'; exception when sqlstate 'PT403' then null; end;
 r:=public.travel_api('comment.edit',null,jsonb_build_object('id',cid,'version',0,'body','수정','guest_verified',true)); assert (r->>'version')::int=1;
 r:=public.travel_api('comment.report',t.outsider_id,jsonb_build_object('id',cid,'reason','spam'));
 r:=public.travel_api('admin.reports',t.owner_id,jsonb_build_object('site_id',t.site_id)); assert jsonb_array_length(r)=1;
 perform public.travel_api('admin.report.resolve',t.owner_id,jsonb_build_object('site_id',t.site_id,'id',r->0->>'id','status','resolved'));
 r:=public.travel_api('like.set',t.outsider_id,jsonb_build_object('id',base_pid,'liked',true)); assert (r->>'count')::int=1;
 r:=public.travel_api('like.set',t.outsider_id,jsonb_build_object('id',base_pid,'liked',true)); assert (r->>'count')::int=1;
 r:=public.travel_api('like.set',t.outsider_id,jsonb_build_object('id',base_pid,'liked',false)); assert (r->>'count')::int=0;
 begin perform public.travel_api('admin.member.set',t.editor_id,jsonb_build_object('site_id',t.site_id,'user_id',t.editor_id,'role','owner')); raise exception 'self escalation allowed'; exception when sqlstate 'PT403' then null; end;
 begin perform public.travel_api('admin.member.set',t.owner_id,jsonb_build_object('site_id',t.site_id,'user_id',t.owner_id,'role','editor')); raise exception 'last owner removal allowed'; exception when sqlstate 'PT409' then null; end;
 r:=public.travel_api('admin.settings.save',t.owner_id,jsonb_build_object('site_id',t.site_id,'version',0,'settings',jsonb_build_object('template_id','A')));
 r:=public.travel_api('site.get',null,jsonb_build_object('site_id',t.site_id)); assert r->'settings'->>'template_id'='D';
 perform public.travel_api('admin.settings.apply',t.owner_id,jsonb_build_object('site_id',t.site_id,'version',1));
 r:=public.travel_api('site.get',null,jsonb_build_object('site_id',t.site_id)); assert r->'settings'->>'template_id'='A';
 r:=public.travel_api('asset.access',null,jsonb_build_object('id',t.asset_id)); assert r->>'state'='ready';
 r:=public.travel_api('admin.post.status',t.editor_id,jsonb_build_object('id',base_pid,'version',3,'status','private'));
 begin perform public.travel_api('post.get',null,jsonb_build_object('site_id',t.site_id,'id',base_pid)); raise exception 'private leaked'; exception when sqlstate 'PT404' then null; end;
 begin perform public.travel_api('asset.access',null,jsonb_build_object('id',t.asset_id)); raise exception 'private asset leaked'; exception when sqlstate 'PT401' then null; end;
 r:=public.travel_api('rate.consume',null,'{"key_hash":"test","action":"test","window_seconds":60,"max":1}'); assert (r->>'allowed')::boolean;
 r:=public.travel_api('rate.consume',null,'{"key_hash":"test","action":"test","window_seconds":60,"max":1}'); assert not (r->>'allowed')::boolean;
 raise notice 'API integration assertions passed';
end $$;
set local role anon;
do $$ begin
 begin perform public.travel_api('site.get',null,'{}'); raise exception 'RPC exposed'; exception when insufficient_privilege then null; end;
 begin perform public.travel_admin_posts(gen_random_uuid(),'{}'); raise exception 'admin listing RPC exposed'; exception when insufficient_privilege then null; end;
 begin perform 1 from public.comments; raise exception 'comments exposed'; exception when insufficient_privilege then null; end;
 begin perform 1 from app_private.posts; raise exception 'drafts exposed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
