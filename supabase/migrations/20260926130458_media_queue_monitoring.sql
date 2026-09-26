-- Read-only queue metrics for the trusted worker's structured log alerts.
create function public.travel_queue_health() returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'queued',count(*) filter (where status='queued'),
  'running',count(*) filter (where status='running'),
  'failed',count(*) filter (where status='failed'),
  'expired_leases',count(*) filter (where status='running' and lease_until<now()),
  'oldest_queued_seconds',coalesce(floor(extract(epoch from now()-min(next_run_at) filter (where status='queued'))),0)::bigint
 ) from app_private.outbox_jobs
$$;
revoke all on function public.travel_queue_health() from public,anon,authenticated;
grant execute on function public.travel_queue_health() to service_role;
notify pgrst,'reload schema';
