-- The worker invokes travel_media_cleanup as service_role. That RPC runs as
-- SECURITY INVOKER and therefore needs EXECUTE on its private helper.
grant execute on function app_private.media_asset_has_refs(uuid, uuid) to service_role;
