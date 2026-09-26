-- Provision explicitly per environment; never copy a personal owner to a new DB.
-- Version aligned with the verified remote migration history.
create table app_private.owner_bootstrap_targets (
 site_id uuid primary key references app_private.sites(id) on delete cascade,
 email text not null check(email=lower(trim(email)) and position('@' in email)>1)
);
alter table app_private.owner_bootstrap_targets enable row level security;
revoke all on app_private.owner_bootstrap_targets from public,anon,authenticated,service_role;

create or replace function app_private.bootstrap_initial_owner() returns trigger
language plpgsql security definer set search_path='' as $$
declare target_site uuid;
begin
 if new.email_confirmed_at is null or new.deleted_at is not null or (new.banned_until is not null and new.banned_until>now()) then return new; end if;
 if auth.uid() is not null and auth.uid()<>new.id then return new; end if;
 for target_site in
   select s.id from app_private.sites s
   join app_private.owner_bootstrap_targets t on t.site_id=s.id
   where t.email=lower(new.email) and s.status='active'
   for update of s
 loop
   -- Any existing owner (including inactive) closes automatic bootstrap.
   if not exists(select 1 from app_private.site_memberships where site_id=target_site and role='owner') then
     insert into app_private.site_memberships(site_id,user_id,role,active) values(target_site,new.id,'owner',true);
     insert into app_private.audit_events(site_id,actor_id,action,resource_id) values(target_site,new.id,'owner.bootstrap',new.id);
   end if;
 end loop;
 return new;
end $$;
revoke all on function app_private.bootstrap_initial_owner() from public,anon,authenticated,service_role;
