-- Site-wide cumulative aggregates. Independent of the paginated list/filter.
-- Retention deletes individual events, not these issue occurrence counters.
create function public.travel_admin_error_summary(p_actor uuid,p_site_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_result jsonb;
begin
  perform app_private.require_member(p_site_id,p_actor,array['owner','admin']::text[]);
  with issues as materialized (
    select id,site_id,app,environment,fingerprint,status,first_seen_at,last_seen_at,occurrence_count,
      last_error_name as error_name,last_message as message,last_route as route,last_source as source,
      last_release as release,last_request_id as request_id
    from app_private.web_error_issues where site_id=p_site_id
  ), top_issues as (
    select * from issues order by occurrence_count desc,last_seen_at desc,id limit 5
  ) select jsonb_build_object(
    'total',count(*),'occurrences',coalesce(sum(occurrence_count),0),
    'open',count(*) filter(where status='open'),
    'resolved',count(*) filter(where status='resolved'),
    'ignored',count(*) filter(where status='ignored'),
    'top',coalesce((select jsonb_agg(to_jsonb(t) order by t.occurrence_count desc,t.last_seen_at desc,t.id) from top_issues t),'[]'::jsonb)
  ) into v_result from issues;
  return v_result;
end $$;
revoke all on function public.travel_admin_error_summary(uuid,uuid) from public,anon,authenticated;
grant execute on function public.travel_admin_error_summary(uuid,uuid) to service_role;
notify pgrst, 'reload schema';
