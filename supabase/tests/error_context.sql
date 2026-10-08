-- Rollback-only check for bounded error context and live admin permissions.
begin;
create temporary table error_context_ids as
  select gen_random_uuid() site_id, gen_random_uuid() admin_id,
    gen_random_uuid() owner_id;
insert into auth.users(id, aud, role, email, created_at, updated_at)
  select admin_id, 'authenticated', 'authenticated',
    'error-admin@example.invalid', now(), now() from error_context_ids
  union all
  select owner_id, 'authenticated', 'authenticated',
    'error-owner@example.invalid', now(), now() from error_context_ids;
insert into app_private.sites(id, slug, name)
  select site_id, 'err-' || site_id::text, 'Error context test'
  from error_context_ids;
insert into app_private.site_memberships(site_id, user_id, role)
  select site_id, admin_id, 'admin' from error_context_ids
  union all
  select site_id, owner_id, 'owner' from error_context_ids;
grant select on error_context_ids to service_role;

set local role service_role;
do $$
declare
  t record;
  report jsonb;
  issue_id uuid;
  detail jsonb;
  summary jsonb;
begin
  select * into t from error_context_ids;
  report := jsonb_build_object(
    'site_id', t.site_id, 'app', 'admin', 'environment', 'development',
    'source', 'browser', 'error_name', 'TravelApiError',
    'message', 'version_conflict', 'route', '/write/:id',
    'fingerprint', repeat('a', 64), 'release', 'local',
    'request_id', gen_random_uuid(), 'origin_request_id', gen_random_uuid(),
    'operation', 'post.save', 'dependency', 'travel_api',
    'http_status', 409,
    'stack_frames', jsonb_build_array(jsonb_build_object(
      'function_name', 'savePost', 'file', 'apps/admin/app/write/page.tsx',
      'line', 147, 'column', 12
    ))
  );
  perform public.travel_error_capture(report);
  select id into issue_id from app_private.web_error_issues
    where site_id = t.site_id;
  detail := public.travel_admin_error_issue(t.admin_id, t.site_id, issue_id);
  assert detail->'issue'->>'operation' = 'post.save';
  assert detail->'issue'->>'dependency' = 'travel_api';
  assert detail->'issue'->>'http_status' = '409';
  assert detail->'issue'->>'origin_request_id' <> detail->'issue'->>'request_id';
  assert detail->'events'->0->'stack_frames'->0->>'file' =
    'apps/admin/app/write/page.tsx';
  summary := public.travel_admin_error_issues(t.admin_id, t.site_id);
  assert not (summary->0 ? 'stack_frames');
  assert not (summary->0 ? 'origin_request_id');

  begin
    perform public.travel_error_capture(report || jsonb_build_object(
      'stack_frames', jsonb_build_array(jsonb_build_object(
        'function_name', null, 'file', '/Users/person/private.ts',
        'line', 1, 'column', 1
      ))
    ));
    raise exception 'absolute stack path accepted';
  exception when sqlstate 'PT422' then null; end;
  begin
    perform public.travel_error_capture(report || jsonb_build_object(
      'stack_frames', jsonb_build_array(jsonb_build_object(
        'function_name', null, 'file', 'private.txt',
        'line', 1, 'column', 1
      ))
    ));
    raise exception 'unrecognized source identifier accepted';
  exception when sqlstate 'PT422' then null; end;
  begin
    perform public.travel_error_capture(report || jsonb_build_object(
      'stack_frames', jsonb_build_array(jsonb_build_object(
        'function_name', null,
        'file', 'apps/web/private@example.com.js',
        'line', 1, 'column', 1
      ))
    ));
    raise exception 'email-like source identifier accepted';
  exception when sqlstate 'PT422' then null; end;
  begin
    perform public.travel_error_capture(report || '{"http_status":99}'::jsonb);
    raise exception 'invalid HTTP status accepted';
  exception when sqlstate 'PT422' then null; end;
  begin
    perform public.travel_admin_error_issue(t.owner_id, t.site_id, issue_id);
    raise exception 'owner read admin-only diagnostics';
  exception when sqlstate 'PT403' then null; end;
  update app_private.site_memberships set active = false
    where site_id = t.site_id and user_id = t.admin_id;
  begin
    perform public.travel_admin_error_issue(t.admin_id, t.site_id, issue_id);
    raise exception 'revoked admin read diagnostics';
  exception when sqlstate 'PT403' then null; end;
end $$;

set local role authenticated;
do $$
begin
  begin
    perform public.travel_admin_error_issue(
      gen_random_uuid(), gen_random_uuid(), gen_random_uuid());
    raise exception 'detail RPC exposed to authenticated role';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
