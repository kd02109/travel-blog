-- Preserve delivery/quota history when an administrator removes an issue.
-- Historical email payloads contain only the issue ID/app/environment/count.
alter table app_private.web_error_email_outbox alter column issue_id drop not null;
alter table app_private.web_error_email_outbox drop constraint web_error_email_outbox_issue_id_fkey;
alter table app_private.web_error_email_outbox add constraint web_error_email_outbox_issue_id_fkey
  foreign key (issue_id) references app_private.web_error_issues(id) on delete set null;

create index web_error_events_request_idx on app_private.web_error_events(request_id);

create function public.travel_admin_error_page(
  p_actor uuid, p_site_id uuid, p_limit integer default 20, p_offset integer default 0,
  p_status text default 'all', p_search text default ''
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_result jsonb;
begin
  perform app_private.require_member(p_site_id,p_actor,array['owner','admin']::text[]);
  if p_limit is null or p_limit not between 1 and 50 or p_offset is null or p_offset < 0
    or p_status is null or p_status not in ('all','open','resolved','ignored')
    or p_search is null or (p_search <> '' and p_search !~* '^([0-9a-f]{64}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$') then
    raise exception 'invalid_error_query' using errcode='PT400';
  end if;
  with matching as materialized (
    select i.id,i.site_id,i.app,i.environment,i.fingerprint,i.status,
      i.first_seen_at,i.last_seen_at,i.occurrence_count,
      i.last_error_name as error_name,i.last_message as message,
      i.last_route as route,i.last_source as source,
      i.last_release as release,i.last_request_id as request_id
    from app_private.web_error_issues i
    where i.site_id=p_site_id and (p_status='all' or i.status=p_status)
      and (p_search='' or i.id::text=lower(p_search) or i.fingerprint=lower(p_search)
        or i.last_request_id=lower(p_search) or i.last_origin_request_id::text=lower(p_search)
        or exists(select 1 from app_private.web_error_events e where e.issue_id=i.id
          and (e.request_id=lower(p_search) or e.origin_request_id::text=lower(p_search))))
  ), page as (
    select * from matching order by last_seen_at desc,id limit p_limit offset p_offset
  ) select jsonb_build_object(
    'items',coalesce((select jsonb_agg(to_jsonb(p) order by p.last_seen_at desc,p.id) from page p),'[]'::jsonb),
    'total',(select count(*) from matching)
  ) into v_result;
  return v_result;
end $$;

create function public.travel_admin_error_manage(p_actor uuid,p_site_id uuid,p_issue_id uuid,
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
    update app_private.web_error_issues set status=p_status where id=p_issue_id;
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

revoke all on function public.travel_admin_error_page(uuid,uuid,integer,integer,text,text) from public,anon,authenticated;
revoke all on function public.travel_admin_error_manage(uuid,uuid,uuid,text,bigint,text) from public,anon,authenticated;
grant execute on function public.travel_admin_error_page(uuid,uuid,integer,integer,text,text) to service_role;
grant execute on function public.travel_admin_error_manage(uuid,uuid,uuid,text,bigint,text) to service_role;
notify pgrst, 'reload schema';
