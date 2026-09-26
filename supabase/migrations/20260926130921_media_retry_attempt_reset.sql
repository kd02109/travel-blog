-- Retrying a fully failed asset starts a fresh bounded attempt budget.
create function app_private.reset_media_job_attempts() returns trigger
language plpgsql set search_path='' as $$
begin
 if old.status='failed' and new.status='queued' and old.type='process_asset' and new.type='process_asset' then
  new.attempts:=0;
 end if;
 return new;
end $$;
revoke all on function app_private.reset_media_job_attempts() from public,anon,authenticated;
create trigger reset_media_job_attempts_before_requeue
before update of status on app_private.outbox_jobs
for each row execute function app_private.reset_media_job_attempts();
