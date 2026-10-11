-- Rollback-only authorization regression. All fixtures are isolated and transient.
begin;
create extension if not exists pgtap with schema extensions;
select plan(1);
create temporary table error_access_ids as
  select gen_random_uuid() site_id, gen_random_uuid() other_site_id,
    gen_random_uuid() owner_id, gen_random_uuid() admin_id,
    gen_random_uuid() editor_id, gen_random_uuid() reader_id,
    gen_random_uuid() backup_owner_id,
    gen_random_uuid() issue_id;
insert into auth.users(id, aud, role, created_at, updated_at)
  select id, 'authenticated', 'authenticated', now(), now()
  from error_access_ids t,
  lateral unnest(array[t.owner_id,t.admin_id,t.editor_id,t.reader_id,t.backup_owner_id]) id;
insert into app_private.sites(id, slug, name)
  select id, 'access-' || id::text, 'Temporary permission test'
  from error_access_ids t, lateral unnest(array[t.site_id,t.other_site_id]) id;
insert into app_private.site_memberships(site_id, user_id, role)
  select t.site_id, v.id, v.role from error_access_ids t,
  lateral (values (t.owner_id, 'owner'), (t.admin_id, 'admin'), (t.editor_id, 'editor'), (t.backup_owner_id, 'owner')) v(id,role);
insert into app_private.web_error_issues(id,site_id,app,environment,fingerprint,
  last_error_name,last_message,last_route,last_source,last_release,last_request_id)
  select issue_id,site_id,'admin','preview',repeat('f',64),
    'TypeError','render_boundary','/posts','browser','role-test',gen_random_uuid()
  from error_access_ids;
grant select on error_access_ids to service_role;
set local role service_role;
do $$
declare t record; actor uuid; result jsonb;
begin
  select * into t from error_access_ids;
  foreach actor in array array[t.owner_id,t.admin_id] loop
    result := public.travel_admin_error_issues(actor,t.site_id);
    assert jsonb_array_length(result)=1, 'owner/admin list rejected';
    result := public.travel_admin_error_issue(actor,t.site_id,t.issue_id);
    assert result->'issue'->>'id'=t.issue_id::text, 'owner/admin detail rejected';
    begin
      perform public.travel_admin_error_issues(actor,t.other_site_id);
      raise exception 'cross-site list allowed';
    exception when sqlstate 'PT403' then null; end;
    begin
      perform public.travel_admin_error_issue(actor,t.other_site_id,t.issue_id);
      raise exception 'cross-site detail allowed';
    exception when sqlstate 'PT403' then null; end;
  end loop;
  foreach actor in array array[t.editor_id,t.reader_id] loop
    begin
      perform public.travel_admin_error_issues(actor,t.site_id);
      raise exception 'editor/reader list allowed';
    exception when sqlstate 'PT403' then null; end;
    begin
      perform public.travel_admin_error_issue(actor,t.site_id,t.issue_id);
      raise exception 'editor/reader detail allowed';
    exception when sqlstate 'PT403' then null; end;
  end loop;
  update app_private.site_memberships set active=false
    where site_id=t.site_id and user_id in (t.owner_id,t.admin_id);
  foreach actor in array array[t.owner_id,t.admin_id] loop
    begin
      perform public.travel_admin_error_issues(actor,t.site_id);
      raise exception 'revoked role list allowed';
    exception when sqlstate 'PT403' then null; end;
    begin
      perform public.travel_admin_error_issue(actor,t.site_id,t.issue_id);
      raise exception 'revoked role detail allowed';
    exception when sqlstate 'PT403' then null; end;
  end loop;
  begin
    perform public.travel_admin_error_issues(null,t.site_id);
    raise exception 'anonymous actor list allowed';
  exception when sqlstate 'PT401' then null; end;
  begin
    perform public.travel_admin_error_issue(null,t.site_id,t.issue_id);
    raise exception 'anonymous actor detail allowed';
  exception when sqlstate 'PT401' then null; end;
end $$;
reset role;
do $$
declare db_role text;
begin
  foreach db_role in array array['anon','authenticated'] loop
    assert not has_function_privilege(db_role,'public.travel_admin_error_issues(uuid,uuid,integer,integer)','execute'), 'list RPC exposed directly';
    assert not has_function_privilege(db_role,'public.travel_admin_error_issue(uuid,uuid,uuid)','execute'), 'detail RPC exposed directly';
  end loop;
end $$;
select pass('Owner/admin allow; editor/reader/anonymous/cross-site/revoked deny; direct RPC blocked');
select * from finish();
rollback;
