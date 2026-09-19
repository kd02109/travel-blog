begin;
create temporary table constraint_ids as select gen_random_uuid() u,gen_random_uuid() s,gen_random_uuid() s2,gen_random_uuid() a,gen_random_uuid() a2,gen_random_uuid() pdf,gen_random_uuid() preview;
insert into auth.users(id,aud,role,email,created_at,updated_at) select u,'authenticated','authenticated','constraint-test@example.invalid',now(),now() from constraint_ids;
insert into app_private.sites(id,slug,name) select s,'t-'||s,'test' from constraint_ids union all select s2,'t-'||s2,'other' from constraint_ids;
insert into app_private.site_memberships(site_id,user_id,role) select s,u,'owner' from constraint_ids;
insert into app_private.media_assets(id,site_id,owner_id,kind,bucket,object_path,state,metadata) select a,s,u,'image','published-media',a::text,'ready','{}'::jsonb from constraint_ids union all select a2,s2,u,'image','published-media',a2::text,'ready','{}'::jsonb from constraint_ids union all select preview,s,u,'image','documents-private',preview::text,'ready','{}'::jsonb from constraint_ids;
insert into app_private.media_assets(id,site_id,owner_id,kind,bucket,object_path,state,metadata,preview_asset_id) select pdf,s,u,'pdf','documents-private',pdf::text,'ready','{"page_count":2}',preview from constraint_ids;
grant select on constraint_ids to service_role;
set local role service_role;
do $$
declare t record; r jsonb; d jsonb; p uuid; c uuid; reply uuid; p2 uuid; ar jsonb; j jsonb;
begin
 select * into t from constraint_ids;
 d:=jsonb_build_object('title','PDF','slug','pdf','category_code','itinerary-pdf','pdf_asset_id',t.pdf);
 r:=public.travel_api('admin.post.create',t.u,jsonb_build_object('site_id',t.s,'kind','pdf','content',d));p:=(r->>'id')::uuid;
 perform public.travel_api('admin.post.publish',t.u,jsonb_build_object('id',p,'version',0,'asset_ids','[]'::jsonb));
 begin perform public.travel_api('like.set',t.u,jsonb_build_object('id',p,'liked',true));raise exception 'PDF like allowed';exception when sqlstate 'PT403' then null;end;
 begin perform public.travel_api('comment.create',t.u,jsonb_build_object('id',p,'body','comment','request_key',gen_random_uuid(),'request_hash','h'));raise exception 'PDF comment allowed';exception when sqlstate 'PT403' then null;end;
 perform public.travel_api('admin.post.save',t.u,jsonb_build_object('id',p,'version',1,'content',d||jsonb_build_object('pdf_asset_id',gen_random_uuid())));
 begin perform public.travel_api('admin.post.publish',t.u,jsonb_build_object('id',p,'version',2));raise exception 'invalid PDF accepted';exception when sqlstate 'PT422' then null;end;
 r:=public.travel_api('post.get',null,jsonb_build_object('site_id',t.s,'id',p));assert (r->>'pdf_asset_id')::uuid=t.pdf;
 d:=jsonb_build_object('title','article','slug','article','category_code','day-walk','cover_asset_id',t.a2,'blocks',jsonb_build_array(jsonb_build_object('type','paragraph','content','body')),'metadata',jsonb_build_object('region','서울','visited_on','2026-09-19'));
 r:=public.travel_api('admin.post.create',t.u,jsonb_build_object('site_id',t.s,'kind','article','content',d));p2:=(r->>'id')::uuid;
 begin perform public.travel_api('admin.post.publish',t.u,jsonb_build_object('id',p2,'version',0,'rendered_html','body'));raise exception 'cross site cover allowed';exception when sqlstate 'PT422' then null;end;
 perform public.travel_api('admin.post.save',t.u,jsonb_build_object('id',p2,'version',0,'content',d||jsonb_build_object('cover_asset_id',t.a)));
 perform public.travel_api('admin.post.publish',t.u,jsonb_build_object('id',p2,'version',1,'rendered_html','body','asset_ids','[]'::jsonb));
 r:=public.travel_api('comment.create',t.u,jsonb_build_object('id',p2,'body','root','request_key',gen_random_uuid(),'request_hash','r'));c:=(r->>'id')::uuid;
 r:=public.travel_api('comment.create',t.u,jsonb_build_object('id',p2,'body','reply','parent_id',c,'request_key',gen_random_uuid(),'request_hash','s'));reply:=(r->>'id')::uuid;
 begin perform public.travel_api('comment.create',t.u,jsonb_build_object('id',p2,'body','deep','parent_id',reply,'request_key',gen_random_uuid(),'request_hash','t'));raise exception 'deep reply allowed';exception when sqlstate 'PT422' then null;end;
 perform public.travel_api('admin.comment.moderate',t.u,jsonb_build_object('site_id',t.s,'id',c,'version',0,'status','hidden'));
 r:=public.travel_api('post.get',null,jsonb_build_object('site_id',t.s,'id',p2));assert (r->>'comment_count')::int=1;
 r:=public.travel_api('asset.create',t.u,jsonb_build_object('site_id',t.s,'kind','image'));ar:=r;
 perform public.travel_api('asset.complete',t.u,jsonb_build_object('id',ar->>'id','metadata',jsonb_build_object('mime','image/png','bytes',8)));
 -- Existing cache jobs may be claimed first; settle them inside this rollback-only test.
 loop
 j:=public.travel_worker('claim','{}');exit when j is null or j->'job'->>'type'='process_asset';
 perform public.travel_worker('complete',jsonb_build_object('job_id',j->'job'->>'id','attempt',j->'job'->>'attempts','lease_until',j->'job'->>'lease_until'));
 end loop;
 assert j->'job'->>'type'='process_asset';
 begin perform public.travel_worker('complete',jsonb_build_object('job_id',j->'job'->>'id','attempt',0,'lease_until',j->'job'->>'lease_until'));raise exception 'stale worker accepted';exception when sqlstate 'PT409' then null;end;
 perform public.travel_worker('fail',jsonb_build_object('job_id',j->'job'->>'id','attempt',j->'job'->>'attempts','lease_until',j->'job'->>'lease_until'));
end $$;
set local role authenticated;
do $$ begin
 begin perform public.travel_worker('claim','{}');raise exception 'worker RPC exposed';exception when insufficient_privilege then null;end;
 begin perform 1 from public.post_publications;raise exception 'direct access exposed';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
