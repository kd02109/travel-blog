-- The trigger is SECURITY INVOKER. Its internal validation helper must be
-- executable by the trusted service role that writes through travel-api.
grant execute on function app_private.assert_active_asset_refs(uuid, jsonb)
  to service_role;
