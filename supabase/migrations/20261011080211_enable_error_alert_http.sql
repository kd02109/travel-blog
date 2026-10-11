-- Enables outbound HTTP for the approved server-side error alert scheduler.
-- Does not create a schedule, store credentials, or enable email delivery.
create extension if not exists pg_net with schema extensions;
-- Application clients must not dispatch arbitrary HTTP requests.
do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as signature from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='net' and p.proname in ('http_get','http_post','http_delete')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn.signature);
  end loop;
end $$;
