-- N4 Preview dispatch was verified, then explicitly removed at the user's request.
-- Hosted pg_net functions retained platform-owned EXECUTE grants; do not leave
-- this optional networking extension enabled after the temporary test.
-- No CASCADE: fail rather than remove any unrelated dependency.
drop extension if exists pg_net;
