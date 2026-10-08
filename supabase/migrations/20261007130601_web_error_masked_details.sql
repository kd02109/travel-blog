-- Keep diagnostic text separate from the safe issue summary. Only redacted,
-- bounded message/stack text reaches these columns; never request context.
alter table app_private.web_error_issues
  add column last_masked_message text
    check (last_masked_message is null or length(last_masked_message) between 1 and 1024),
  add column last_masked_stack text
    check (last_masked_stack is null or length(last_masked_stack) between 1 and 4096);

alter table app_private.web_error_events
  add column masked_message text
    check (masked_message is null or length(masked_message) between 1 and 1024),
  add column masked_stack text
    check (masked_stack is null or length(masked_stack) between 1 and 4096);

-- The Edge gateway selects the site, checks its server-only report key and
-- sanitizes this text before invoking the RPC. SQL checks shape and length
-- again so a future gateway change cannot silently exceed storage bounds.
create or replace function public.travel_error_capture(p_input jsonb)
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
  v_masked_message text;
  v_masked_stack text;
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
      'route', 'fingerprint', 'release', 'request_id',
      'masked_message', 'masked_stack'
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
    or (p_input ? 'masked_message' and jsonb_typeof(p_input->'masked_message') not in ('string', 'null'))
    or (p_input ? 'masked_stack' and jsonb_typeof(p_input->'masked_stack') not in ('string', 'null'))
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
  v_masked_message := nullif(p_input->>'masked_message', '');
  v_masked_stack := nullif(p_input->>'masked_stack', '');
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
    or (v_masked_message is not null and (
      length(v_masked_message) > 1024
      or pg_catalog.regexp_replace(v_masked_message, E'[\n\r\t]', '', 'g') ~ '[[:cntrl:]]'
    ))
    or (v_masked_stack is not null and (
      length(v_masked_stack) > 4096
      or pg_catalog.regexp_replace(v_masked_stack, E'[\n\r\t]', '', 'g') ~ '[[:cntrl:]]'
    ))
  then
    raise exception 'invalid_error_report' using errcode = 'PT422';
  end if;

  insert into app_private.web_error_issues (
    site_id, app, environment, fingerprint, first_seen_at, last_seen_at,
    last_error_name, last_message, last_route, last_source, last_release,
    last_request_id, last_masked_message, last_masked_stack
  ) values (
    v_site_id, v_app, v_environment, v_fingerprint, v_received_at, v_received_at,
    v_error_name, v_message, v_route, v_source, v_release, v_request_id,
    v_masked_message, v_masked_stack
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
    last_request_id = excluded.last_request_id,
    last_masked_message = excluded.last_masked_message,
    last_masked_stack = excluded.last_masked_stack
  returning id into v_issue_id;

  insert into app_private.web_error_events (
    issue_id, received_at, source, error_name, message, route, release,
    request_id, masked_message, masked_stack
  ) values (
    v_issue_id, v_received_at, v_source, v_error_name, v_message,
    v_route, v_release, v_request_id, v_masked_message, v_masked_stack
  );
  return pg_catalog.jsonb_build_object('accepted', true);
end;
$$;

-- The issue ID is looked up only after checking the live, site-scoped admin
-- membership. The list RPC remains summary-only and never exposes text.
create function public.travel_admin_error_issue(
  p_actor uuid,
  p_site_id uuid,
  p_issue_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_issue jsonb;
  v_events jsonb;
begin
  perform app_private.require_member(p_site_id, p_actor, array['admin']::text[]);
  select pg_catalog.to_jsonb(issue) into v_issue
  from (
    select id, site_id, app, environment, fingerprint, status,
      first_seen_at, last_seen_at, occurrence_count,
      last_error_name as error_name, last_message as message,
      last_route as route, last_source as source,
      last_release as release, last_request_id as request_id,
      last_masked_message as masked_message,
      last_masked_stack as masked_stack
    from app_private.web_error_issues
    where id = p_issue_id and site_id = p_site_id
  ) issue;
  if v_issue is null then
    raise exception 'error_issue_not_found' using errcode = 'PT404';
  end if;
  select coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(event) order by event.received_at desc, event.id),
    '[]'::jsonb
  ) into v_events
  from (
    select id, received_at, source, error_name, message, route,
      release, request_id, masked_message, masked_stack
    from app_private.web_error_events
    where issue_id = p_issue_id
    order by received_at desc, id
    limit 20
  ) event;
  return pg_catalog.jsonb_build_object('issue', v_issue, 'events', v_events);
end;
$$;

revoke all on function public.travel_admin_error_issue(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.travel_admin_error_issue(uuid, uuid, uuid)
  to service_role;

notify pgrst, 'reload schema';
