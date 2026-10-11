-- Event details expire after 14 days; issue counts/status remain available.
create extension if not exists pg_cron;

create function app_private.purge_web_error_events()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cutoff timestamptz := now() - interval '14 days';
  v_events integer;
  v_issues integer;
begin
  -- Bounded batches avoid a long transaction after an extended outage.
  with expired as (
    select id from app_private.web_error_events
    where received_at < v_cutoff
    order by received_at, id
    limit 5000 for update skip locked
  ), removed as (
    delete from app_private.web_error_events e using expired
    where e.id = expired.id returning e.id
  ) select count(*) into v_events from removed;

  with expired as (
    select id from app_private.web_error_issues
    where last_seen_at < v_cutoff
      and (last_masked_message is not null or last_masked_stack is not null
        or last_stack_frames <> '[]'::jsonb or last_request_id is not null
        or last_origin_request_id is not null)
    order by last_seen_at, id
    limit 5000 for update skip locked
  ), cleared as (
    update app_private.web_error_issues i
    set last_masked_message = null, last_masked_stack = null,
      last_stack_frames = '[]'::jsonb, last_request_id = null,
      last_origin_request_id = null
    from expired where i.id = expired.id returning i.id
  ) select count(*) into v_issues from cleared;

  raise log 'web_error_retention deleted_events=% cleared_issue_details=%', v_events, v_issues;
  return jsonb_build_object('deleted_events', v_events, 'cleared_issue_details', v_issues);
end;
$$;
revoke all on function app_private.purge_web_error_events() from public, anon, authenticated;
grant execute on function app_private.purge_web_error_events() to service_role;

select cron.schedule('travel-error-event-retention', '17 * * * *',
  $$select app_private.purge_web_error_events();$$);
