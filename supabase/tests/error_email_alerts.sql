begin;
create extension if not exists pgtap with schema extensions;
select plan(1);
create temporary table alert_ids as select gen_random_uuid() site_id, gen_random_uuid() issue_id;
grant select on alert_ids to service_role;
insert into app_private.sites(id,slug,name)
select site_id,'email-alert-test','Email alert fixture' from alert_ids;
insert into app_private.web_error_issues(id,site_id,app,environment,fingerprint,last_error_name,last_message,last_route,last_source)
select issue_id,site_id,'web','preview',repeat('c',64),'Error','uncaught_error','/','browser' from alert_ids;
insert into app_private.web_error_events(issue_id,source,error_name,message,route)
select issue_id,'browser','Error','uncaught_error','/' from alert_ids cross join generate_series(1,9);
set local role service_role;
do $$
declare a jsonb; b jsonb; payload jsonb;
begin
  a:=public.travel_error_email('claim','{"environment":"preview","site_slug":"email-alert-test","from":"sender@example.invalid","to":"reader@example.invalid"}');
  assert a is null, 'below threshold must not send';
  insert into app_private.web_error_events(issue_id,source,error_name,message,route)
    select issue_id,'browser','Error','uncaught_error','/' from alert_ids;
  assert public.travel_error_email('claim','{"environment":"production","site_slug":"email-alert-test","from":"sender@example.invalid","to":"reader@example.invalid"}') is null;
  a:=public.travel_error_email('claim','{"environment":"preview","site_slug":"email-alert-test","from":"sender@example.invalid","to":"reader@example.invalid"}');
  assert a->'payload'->>'count'='10';
  assert not (a->'payload' ? 'message') and not (a->'payload' ? 'stack');
  assert public.travel_error_email('claim','{"environment":"preview","site_slug":"email-alert-test","from":"sender@example.invalid","to":"reader@example.invalid"}') is null, 'live lease excludes duplicate';
  payload:=a->'payload';
  update app_private.web_error_email_outbox set lease_until=now()-interval '1 second' where id=(a->>'id')::uuid;
  b:=public.travel_error_email('claim','{"environment":"preview","site_slug":"email-alert-test","from":"changed@example.invalid","to":"changed@example.invalid"}');
  assert a->>'id'=b->>'id' and b->'payload'=payload, 'retry keeps idempotency key and exact payload';
  assert a->>'lease_token'<>b->>'lease_token';
  assert public.travel_error_email('finish',jsonb_build_object('id',a->>'id','lease_token',a->>'lease_token','sent',true,'provider_id','old'))='false'::jsonb;
  assert public.travel_error_email('finish',jsonb_build_object('id',b->>'id','lease_token',b->>'lease_token','sent',true,'provider_id','accepted-id'))='true'::jsonb;
  assert public.travel_error_email('claim','{"environment":"preview","site_slug":"email-alert-test","from":"sender@example.invalid","to":"reader@example.invalid"}') is null, 'cooldown excludes sent issue';
  -- Failed delivery is retryable only after the provider's requested delay.
  update app_private.web_error_email_outbox set status='sending',lease_until=now()+interval '2 minutes' where id=(b->>'id')::uuid;
  assert public.travel_error_email('finish',jsonb_build_object('id',b->>'id','lease_token',b->>'lease_token','sent',false,'retryable',true,'retry_after_seconds',600))='true'::jsonb;
  assert (select available_at>=now()+interval '10 minutes' from app_private.web_error_email_outbox where id=(b->>'id')::uuid), '429 delay must be preserved';
  update app_private.web_error_email_outbox set status='sent' where id=(b->>'id')::uuid;
  -- Saturate the rolling account-wide budget. Attempts reserve capacity even on failure.
  insert into app_private.web_error_email_outbox(site_id,issue_id,environment,payload,status,created_at)
  select site_id,issue_id,'preview','{}','failed',now()-interval '1 hour' from alert_ids cross join generate_series(1,49);
  update app_private.web_error_email_outbox set created_at=now()-interval '1 hour' where id=(a->>'id')::uuid;
  assert public.travel_error_email('claim','{"environment":"preview","site_slug":"email-alert-test","from":"sender@example.invalid","to":"reader@example.invalid"}') is null, 'budget fails closed';
end $$;
reset role;
select ok(not has_function_privilege('anon','public.travel_error_email(text,jsonb)','EXECUTE')
 and not has_function_privilege('authenticated','public.travel_error_email(text,jsonb)','EXECUTE')
 and not has_table_privilege('authenticated','app_private.web_error_email_outbox','SELECT'),
 'threshold, environment isolation, stable retries, fencing, cooldown, budget and permissions');
select * from finish();
rollback;
