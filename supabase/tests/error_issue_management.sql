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
declare t record; r jsonb; a uuid; fp jsonb;
begin
 select * into t from error_management_ids;
 r:=public.travel_admin_error_summary(t.owner_id,t.site_id);
 assert (r->>'total')::int=25 and (r->>'occurrences')::int=26 and (r->>'open')::int=25,'summary entire site beyond first page';
 assert jsonb_array_length(r->'top')=5 and r->'top'->0->>'id'=t.issue_id::text,'top frequency ordering/limit';
 assert r=public.travel_admin_error_summary(t.admin_id,t.site_id),'stable top ordering';
 begin perform public.travel_admin_error_summary(t.editor_id,t.site_id);raise exception 'editor summary allowed';exception when sqlstate 'PT403' then null;end;
 begin perform public.travel_admin_error_summary(t.owner_id,t.other_site);raise exception 'cross site summary allowed';exception when sqlstate 'PT403' then null;end;
 begin perform public.travel_admin_error_summary(null,t.site_id);raise exception 'anonymous summary allowed';exception when sqlstate 'PT401' then null;end;
 r:=public.travel_admin_error_page(t.owner_id,t.site_id,20,0);
 assert (r->>'total')::int=25 and jsonb_array_length(r->'items')=20,'first page/total';
 fp:=r->'items'; r:=public.travel_admin_error_page(t.admin_id,t.site_id,20,20);
 assert jsonb_array_length(r->'items')=5,'second page';
 assert not exists(select 1 from jsonb_array_elements(fp) x join jsonb_array_elements(r->'items') y on x->>'id'=y->>'id'),'duplicate pages';
 r:=public.travel_admin_error_page(t.owner_id,t.site_id,20,999);
 assert jsonb_array_length(r->'items')=0 and (r->>'total')::int=25,'empty page retains total';
 foreach a in array array[t.issue_id,t.request_id,t.origin_id] loop
  r:=public.travel_admin_error_page(t.owner_id,t.site_id,20,0,'all',a::text);
  assert (r->>'total')::int=1 and r->'items'->0->>'id'=t.issue_id::text,'ID lookup';
 end loop;
 r:=public.travel_admin_error_page(t.owner_id,t.site_id,20,0,'all',repeat('f',64));
 assert (r->>'total')::int=1,'fingerprint';
 begin perform public.travel_admin_error_page(t.editor_id,t.site_id);raise exception 'editor read allowed';exception when sqlstate 'PT403' then null;end;
 begin perform public.travel_admin_error_manage(t.editor_id,t.site_id,t.issue_id,'delete',2);raise exception 'editor delete allowed';exception when sqlstate 'PT403' then null;end;
 begin perform public.travel_admin_error_manage(t.owner_id,t.other_site,t.issue_id,'delete',2);raise exception 'cross site allowed';exception when sqlstate 'PT403' then null;end;
 begin perform public.travel_admin_error_manage(null,t.site_id,t.issue_id,'delete',2);raise exception 'anonymous allowed';exception when sqlstate 'PT401' then null;end;
 begin perform public.travel_admin_error_manage(t.owner_id,t.site_id,t.issue_id,'status',1,'resolved');raise exception 'stale mutation allowed';exception when sqlstate 'PT409' then null;end;
 perform public.travel_admin_error_manage(t.owner_id,t.site_id,t.issue_id,'status',2,'resolved');
 r:=public.travel_admin_error_page(t.owner_id,t.site_id,20,0,'resolved');
 assert (r->>'total')::int=1,'resolved status filter';
 r:=public.travel_admin_error_summary(t.owner_id,t.site_id);
 assert (r->>'open')::int=24 and (r->>'resolved')::int=1 and (r->>'occurrences')::int=26,'summary counts resolved';
 perform public.travel_error_capture(jsonb_build_object('site_id',t.site_id,'app','admin','environment','preview','source','browser',
  'fingerprint',repeat('f',64),'error_name','Error','message','test','route','/posts'));
 r:=public.travel_admin_error_issue(t.owner_id,t.site_id,t.issue_id);
 assert r->'issue'->>'status'='open' and (r->'issue'->>'occurrence_count')::int=3,'recurrence reopens';
 update app_private.site_memberships set active=false where site_id=t.site_id and user_id=t.admin_id;
 begin perform public.travel_admin_error_manage(t.admin_id,t.site_id,t.issue_id,'status',3,'resolved');raise exception 'revoked role allowed';exception when sqlstate 'PT403' then null;end;
 begin perform public.travel_admin_error_summary(t.admin_id,t.site_id);raise exception 'revoked summary allowed';exception when sqlstate 'PT403' then null;end;
 update app_private.web_error_email_outbox set status='sending',lease_until=now()+interval '1 minute' where issue_id=t.issue_id;
 begin perform public.travel_admin_error_manage(t.owner_id,t.site_id,t.issue_id,'delete',3);raise exception 'in-flight deletion allowed';exception when sqlstate 'PT409' then null;end;
 update app_private.web_error_email_outbox set lease_until=now()-interval '1 minute' where issue_id=t.issue_id;
 perform public.travel_admin_error_manage(t.owner_id,t.site_id,t.issue_id,'delete',3);
 assert not exists(select 1 from app_private.web_error_events where issue_id=t.issue_id),'events not deleted';
 r:=public.travel_admin_error_summary(t.owner_id,t.site_id);
 assert (r->>'total')::int=24 and (r->>'occurrences')::int=24,'deleted issue excluded';
 delete from app_private.web_error_issues where site_id=t.site_id;
 r:=public.travel_admin_error_summary(t.owner_id,t.site_id);
 assert r='{"total":0,"occurrences":0,"open":0,"resolved":0,"ignored":0,"top":[]}'::jsonb,'empty summary';
 assert exists(select 1 from app_private.web_error_email_outbox where site_id=t.site_id and issue_id is null and status='failed'),'delivery/quota history lost';
 assert exists(select 1 from app_private.audit_events where resource_id=t.issue_id and action='error.delete'),'audit missing';
 begin perform public.travel_admin_error_issue(t.owner_id,t.site_id,t.issue_id);raise exception 'deleted detail accessible';exception when sqlstate 'PT404' then null;end;
end $$;
reset role;
do $$
declare r text;
begin
 foreach r in array array['anon','authenticated'] loop
  assert not has_function_privilege(r,'public.travel_admin_error_summary(uuid,uuid)','execute');
  assert not has_function_privilege(r,'public.travel_admin_error_page(uuid,uuid,integer,integer,text,text)','execute');
  assert not has_function_privilege(r,'public.travel_admin_error_manage(uuid,uuid,uuid,text,bigint,text)','execute');
 end loop;
end $$;
select pass('Error pagination, lookup, authorization, resolve/recur, stale writes, in-flight/delete, audit and quota preservation');
select * from finish();
rollback;
