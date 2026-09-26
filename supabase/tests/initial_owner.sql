begin;
do $$
declare u uuid:=gen_random_uuid(); other_user uuid:=gen_random_uuid(); s uuid:=gen_random_uuid();
begin
 insert into app_private.sites(id,slug,name) values(s,'bootstrap-test-'||s::text,'Bootstrap test');
 insert into auth.users(id,aud,role,email,email_confirmed_at,created_at,updated_at) values(other_user,'authenticated','authenticated','unconfigured@example.test',now(),now(),now());
 assert not exists(select 1 from app_private.site_memberships where site_id=s);
 insert into app_private.owner_bootstrap_targets(site_id,email) values(s,'local-owner@example.test');
 insert into auth.users(id,aud,role,email,created_at,updated_at) values(u,'authenticated','authenticated','local-owner@example.test',now(),now());
 assert not exists(select 1 from app_private.site_memberships where site_id=s and user_id=u);
 update auth.users set email_confirmed_at=now() where id=u;
 assert exists(select 1 from app_private.site_memberships where site_id=s and user_id=u and role='owner' and active);
 -- A different verified account cannot acquire ownership through metadata.
 update auth.users set raw_user_meta_data='{"role":"owner","email":"local-owner@example.test"}' where id=other_user;
 assert not exists(select 1 from app_private.site_memberships where site_id=s and user_id=other_user);
 update app_private.owner_bootstrap_targets set email='unconfigured@example.test' where site_id=s;
 update auth.users set email_confirmed_at=now() where id=other_user;
 assert not exists(select 1 from app_private.site_memberships where site_id=s and user_id=other_user);
 raise notice 'Environment owner bootstrap assertions passed';
end $$;
rollback;
