-- One-time bootstrap authorized by the user. Email is Auth-verified, never user_metadata.
create function app_private.bootstrap_initial_owner() returns trigger
language plpgsql security definer set search_path='' as $$
declare target_site uuid;
begin
 if lower(new.email) is distinct from 'owner@example.invalid' or new.email_confirmed_at is null or new.deleted_at is not null or (new.banned_until is not null and new.banned_until>now()) then return new; end if;
 if auth.uid() is not null and auth.uid()<>new.id then return new; end if;
 select id into target_site from app_private.sites where slug='parents-travel' and status='active' for update;
 if target_site is null or exists(select 1 from app_private.site_memberships where site_id=target_site and role='owner') then return new; end if;
 insert into app_private.site_memberships(site_id,user_id,role,active) values(target_site,new.id,'owner',true);
 insert into app_private.audit_events(site_id,actor_id,action,resource_id) values(target_site,new.id,'owner.bootstrap',new.id);
 return new;
end $$;
revoke all on function app_private.bootstrap_initial_owner() from public,anon,authenticated,service_role;
create trigger travel_blog_initial_owner after insert or update of email_confirmed_at,email on auth.users for each row execute function app_private.bootstrap_initial_owner();
