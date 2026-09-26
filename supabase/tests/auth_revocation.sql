begin;
do $$
declare owner_id uuid:=gen_random_uuid(); editor_id uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); r jsonb;
begin
 insert into auth.users(id,aud,role,email,email_confirmed_at,created_at,updated_at)
 values(owner_id,'authenticated','authenticated','revocation-owner@example.test',now(),now(),now()),
       (editor_id,'authenticated','authenticated','revocation-editor@example.test',now(),now(),now());
 insert into app_private.sites(id,slug,name) values(s,'revocation-'||s::text,'Revocation test');
 insert into app_private.site_memberships(site_id,user_id,role) values(s,owner_id,'owner'),(s,editor_id,'editor');
 perform public.travel_api('admin.posts',editor_id,jsonb_build_object('site_id',s));
 perform public.travel_api('admin.member.set',owner_id,jsonb_build_object('site_id',s,'user_id',editor_id,'role','editor','active',false));
 r:=public.travel_api('me',editor_id,'{}');
 assert jsonb_array_length(r->'memberships')=0;
 begin
   perform public.travel_api('admin.posts',editor_id,jsonb_build_object('site_id',s));
   raise exception 'revoked editor could read admin data';
 exception when sqlstate 'PT403' then null;
 end;
 begin
   perform public.travel_api('admin.post.create',editor_id,jsonb_build_object('site_id',s,'kind','article','category_code','day-walk','title','Denied'));
   raise exception 'revoked editor could write';
 exception when sqlstate 'PT403' then null;
 end;
 raise notice 'Membership revocation read/write assertions passed';
end $$;
rollback;
