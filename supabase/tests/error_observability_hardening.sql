begin;
create extension if not exists pgtap with schema extensions;
select plan(1);
create temporary table error_management_ids as select gen_random_uuid() site_id,gen_random_uuid() other_site,
 gen_random_uuid() owner_id,gen_random_uuid() admin_id,gen_random_uuid() editor_id,
 gen_random_uuid() issue_id,gen_random_uuid() request_id,gen_random_uuid() origin_id;
insert into auth.users(id,aud,role,created_at,updated_at)
 select x,'authenticated','authenticated',now(),now() from error_management_ids t,
 lateral unnest(array[t.owner_id,t.admin_id,t.editor_id]) x;
insert into app_private.sites(id,slug,name)
 select x,'errors-'||x::text,'Error management test' from error_management_ids t,lateral unnest(array[t.site_id,t.other_site]) x;
insert into app_private.site_memberships(site_id,user_id,role)
 select t.site_id,v.id,v.role from error_management_ids t,lateral(values(t.owner_id,'owner'),(t.admin_id,'admin'),(t.editor_id,'editor')) v(id,role);
insert into app_private.web_error_issues(id,site_id,app,environment,fingerprint,occurrence_count,last_error_name,last_message,last_route,last_source)
 select issue_id,site_id,'admin','preview',repeat('f',64),2,'Error','test','/posts','browser' from error_management_ids;
insert into app_private.web_error_issues(site_id,app,environment,fingerprint,last_error_name,last_message,last_route,last_source)
 select site_id,'web','preview',repeat(md5(n::text),2),'Error','test','/posts','browser' from error_management_ids,generate_series(1,24) n;
insert into app_private.web_error_events(issue_id,source,error_name,message,route,request_id,origin_request_id)
 select issue_id,'browser','Error','test','/posts',request_id::text,origin_id from error_management_ids;
insert into app_private.web_error_email_outbox(site_id,issue_id,environment,payload,status)
 select site_id,issue_id,'preview','{}','sent' from error_management_ids;
grant select on error_management_ids to service_role;
set local role service_role;
do $$
declare t record;r jsonb;p jsonb;v_id uuid;v_event uuid:=gen_random_uuid();v_page jsonb;v_next jsonb;v_job jsonb;
begin
 select * into t from error_management_ids;
 r:=public.travel_admin_error_query(t.owner_id,t.site_id,'summary','{}');
 assert (r->>'total')::int=25 and (r->>'occurrences')::int=26,'all-time counts';
 r:=public.travel_admin_error_query(t.owner_id,t.site_id,'summary','{"environment":"production","period":"24h"}');
 assert (r->>'total')::int=0 and (r->>'occurrences')::int=0,'production excludes preview';
 r:=public.travel_admin_error_query(t.owner_id,t.site_id,'summary','{"environment":"preview","period":"24h"}');
 assert (r->>'total')::int=1 and (r->>'occurrences')::int=1,'period uses events not issue lifetime';
 p:=jsonb_build_object('site_id',t.site_id,'app','admin','environment','production','source','browser','route','/write/:id','error_name','Error','message','api_failure','fingerprint',repeat('c',64),'operation','admin.post.save','dependency','travel_api','http_status',500,'release','build-new');
 perform public.travel_error_ingest(p,v_event);perform public.travel_error_ingest(p,v_event);
 select id into v_id from app_private.web_error_issues where site_id=t.site_id and fingerprint=repeat('c',64);
 assert (select occurrence_count=1 and fingerprint_version=2 from app_private.web_error_issues where id=v_id),'duplicate excluded';
 assert (select count(*)=1 from app_private.web_error_events where issue_id=v_id),'one event retained';
 r:=public.travel_admin_error_query(t.owner_id,t.site_id,'health','{"environment":"production"}');
 assert r->'collection'->0->>'accepted'='1' and r->'collection'->0->>'duplicates'='1','collection counters';
 perform public.travel_error_observe(t.site_id,'admin','production','limited');
 perform public.travel_error_observe(t.site_id,'admin','production','failed');
 r:=public.travel_admin_error_query(t.owner_id,t.site_id,'health','{"environment":"production"}');
 assert r->'collection'->0->>'limited'='1' and r->'collection'->0->>'failed'='1','limit/failure counters';
 -- A single stored save failure is eligible without 10 reports. Existing rate/cooldown remains.
 v_job:=public.travel_error_email('claim',jsonb_build_object('environment','production','site_slug','errors-'||t.site_id,'from','alerts@example.invalid','to','test@example.invalid','admin_url','https://admin.example.invalid'));
 assert v_job->'payload'->>'issue_id'=v_id::text and v_job->'payload'->>'count'='1','critical first report alert';
 assert v_job->'payload'->>'admin_url'='https://admin.example.invalid','frozen admin link';
 assert public.travel_error_email('finish',jsonb_build_object('id',v_job->>'id','lease_token',v_job->>'lease_token','sent',true,'provider_id','synthetic'))='true'::jsonb,'email finish';
 r:=public.travel_admin_error_query(t.owner_id,t.site_id,'health','{"environment":"production"}');
 assert r->'collection'->0->>'last_email_result'='email_accepted','email heartbeat';
 perform public.travel_admin_error_resolve(t.owner_id,t.site_id,v_id,1,'resolved','Fixed null handling PR 42','commit-abc');
 r:=public.travel_admin_error_issue(t.owner_id,t.site_id,v_id);
 assert r->'issue'->>'resolution_note'='Fixed null handling PR 42' and r->'issue'->>'resolved_release'='commit-abc' and r->'issue'->>'resolved_by'=t.owner_id::text,'resolution context';
 perform public.travel_error_ingest(p,gen_random_uuid());
 assert (select status='open' and resolved_at is not null from app_private.web_error_issues where id=v_id),'recurrence preserves resolution context';
 for i in 1..23 loop perform public.travel_error_ingest(p,gen_random_uuid()); end loop;
 v_page:=public.travel_admin_error_events(t.owner_id,t.site_id,v_id);
 assert jsonb_array_length(v_page->'items')=20 and v_page->'next'<>'null'::jsonb,'first event page';
 v_next:=public.travel_admin_error_events(t.owner_id,t.site_id,v_id,(v_page->'next'->>'before')::timestamptz,(v_page->'next'->>'before_id')::uuid);
 assert jsonb_array_length(v_next->'items')=5 and v_next->'next'='null'::jsonb,'last event page';
 assert not exists(select 1 from jsonb_array_elements(v_page->'items') a join jsonb_array_elements(v_next->'items') b on a->>'id'=b->>'id'),'no duplicate events';
 for i in 1..3 loop
  begin
   if i=1 then perform public.travel_admin_error_query(t.editor_id,t.site_id,'health');
   elsif i=2 then perform public.travel_admin_error_events(t.owner_id,t.other_site,v_id);
   else perform public.travel_admin_error_query(t.owner_id,t.other_site,'summary'); end if;
   raise exception 'unexpected access';exception when sqlstate 'PT403' then null;
  end;
 end loop;
 update app_private.site_memberships set active=false where site_id=t.site_id and user_id=t.admin_id;
 begin perform public.travel_admin_error_query(t.admin_id,t.site_id,'page');raise exception 'revoked access';exception when sqlstate 'PT403' then null;end;
 begin perform public.travel_admin_error_query(null,t.site_id,'health');raise exception 'anonymous access';exception when sqlstate 'PT401' then null;end;
 begin perform public.travel_admin_error_query(t.owner_id,t.site_id,'summary','{"period":"30d"}');raise exception 'invalid period';exception when sqlstate 'PT400' then null;end;
 -- Period boundaries exclude older events while all-time totals survive retention.
 update app_private.web_error_events set received_at=now()-interval '2 days' where issue_id=v_id;
 r:=public.travel_admin_error_query(t.owner_id,t.site_id,'summary','{"period":"24h","environment":"production"}');assert r->>'total'='0','24h event boundary';
 r:=public.travel_admin_error_query(t.owner_id,t.site_id,'summary','{"period":"7d","environment":"production"}');assert r->>'occurrences'='25','7d report count';
end $$;
reset role;
do $$ declare sig text;role_name text;begin
 foreach sig in array array['travel_error_ingest(jsonb,uuid)','travel_error_observe(uuid,text,text,text)','travel_admin_error_query(uuid,uuid,text,jsonb)','travel_admin_error_events(uuid,uuid,uuid,timestamptz,uuid)','travel_admin_error_resolve(uuid,uuid,uuid,bigint,text,text,text)'] loop
  foreach role_name in array array['anon','authenticated'] loop assert not has_function_privilege(role_name,'public.'||sig,'execute'),'public RPC access';end loop;
 end loop;
end $$;
select pass('Error ingestion dedupe, filters, health, resolution, event cursor, critical alert and authorization');
select * from finish();
rollback;
