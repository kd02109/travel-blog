begin;
create extension if not exists pgtap with schema extensions;
select plan(1);

create temporary table retention_ids as
select gen_random_uuid() site_id, gen_random_uuid() old_issue,
  gen_random_uuid() recent_issue;
grant select on retention_ids to service_role;
insert into app_private.sites(id,slug,name)
select site_id,'retention-'||site_id,'Retention fixture' from retention_ids;
insert into app_private.web_error_issues
  (id,site_id,app,environment,fingerprint,first_seen_at,last_seen_at,
   last_error_name,last_message,last_route,last_source,last_masked_message,last_masked_stack)
select old_issue,site_id,'web','preview',repeat('a',64),now()-interval '15 days',
  now()-interval '15 days','Error','synthetic','/','browser','masked old','at old'
from retention_ids
union all
select recent_issue,site_id,'admin','preview',repeat('b',64),now(),
  now(),'Error','synthetic','/','browser','masked recent','at recent'
from retention_ids;
insert into app_private.web_error_events(issue_id,received_at,source,error_name,message,route)
select old_issue,now()-interval '15 days','browser','Error','old','/' from retention_ids
union all
select recent_issue,now()-interval '14 days','browser','Error','boundary','/' from retention_ids
union all
select recent_issue,now(),'browser','Error','recent','/' from retention_ids;

set local role service_role;
do $$
declare r jsonb; t record;
begin
  select * into t from retention_ids;
  r:=app_private.purge_web_error_events();
  assert (r->>'deleted_events')::int=1;
  assert (r->>'cleared_issue_details')::int=1;
  assert not exists(select 1 from app_private.web_error_events where issue_id=t.old_issue);
  assert (select count(*) from app_private.web_error_events where issue_id=t.recent_issue)=2;
  assert exists(select 1 from app_private.web_error_issues where id=t.old_issue
    and occurrence_count=1 and last_masked_message is null and last_masked_stack is null
    and last_stack_frames='[]'::jsonb);
  assert exists(select 1 from app_private.web_error_issues where id=t.recent_issue
    and last_masked_message='masked recent' and last_masked_stack='at recent');
  r:=app_private.purge_web_error_events();
  assert (r->>'deleted_events')::int=0;
  assert (r->>'cleared_issue_details')::int=0;
end $$;
reset role;
select ok(
  not has_function_privilege('anon','app_private.purge_web_error_events()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.purge_web_error_events()','EXECUTE')
  and (select count(*)=1 from cron.job where jobname='travel-error-event-retention'
    and active and schedule='17 * * * *'),
  'retention preserves recent events and aggregates; private permissions and schedule verified'
);
select * from finish();
rollback;
