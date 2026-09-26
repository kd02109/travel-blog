create table app_private.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'anonymized', 'completed')),
  requested_at timestamptz not null default now(),
  anonymized_at timestamptz,
  completed_at timestamptz
);
create unique index account_deletion_one_open_request
  on app_private.account_deletion_requests(user_id)
  where user_id is not null and status in ('pending', 'anonymized');
alter table app_private.account_deletion_requests enable row level security;
revoke all on app_private.account_deletion_requests from public, anon, authenticated;
grant select, insert, update, delete on app_private.account_deletion_requests to service_role;

create or replace function public.travel_account_delete_request(p_actor uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare request_id uuid;
begin
  if p_actor is null or not exists (
    select 1 from auth.users u where u.id = p_actor and u.deleted_at is null
      and (u.banned_until is null or u.banned_until < now())
  ) then raise exception 'unauthorized' using errcode = 'PT401'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_actor::text, 0));
  select r.id into request_id from app_private.account_deletion_requests r
    where r.user_id = p_actor and r.status in ('pending', 'anonymized') for update;
  if request_id is null then
    insert into app_private.account_deletion_requests(user_id)
      values (p_actor) returning id into request_id;
  end if;
  return jsonb_build_object('requested', true, 'request_id', request_id);
end;
$$;

create or replace function public.travel_admin_account_deletions(
  p_actor uuid, p_site_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_member(p_site_id, p_actor, array['owner','admin']::text[]);
  return coalesce((
    select jsonb_agg(to_jsonb(r) order by r.requested_at desc)
    from (
      select d.id, d.user_id, u.email, d.status, d.requested_at, d.anonymized_at,
        d.completed_at
      from app_private.account_deletion_requests d
      left join auth.users u on u.id = d.user_id
      where d.status <> 'completed'
    ) r
  ), '[]'::jsonb);
end;
$$;

create or replace function public.travel_admin_account_deletion_anonymize(
  p_actor uuid, p_site_id uuid, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare target uuid; affected integer; target_site uuid;
begin
  perform app_private.require_member(p_site_id, p_actor, array['owner','admin']::text[]);
  select d.user_id into target from app_private.account_deletion_requests d
    where d.id = p_request_id and d.status = 'pending' for update;
  if target is null then raise exception 'not_found' using errcode = 'PT404'; end if;
  for target_site in
    select distinct p.site_id from public.comments c
    join app_private.posts p on p.id = c.post_id where c.author_id = target
  loop
    perform app_private.require_member(target_site, p_actor, array['owner','admin']::text[]);
  end loop;
  delete from app_private.comment_credentials cc using public.comments c
    where cc.comment_id = c.id and c.author_id = target;
  update public.comments c set author_id = null, author_kind = 'anonymized',
    guest_name = null, version = version + 1, updated_at = now()
    where c.author_id = target;
  get diagnostics affected = row_count;
  update app_private.account_deletion_requests set status = 'anonymized',
    anonymized_at = now() where id = p_request_id;
  perform app_private.audit(p_site_id, p_actor, 'account.deletion.anonymize', p_request_id,
    jsonb_build_object('comments_anonymized', affected));
  return jsonb_build_object('status', 'anonymized', 'comments_anonymized', affected);
end;
$$;

create or replace function public.travel_admin_account_deletion_complete(
  p_actor uuid, p_site_id uuid, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_member(p_site_id, p_actor, array['owner','admin']::text[]);
  update app_private.account_deletion_requests set status = 'completed', completed_at = now()
    where id = p_request_id and status = 'anonymized' and user_id is null;
  if not found then raise exception 'account_deletion_not_ready' using errcode = 'PT409'; end if;
  perform app_private.audit(p_site_id, p_actor, 'account.deletion.complete', p_request_id);
  return jsonb_build_object('status', 'completed');
end;
$$;

revoke all on function public.travel_account_delete_request(uuid) from public, anon, authenticated;
revoke all on function public.travel_admin_account_deletions(uuid, uuid) from public, anon, authenticated;
revoke all on function public.travel_admin_account_deletion_anonymize(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.travel_admin_account_deletion_complete(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.travel_account_delete_request(uuid) to service_role;
grant execute on function public.travel_admin_account_deletions(uuid, uuid) to service_role;
grant execute on function public.travel_admin_account_deletion_anonymize(uuid, uuid, uuid) to service_role;
grant execute on function public.travel_admin_account_deletion_complete(uuid, uuid, uuid) to service_role;
