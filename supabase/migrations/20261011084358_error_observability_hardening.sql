-- Versioned grouping, bounded duplicate keys, and service-only collection health.
alter table app_private.web_error_issues
  add column fingerprint_version smallint not null default 1,
  add column resolved_at timestamptz,
  add column resolved_by uuid,
  add column resolved_release text,
  add column resolution_note text check(length(resolution_note)<=500);
create table app_private.web_error_seen_reports (
 site_id uuid not null references app_private.sites(id), app text not null check(app in ('web','admin')),
 environment text not null check(environment in ('production','preview','development')),
 event_id uuid not null, created_at timestamptz not null default now(),
 primary key(site_id,app,environment,event_id)
);
create index web_error_seen_reports_created on app_private.web_error_seen_reports(created_at);
create table app_private.web_error_ingest_state (
 site_id uuid not null references app_private.sites(id), app text not null check(app in ('web','admin')),
 environment text not null check(environment in ('production','preview','development')),
 accepted bigint not null default 0, duplicates bigint not null default 0,
 limited bigint not null default 0, failed bigint not null default 0,
 last_received_at timestamptz, last_accepted_at timestamptz,
 last_email_run_at timestamptz, last_email_result text,
 primary key(site_id,app,environment)
);
alter table app_private.web_error_seen_reports enable row level security;
alter table app_private.web_error_ingest_state enable row level security;
revoke all on app_private.web_error_seen_reports,app_private.web_error_ingest_state from public,anon,authenticated;
grant select,insert,update,delete on app_private.web_error_seen_reports,app_private.web_error_ingest_state to service_role;
create policy service_only on app_private.web_error_seen_reports for all to service_role using(true) with check(true);
create policy service_only on app_private.web_error_ingest_state for all to service_role using(true) with check(true);
create function public.travel_error_observe(p_site_id uuid,p_app text,p_environment text,p_result text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_result not in ('accepted','duplicate','limited','failed','email_idle','email_claimed','email_accepted','email_failed') then
  raise exception 'invalid_result' using errcode='PT400'; end if;
 insert into app_private.web_error_ingest_state(site_id,app,environment) values(p_site_id,p_app,p_environment) on conflict do nothing;
 update app_private.web_error_ingest_state set
 accepted=accepted+(p_result='accepted')::int,duplicates=duplicates+(p_result='duplicate')::int,
 limited=limited+(p_result='limited')::int,failed=failed+(p_result='failed')::int,
 last_received_at=case when p_result not like 'email_%' then now() else last_received_at end,
 last_accepted_at=case when p_result='accepted' then now() else last_accepted_at end,
 last_email_run_at=case when p_result like 'email_%' then now() else last_email_run_at end,
 last_email_result=case when p_result like 'email_%' then p_result else last_email_result end
 where site_id=p_site_id and app=p_app and environment=p_environment;
end $$;
create function public.travel_error_ingest(p_input jsonb,p_event_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_new boolean; v_result jsonb;
begin
 if p_event_id is null then raise exception 'invalid_event_id' using errcode='PT400'; end if;
 insert into app_private.web_error_seen_reports(site_id,app,environment,event_id)
 values((p_input->>'site_id')::uuid,p_input->>'app',p_input->>'environment',p_event_id)
 on conflict do nothing returning true into v_new;
 if not coalesce(v_new,false) then
  perform public.travel_error_observe((p_input->>'site_id')::uuid,p_input->>'app',p_input->>'environment','duplicate');
  return jsonb_build_object('accepted',true,'duplicate',true);
 end if;
 v_result:=public.travel_error_capture(p_input);
 update app_private.web_error_issues set fingerprint_version=2
 where site_id=(p_input->>'site_id')::uuid and app=p_input->>'app' and environment=p_input->>'environment' and fingerprint=p_input->>'fingerprint';
 perform public.travel_error_observe((p_input->>'site_id')::uuid,p_input->>'app',p_input->>'environment','accepted');
 return v_result;
end $$;
-- Expiring only dedupe metadata uses the already-approved 14-day event policy.
create function app_private.purge_web_error_dedupe() returns void language sql security invoker set search_path='' as $$
 delete from app_private.web_error_seen_reports where created_at<now()-interval '14 days';
$$;
revoke all on function app_private.purge_web_error_dedupe() from public,anon,authenticated;
grant execute on function app_private.purge_web_error_dedupe() to service_role;
select cron.schedule('travel-error-dedupe-retention','27 * * * *',$$select app_private.purge_web_error_dedupe();$$);

-- Shared filters ensure list and aggregate describe the same population.
create function public.travel_admin_error_query(p_actor uuid,p_site_id uuid,p_mode text,p_filters jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_app text:=coalesce(p_filters->>'app','all');v_env text:=coalesce(p_filters->>'environment','all');
 v_period text:=coalesce(p_filters->>'period','all');v_status text:=coalesce(p_filters->>'status','all');
 v_search text:=lower(coalesce(p_filters->>'search',''));v_limit int:=coalesce((p_filters->>'limit')::int,20);
 v_offset int:=coalesce((p_filters->>'offset')::int,0);v_from timestamptz;v_result jsonb;
begin
 perform app_private.require_member(p_site_id,p_actor,array['owner','admin']::text[]);
 if v_app not in ('all','web','admin') or v_env not in ('all','production','preview','development')
 or v_period not in ('all','24h','7d','14d') or v_status not in ('all','open','resolved','ignored')
 or p_mode not in ('page','summary','health') or v_limit not between 1 and 50 or v_offset<0
 or (v_search<>'' and v_search !~ '^([0-9a-f]{64}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$') then
 raise exception 'invalid_error_query' using errcode='PT400'; end if;
 v_from:=case v_period when '24h' then now()-interval '24 hours' when '7d' then now()-interval '7 days' when '14d' then now()-interval '14 days' else null end;
 if p_mode='health' then
  return jsonb_build_object('collection',coalesce((select jsonb_agg(to_jsonb(h)) from app_private.web_error_ingest_state h
   where h.site_id=p_site_id and (v_app='all' or h.app=v_app) and (v_env='all' or h.environment=v_env)),'[]'),
   'email',jsonb_build_object('pending',(select count(*) from app_private.web_error_email_outbox where site_id=p_site_id and (v_env='all' or environment=v_env) and status in ('pending','sending')),
   'failed',(select count(*) from app_private.web_error_email_outbox where site_id=p_site_id and (v_env='all' or environment=v_env) and status='failed'),
   'accepted',(select count(*) from app_private.web_error_email_outbox where site_id=p_site_id and (v_env='all' or environment=v_env) and status='sent')));
 end if;
 with matching as materialized (
  select i.id,i.site_id,i.app,i.environment,i.fingerprint,i.status,i.first_seen_at,i.last_seen_at,
   case when v_from is null then i.occurrence_count else e.n end as occurrence_count,
   i.last_error_name error_name,i.last_message message,i.last_route route,i.last_source source,
   i.last_release release,i.last_request_id request_id
  from app_private.web_error_issues i
  left join lateral(select count(*) n from app_private.web_error_events e where e.issue_id=i.id and e.received_at>=v_from) e on v_from is not null
  where i.site_id=p_site_id and (v_app='all' or i.app=v_app) and (v_env='all' or i.environment=v_env)
   and (v_from is null or e.n>0) and (v_status='all' or i.status=v_status)
   and (v_search='' or i.id::text=v_search or i.fingerprint=v_search or i.last_request_id=v_search or i.last_origin_request_id::text=v_search
    or exists(select 1 from app_private.web_error_events x where x.issue_id=i.id and (x.request_id=v_search or x.origin_request_id::text=v_search)))
 ), page as (select * from matching order by last_seen_at desc,id limit v_limit offset v_offset),
 top_issues as (select * from matching order by occurrence_count desc,last_seen_at desc,id limit 5)
 select case when p_mode='page' then jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p) order by p.last_seen_at desc,p.id) from page p),'[]'), 'total',count(*))
 else jsonb_build_object('total',count(*),'occurrences',coalesce(sum(occurrence_count),0),
  'open',count(*) filter(where status='open'),'resolved',count(*) filter(where status='resolved'),'ignored',count(*) filter(where status='ignored'),
  'top',coalesce((select jsonb_agg(to_jsonb(t) order by t.occurrence_count desc,t.last_seen_at desc,t.id) from top_issues t),'[]')) end into v_result from matching;
 return v_result;
end $$;

create function public.travel_admin_error_events(p_actor uuid,p_site_id uuid,p_issue_id uuid,p_before timestamptz default null,p_before_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_events jsonb;v_next jsonb;
begin
 perform app_private.require_member(p_site_id,p_actor,array['owner','admin']::text[]);
 if not exists(select 1 from app_private.web_error_issues where id=p_issue_id and site_id=p_site_id) then raise exception 'not_found' using errcode='PT404'; end if;
 if (p_before is null)<>(p_before_id is null) then raise exception 'invalid_cursor' using errcode='PT400'; end if;
 with page as (select * from app_private.web_error_events where issue_id=p_issue_id
 and (p_before is null or received_at<p_before or (received_at=p_before and id>p_before_id)) order by received_at desc,id limit 21),
 visible as (select * from page order by received_at desc,id limit 20)
 select coalesce((select jsonb_agg(to_jsonb(v) order by v.received_at desc,v.id) from visible v),'[]'),
 case when (select count(*) from page)>20 then (select jsonb_build_object('before',received_at,'before_id',id) from visible order by received_at,id desc limit 1) else null end
 into v_events,v_next;
 return jsonb_build_object('items',v_events,'next',v_next);
end $$;
create or replace function public.travel_admin_error_manage(p_actor uuid,p_site_id uuid,p_issue_id uuid,
  p_action text,p_expected_count bigint,p_status text default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_issue app_private.web_error_issues;
begin
  perform app_private.require_member(p_site_id,p_actor,array['owner','admin']::text[]);
  if p_action is null or p_action not in ('status','delete')
    or p_expected_count is null or p_expected_count<1
    or (p_action='status' and (p_status is null or p_status not in ('open','resolved')))
    or (p_action='delete' and p_status is not null) then
    raise exception 'invalid_error_change' using errcode='PT400';
  end if;
  -- Same lock as email claiming: a deletion cannot race a newly claimed delivery.
  perform pg_advisory_xact_lock(712901347);
  select * into v_issue from app_private.web_error_issues
    where id=p_issue_id and site_id=p_site_id for update;
  if not found then raise exception 'error_issue_not_found' using errcode='PT404'; end if;
  if v_issue.occurrence_count<>p_expected_count then
    raise exception 'version_conflict' using errcode='PT409';
  end if;
  if p_action='status' then
    update app_private.web_error_issues set status=p_status, resolved_at=case when p_status='resolved' then now() else resolved_at end, resolved_by=case when p_status='resolved' then p_actor else resolved_by end, resolved_release=case when p_status='resolved' then last_release else resolved_release end where id=p_issue_id;
    perform app_private.audit(p_site_id,p_actor,'error.status',p_issue_id,
      jsonb_build_object('from',v_issue.status,'to',p_status));
    return jsonb_build_object('saved',true);
  end if;
  if exists(select 1 from app_private.web_error_email_outbox where issue_id=p_issue_id
    and status='sending' and lease_until>now()) then
    raise exception 'error_email_in_flight' using errcode='PT409';
  end if;
  update app_private.web_error_email_outbox set status='failed',last_error_code='issue_deleted',
    lease_until=null,lease_token=null where issue_id=p_issue_id and status in ('pending','sending');
  delete from app_private.web_error_issues where id=p_issue_id;
  perform app_private.audit(p_site_id,p_actor,'error.delete',p_issue_id,
    jsonb_build_object('occurrence_count',v_issue.occurrence_count));
  return jsonb_build_object('deleted',true);
end $$;

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
    select id, site_id, app, environment, fingerprint, status, fingerprint_version, resolved_at, resolved_by, resolved_release, resolution_note,
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
revoke all on function public.travel_error_observe(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.travel_error_observe(uuid,text,text,text) to service_role;
revoke all on function public.travel_error_ingest(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.travel_error_ingest(jsonb,uuid) to service_role;
revoke all on function public.travel_admin_error_query(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.travel_admin_error_query(uuid,uuid,text,jsonb) to service_role;
revoke all on function public.travel_admin_error_events(uuid,uuid,uuid,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.travel_admin_error_events(uuid,uuid,uuid,timestamptz,uuid) to service_role;
notify pgrst,'reload schema';

create function public.travel_admin_error_resolve(p_actor uuid,p_site_id uuid,p_issue_id uuid,p_expected_count bigint,p_status text,p_note text default null,p_release text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_result jsonb;
begin
 if length(p_note)>500 or (p_release is not null and p_release !~ '^[A-Za-z0-9._-]{1,80}$') then raise exception 'invalid_resolution' using errcode='PT400'; end if;
 v_result:=public.travel_admin_error_manage(p_actor,p_site_id,p_issue_id,'status',p_expected_count,p_status);
 if p_status='resolved' then
  update app_private.web_error_issues set resolution_note=nullif(trim(p_note),''),resolved_release=nullif(p_release,'') where id=p_issue_id;
 end if;
 return v_result;
end $$;
revoke all on function public.travel_admin_error_resolve(uuid,uuid,uuid,bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.travel_admin_error_resolve(uuid,uuid,uuid,bigint,text,text,text) to service_role;

create or replace function public.travel_error_email(p_action text,p_input jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_job app_private.web_error_email_outbox;
  v_issue record;
  v_site uuid;
  v_env text := p_input->>'environment';
  v_code text;
begin
  if p_action = 'finish' then
    v_code := case when p_input->>'code' ~ '^[a-z0-9_]{1,64}$' then p_input->>'code' else 'send_failed' end;
    update app_private.web_error_email_outbox
      set status=case when p_input->>'sent'='true' then 'sent'
        when attempts>=3 or p_input->>'retryable'='false' then 'failed' else 'pending' end,
        available_at=now()+make_interval(secs=>greatest(300,least(86400,
          case when p_input->>'retry_after_seconds' ~ '^[0-9]{1,6}$'
            then (p_input->>'retry_after_seconds')::integer else 300 end))), lease_until=null,
        provider_id=case when p_input->>'sent'='true' then left(p_input->>'provider_id',100) else null end,
        last_error_code=case when p_input->>'sent'='true' then null else v_code end
      where id=(p_input->>'id')::uuid and lease_token=(p_input->>'lease_token')::uuid
        and status='sending' and lease_until>now();
    if found then
      select * into v_job from app_private.web_error_email_outbox where id=(p_input->>'id')::uuid;
      perform public.travel_error_observe(v_job.site_id,'admin',v_job.environment,case when p_input->>'sent'='true' then 'email_accepted' else 'email_failed' end);
      return 'true'::jsonb;
    end if;
    return 'false'::jsonb;
  end if;
  if p_action <> 'claim' then raise exception 'invalid_action'; end if;
  if v_env is null or v_env not in ('preview','production','development')
    or coalesce(p_input->>'from','') !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}$'
    or coalesce(p_input->>'to','') !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}$'
    or length(p_input->>'from')>254 or length(p_input->>'to')>254 then
    raise exception 'invalid_config';
  end if;
  select id into v_site from app_private.sites where slug=p_input->>'site_slug' and status='active';
  if v_site is null then return null; end if;
  perform public.travel_error_observe(v_site,'admin',v_env,'email_idle');
  -- Serializes claims across instances and environments, including quota reservation.
  perform pg_advisory_xact_lock(712901347);
  -- Never retry after the provider's 24-hour idempotency window.
  update app_private.web_error_email_outbox set status='failed',last_error_code='retry_expired'
    where site_id=v_site and environment=v_env and status in ('pending','sending')
      and (created_at<now()-interval '23 hours' or
        (attempts>=3 and coalesce(lease_until,available_at)<=now()));
  select o.* into v_job from app_private.web_error_email_outbox o
    join app_private.web_error_issues i on i.id=o.issue_id
    where o.site_id=v_site and o.environment=v_env and i.status='open'
      and o.attempts<3 and o.created_at>=now()-interval '23 hours'
      and ((o.status='pending' and o.available_at<=now()) or
        (o.status='sending' and o.lease_until<=now()))
    order by o.created_at limit 1 for update of o;
  if v_job.id is null then
    if (select count(*) from app_private.web_error_email_outbox where created_at>now()-interval '24 hours')>=50 then return null; end if;
    select i.id,i.app,i.environment,count(e.id)::integer event_count into v_issue
      from app_private.web_error_issues i join app_private.web_error_events e on e.issue_id=i.id
      where i.site_id=v_site and i.environment=v_env and i.status='open'
        and e.received_at>now()-interval '5 minutes'
        and not exists(select 1 from app_private.web_error_email_outbox o where o.issue_id=i.id
          and (o.created_at>now()-interval '30 minutes' or o.status in ('pending','sending')))
      group by i.id having count(e.id)>=10 or bool_or(e.operation in ('admin.post.save','admin.post.publish') and e.http_status>=500) order by count(e.id) desc,i.id limit 1;
    if not found then return null; end if;
    insert into app_private.web_error_email_outbox(site_id,issue_id,environment,payload)
      values(v_site,v_issue.id,v_env,jsonb_build_object('issue_id',v_issue.id,'app',v_issue.app,
        'environment',v_env,'count',v_issue.event_count,'from',p_input->>'from','to',p_input->>'to',
        'admin_url',case when p_input->>'admin_url' ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' then p_input->>'admin_url' else null end))
      returning * into v_job;
  end if;
  update app_private.web_error_email_outbox set status='sending',attempts=attempts+1,
    lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes'
    where id=v_job.id returning * into v_job;
  perform public.travel_error_observe(v_job.site_id,'admin',v_job.environment,'email_claimed');
  return jsonb_build_object('id',v_job.id,'lease_token',v_job.lease_token,'payload',v_job.payload);
end;
$$;
revoke all on function public.travel_error_email(text,jsonb) from public,anon,authenticated;
grant execute on function public.travel_error_email(text,jsonb) to service_role;
