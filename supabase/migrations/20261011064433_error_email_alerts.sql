-- Only server workers may claim alerts. No trigger or network calls run in the
-- error capture transaction; unavailable email never breaks error storage.
create table app_private.web_error_email_outbox (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references app_private.sites(id),
  issue_id uuid not null references app_private.web_error_issues(id),
  environment text not null check (environment in ('preview','production','development')),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  created_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  attempts integer not null default 0,
  provider_id text,
  last_error_code text
);
create index web_error_email_issue_recent on app_private.web_error_email_outbox(issue_id,created_at desc);
create index web_error_email_created on app_private.web_error_email_outbox(created_at);
alter table app_private.web_error_email_outbox enable row level security;
revoke all on app_private.web_error_email_outbox from public,anon,authenticated;
grant select,insert,update,delete on app_private.web_error_email_outbox to service_role;
create policy error_email_service_only on app_private.web_error_email_outbox for all to service_role using(true) with check(true);

create function public.travel_error_email(p_action text,p_input jsonb default '{}')
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
        available_at=now()+interval '5 minutes', lease_until=null,
        provider_id=case when p_input->>'sent'='true' then left(p_input->>'provider_id',100) else null end,
        last_error_code=case when p_input->>'sent'='true' then null else v_code end
      where id=(p_input->>'id')::uuid and lease_token=(p_input->>'lease_token')::uuid
        and status='sending' and lease_until>now();
    return to_jsonb(found);
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
      group by i.id having count(e.id)>=10 order by count(e.id) desc,i.id limit 1;
    if not found then return null; end if;
    insert into app_private.web_error_email_outbox(site_id,issue_id,environment,payload)
      values(v_site,v_issue.id,v_env,jsonb_build_object('issue_id',v_issue.id,'app',v_issue.app,
        'environment',v_env,'count',v_issue.event_count,'from',p_input->>'from','to',p_input->>'to'))
      returning * into v_job;
  end if;
  update app_private.web_error_email_outbox set status='sending',attempts=attempts+1,
    lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes'
    where id=v_job.id returning * into v_job;
  return jsonb_build_object('id',v_job.id,'lease_token',v_job.lease_token,'payload',v_job.payload);
end;
$$;
revoke all on function public.travel_error_email(text,jsonb) from public,anon,authenticated;
grant execute on function public.travel_error_email(text,jsonb) to service_role;
