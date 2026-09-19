begin;
do $$
declare u uuid:=gen_random_uuid(); s uuid;
begin
 select id into s from app_private.sites where slug='parents-travel';
 if exists(select 1 from auth.users where lower(email)='owner@example.invalid') then raise exception 'Run bootstrap test only before the real owner signs up'; end if;
 insert into auth.users(id,aud,role,email,created_at,updated_at) values(u,'authenticated','authenticated','owner@example.invalid',now(),now());
 assert not exists(select 1 from app_private.site_memberships where site_id=s and user_id=u);
 update auth.users set email_confirmed_at=now() where id=u;
 assert exists(select 1 from app_private.site_memberships where site_id=s and user_id=u and role='owner' and active);
end $$;
rollback;
