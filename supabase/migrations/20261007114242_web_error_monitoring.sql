-- Keep application error telemetry behind the verified travel-api gateway.
-- The gateway must send only a scrubbed, bounded envelope; no URL query,
-- headers, cookies, request body, IP address, or user identifier is stored.
create table app_private.web_error_issues (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references app_private.sites(id),
  app text not null check (app in ('web', 'admin')),
  environment text not null check (environment in ('production', 'preview', 'development')),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  status text not null default 'open' check (status in ('open', 'resolved', 'ignored')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  occurrence_count bigint not null default 1 check (occurrence_count > 0),
  last_error_name text not null check (length(last_error_name) between 1 and 80),
  last_message text not null check (length(last_message) between 1 and 512),
  last_route text not null check (length(last_route) between 1 and 512),
  last_source text not null check (last_source in ('browser', 'next_server', 'edge_api')),
  last_release text check (last_release is null or length(last_release) between 1 and 120),
  last_request_id text check (last_request_id is null or length(last_request_id) between 1 and 100),
  unique (site_id, app, environment, fingerprint)
);
create index web_error_issues_recent_idx
  on app_private.web_error_issues(site_id, last_seen_at desc, id);
create index web_error_issues_status_idx
  on app_private.web_error_issues(site_id, status, last_seen_at desc);

create table app_private.web_error_events (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references app_private.web_error_issues(id) on delete cascade,
  received_at timestamptz not null default now(),
  source text not null check (source in ('browser', 'next_server', 'edge_api')),
  error_name text not null check (length(error_name) between 1 and 80),
  message text not null check (length(message) between 1 and 512),
  route text not null check (length(route) between 1 and 512),
  release text check (release is null or length(release) between 1 and 120),
  request_id text check (request_id is null or length(request_id) between 1 and 100)
);
create index web_error_events_issue_recent_idx
  on app_private.web_error_events(issue_id, received_at desc, id);
create index web_error_events_retention_idx
  on app_private.web_error_events(received_at);

-- As with the existing app_private tables, clients have no Data API access.
alter table app_private.web_error_issues enable row level security;
alter table app_private.web_error_events enable row level security;
revoke all on table app_private.web_error_issues, app_private.web_error_events
  from public, anon, authenticated;
grant select, insert, update, delete
  on table app_private.web_error_issues, app_private.web_error_events
  to service_role;
create policy web_error_issues_service_only on app_private.web_error_issues
  for all to service_role using (true) with check (true);
create policy web_error_events_service_only on app_private.web_error_events
  for all to service_role using (true) with check (true);

-- Called only by the Edge gateway after it has selected the site and scrubbed
-- and rate-limited the report. Validate the envelope again at the SQL boundary.
create function public.travel_error_capture(p_input jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_site_id uuid;
  v_app text;
  v_environment text;
  v_source text;
  v_error_name text;
  v_message text;
  v_route text;
  v_fingerprint text;
  v_release text;
  v_request_id text;
  v_issue_id uuid;
  v_received_at timestamptz := clock_timestamp();
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception 'invalid_input' using errcode = 'PT400';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_object_keys(p_input) as field(name)
    where field.name <> all (array[
      'site_id', 'app', 'environment', 'source', 'error_name', 'message',
      'route', 'fingerprint', 'release', 'request_id'
    ]::text[])
  ) then
    raise exception 'invalid_error_field' using errcode = 'PT422';
  end if;
  if jsonb_typeof(p_input->'site_id') is distinct from 'string'
    or (p_input->>'site_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    raise exception 'invalid_site_id' using errcode = 'PT422';
  end if;
  v_site_id := (p_input->>'site_id')::uuid;
  if not exists (
    select 1 from app_private.sites where id = v_site_id and status = 'active'
  ) then
    raise exception 'site_not_found' using errcode = 'PT404';
  end if;
  if jsonb_typeof(p_input->'app') is distinct from 'string'
    or jsonb_typeof(p_input->'environment') is distinct from 'string'
    or jsonb_typeof(p_input->'source') is distinct from 'string'
    or jsonb_typeof(p_input->'error_name') is distinct from 'string'
    or jsonb_typeof(p_input->'message') is distinct from 'string'
    or jsonb_typeof(p_input->'route') is distinct from 'string'
    or jsonb_typeof(p_input->'fingerprint') is distinct from 'string'
    or (p_input ? 'release' and jsonb_typeof(p_input->'release') not in ('string', 'null'))
    or (p_input ? 'request_id' and jsonb_typeof(p_input->'request_id') not in ('string', 'null'))
  then
    raise exception 'invalid_error_field' using errcode = 'PT422';
  end if;
  v_app := p_input->>'app';
  v_environment := p_input->>'environment';
  v_source := p_input->>'source';
  v_error_name := p_input->>'error_name';
  v_message := p_input->>'message';
  v_route := p_input->>'route';
  v_fingerprint := p_input->>'fingerprint';
  v_release := nullif(p_input->>'release', '');
  v_request_id := nullif(p_input->>'request_id', '');
  if v_app not in ('web', 'admin')
    or v_environment not in ('production', 'preview', 'development')
    or v_source not in ('browser', 'next_server', 'edge_api')
    or v_fingerprint !~ '^[0-9a-f]{64}$'
    or length(v_error_name) not between 1 and 80
    or length(v_message) not between 1 and 512
    or length(v_route) not between 1 and 512
    or left(v_route, 1) <> '/'
    or left(v_route, 2) = '//'
    or v_error_name ~ '[[:cntrl:]]'
    or v_message ~ '[[:cntrl:]]'
    or pg_catalog.strpos(v_route, '?') > 0
    or pg_catalog.strpos(v_route, '#') > 0
    or v_route ~ '[[:cntrl:]]'
    or (v_release is not null and (length(v_release) > 120 or v_release ~ '[[:cntrl:]]'))
    or (v_request_id is not null and (length(v_request_id) > 100 or v_request_id ~ '[[:cntrl:]]'))
  then
    raise exception 'invalid_error_report' using errcode = 'PT422';
  end if;

  insert into app_private.web_error_issues (
    site_id, app, environment, fingerprint, first_seen_at, last_seen_at,
    last_error_name, last_message, last_route, last_source, last_release,
    last_request_id
  ) values (
    v_site_id, v_app, v_environment, v_fingerprint, v_received_at, v_received_at,
    v_error_name, v_message, v_route, v_source, v_release, v_request_id
  )
  on conflict (site_id, app, environment, fingerprint) do update set
    occurrence_count = app_private.web_error_issues.occurrence_count + 1,
    last_seen_at = excluded.last_seen_at,
    status = case when app_private.web_error_issues.status = 'resolved'
      then 'open' else app_private.web_error_issues.status end,
    last_error_name = excluded.last_error_name,
    last_message = excluded.last_message,
    last_route = excluded.last_route,
    last_source = excluded.last_source,
    last_release = excluded.last_release,
    last_request_id = excluded.last_request_id
  returning id into v_issue_id;

  insert into app_private.web_error_events (
    issue_id, received_at, source, error_name, message, route, release, request_id
  ) values (
    v_issue_id, v_received_at, v_source, v_error_name, v_message,
    v_route, v_release, v_request_id
  );
  return pg_catalog.jsonb_build_object('accepted', true);
end;
$$;

-- The live membership check prevents an editor, owner without the admin role,
-- another site's admin, or a user with a revoked role from reading error data.
create function public.travel_admin_error_issues(
  p_actor uuid,
  p_site_id uuid,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform app_private.require_member(p_site_id, p_actor, array['admin']::text[]);
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(issues) order by issues.last_seen_at desc, issues.id)
    from (
      select id, site_id, app, environment, fingerprint, status,
        first_seen_at, last_seen_at, occurrence_count,
        last_error_name as error_name, last_message as message,
        last_route as route, last_source as source,
        last_release as release, last_request_id as request_id
      from app_private.web_error_issues
      where site_id = p_site_id
      order by last_seen_at desc, id
      limit least(greatest(coalesce(p_limit, 20), 1), 50)
      offset least(greatest(coalesce(p_offset, 0), 0), 100000)
    ) issues
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.travel_error_capture(jsonb)
  from public, anon, authenticated;
revoke all on function public.travel_admin_error_issues(uuid, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.travel_error_capture(jsonb) to service_role;
grant execute on function public.travel_admin_error_issues(uuid, uuid, integer, integer)
  to service_role;

notify pgrst, 'reload schema';
