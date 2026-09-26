create policy account_deletion_service_role_only
  on app_private.account_deletion_requests
  for all to service_role
  using (true)
  with check (true);
