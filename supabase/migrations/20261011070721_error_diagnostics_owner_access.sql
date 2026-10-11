-- Allow active site owners and admins to read masked error diagnostics.
-- Keep live membership checks, site isolation and service-role-only RPC access.
create or replace function public.travel_admin_error_issues(
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
  perform app_private.require_member(p_site_id, p_actor, array['owner','admin']::text[]);
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

create or replace function public.travel_admin_error_issue(
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
  perform app_private.require_member(p_site_id, p_actor, array['owner','admin']::text[]);
  select pg_catalog.to_jsonb(issue) into v_issue
  from (
    select id, site_id, app, environment, fingerprint, status,
      first_seen_at, last_seen_at, occurrence_count,
      last_error_name as error_name, last_message as message,
      last_route as route, last_source as source,
      last_release as release, last_request_id as request_id,
      last_masked_message as masked_message,
      last_masked_stack as masked_stack,
      last_operation as operation, last_dependency as dependency,
      last_http_status as http_status,
      last_origin_request_id as origin_request_id,
      last_stack_frames as stack_frames
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
      release, request_id, masked_message, masked_stack,
      operation, dependency, http_status, origin_request_id, stack_frames
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

revoke all on function public.travel_admin_error_issues(uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.travel_admin_error_issues(uuid, uuid, integer, integer) to service_role;
