begin;
create extension if not exists pgtap with schema extensions;
select plan(1);

create temporary table media_serverless_ids as
select gen_random_uuid() as owner_id,
  gen_random_uuid() as site_id,
  gen_random_uuid() as processing_id,
  gen_random_uuid() as retry_id,
  gen_random_uuid() as preview_id,
  gen_random_uuid() as referenced_id,
  gen_random_uuid() as orphan_id;
grant select on media_serverless_ids to service_role;

insert into auth.users(id,aud,role,email,created_at,updated_at)
select owner_id,'authenticated','authenticated',
  'media-serverless-test@example.invalid',now(),now()
from media_serverless_ids;
insert into app_private.sites(id,slug,name)
select site_id,'test-'||site_id,'Media serverless test' from media_serverless_ids;

insert into app_private.media_assets
  (id,site_id,owner_id,kind,bucket,object_path,state,metadata,preview_asset_id,
   cleanup_state,cleanup_after,cleanup_lease_until,created_at)
select processing_id,site_id,owner_id,'image','originals-private',
  site_id||'/'||processing_id||'/source.jpg','processing','{}'::jsonb,null::uuid,
  'active',null,null,now()
from media_serverless_ids
union all
select preview_id,site_id,owner_id,'image','documents-private',
  site_id||'/'||retry_id||'/first-page.png','ready','{}'::jsonb,null::uuid,
  'deleting',now()-interval '8 days',now()-interval '10 minutes',now()-interval '181 days'
from media_serverless_ids
union all
select retry_id,site_id,owner_id,'pdf','documents-private',
  site_id||'/'||retry_id||'/document.pdf','ready','{}'::jsonb,preview_id,
  'deleting',now()-interval '8 days',now()-interval '10 minutes',now()-interval '181 days'
from media_serverless_ids
union all
select referenced_id,site_id,owner_id,'image','draft-media-private',
  site_id||'/'||referenced_id||'/source.jpg','ready','{}'::jsonb,null::uuid,
  'active',null,null,now()-interval '181 days'
from media_serverless_ids
union all
select orphan_id,site_id,owner_id,'image','draft-media-private',
  site_id||'/'||orphan_id||'/source.jpg','ready','{}'::jsonb,null::uuid,
  'active',null,null,now()-interval '181 days'
from media_serverless_ids;

insert into app_private.posts(site_id,author_id,kind,draft_content)
select site_id,owner_id,'article',jsonb_build_object('asset_id',referenced_id::text)
from media_serverless_ids;
update app_private.media_assets a set cleanup_state='deleting',
  cleanup_after=now()-interval '8 days',
  cleanup_lease_until=now()-interval '1 minute'
from media_serverless_ids t where a.id=t.referenced_id;

insert into app_private.outbox_jobs(site_id,type,resource_id,dedupe_key,next_run_at)
select site_id,'invalidate_cache',gen_random_uuid(),'cache-test',now()-interval '2 hours'
from media_serverless_ids
union all
select site_id,'process_asset',processing_id,'process-test',now()-interval '1 hour'
from media_serverless_ids;

set local role service_role;
do $$
declare
  t record;
  claim jsonb;
  cleanup jsonb;
  first_lease timestamptz;
begin
  select * into t from media_serverless_ids;

  -- Earlier cache jobs must not be claimed by a media-only processor.
  claim:=public.travel_worker('claim','{}'::jsonb);
  assert claim->'job'->>'type'='process_asset';
  assert claim->'asset'->>'id'=t.processing_id::text;
  assert public.travel_worker('claim','{}'::jsonb) is null;
  assert exists(select 1 from app_private.outbox_jobs
    where type='invalidate_cache' and status='queued' and attempts=0);

  -- An expired deletion lease is reclaimed without clearing the quarantine.
  first_lease:=now()-interval '10 minutes';
  cleanup:=public.travel_media_cleanup('cleanup_claim','{}'::jsonb);
  assert cleanup->>'stage'='delete';
  assert cleanup->>'id'=t.retry_id::text;
  assert cleanup->'preview'->>'id'=t.preview_id::text;
  assert (cleanup->>'lease_until')::timestamptz>now();
  assert exists(select 1 from app_private.media_assets
    where id in (t.retry_id,t.preview_id) and cleanup_state='deleting'
    group by cleanup_lease_until having count(*)=2);
  begin
    perform public.travel_media_cleanup('cleanup_finalize',jsonb_build_object(
      'id',t.retry_id,'lease_until',first_lease));
    raise exception 'stale cleanup lease accepted';
  exception when sqlstate 'PT409' then null; end;
  insert into app_private.outbox_jobs(site_id,type,resource_id,dedupe_key)
  values(t.site_id,'invalidate_cache',t.retry_id,'late-retry-test');
  begin
    perform public.travel_media_cleanup('cleanup_finalize',jsonb_build_object(
      'id',t.retry_id,'lease_until',cleanup->>'lease_until'));
    raise exception 'cleanup finalized while a job referenced the asset';
  exception when sqlstate 'PT409' then null; end;
  assert exists(select 1 from app_private.media_assets
    where id=t.retry_id and cleanup_state='deleting');
  -- A queued job appearing during deletion blocks retry without breaking the
  -- parent/preview lease pair. Once it goes away, both can be claimed again.
  update app_private.media_assets set cleanup_lease_until=now()-interval '2 minutes'
    where id in (t.retry_id,t.preview_id);
  cleanup:=public.travel_media_cleanup('cleanup_claim','{}'::jsonb);
  assert cleanup->>'stage'='blocked';
  assert cleanup->>'id'=t.retry_id::text;
  assert exists(select 1 from app_private.media_assets
    where id in (t.retry_id,t.preview_id) and cleanup_state='deleting'
    group by cleanup_lease_until having count(*)=2);
  delete from app_private.outbox_jobs where site_id=t.site_id and dedupe_key='late-retry-test';
  update app_private.media_assets set cleanup_lease_until=now()-interval '2 minutes'
    where id in (t.retry_id,t.preview_id);
  cleanup:=public.travel_media_cleanup('cleanup_claim','{}'::jsonb);
  assert cleanup->>'stage'='delete';
  assert cleanup->>'id'=t.retry_id::text;
  assert public.travel_media_cleanup('cleanup_finalize',jsonb_build_object(
    'id',t.retry_id,'lease_until',cleanup->>'lease_until'))->>'deleted'='true';
  assert not exists(select 1 from app_private.media_assets
    where id in (t.retry_id,t.preview_id));

  -- A privileged late reference must never be restored to active after a
  -- possibly partial Storage delete. It remains fenced for investigation.
  cleanup:=public.travel_media_cleanup('cleanup_claim','{}'::jsonb);
  assert cleanup->>'stage'='blocked';
  assert cleanup->>'id'=t.referenced_id::text;
  assert exists(select 1 from app_private.media_assets
    where id=t.referenced_id and cleanup_state='deleting'
      and cleanup_lease_until>now());

  -- Newly eligible, unreferenced assets still enter the seven-day quarantine.
  cleanup:=public.travel_media_cleanup('cleanup_claim','{}'::jsonb);
  assert cleanup->>'stage'='quarantined';
  assert cleanup->>'id'=t.orphan_id::text;
  assert exists(select 1 from app_private.media_assets
    where id=t.orphan_id and cleanup_state='quarantined'
      and cleanup_after>now()+interval '6 days');
end $$;

reset role;
select ok(
  not has_function_privilege('anon','public.travel_worker(text,jsonb)','EXECUTE')
  and not has_function_privilege('authenticated','public.travel_media_cleanup(text,jsonb)','EXECUTE'),
  'media claim and cleanup remain service-role only; lifecycle assertions passed'
);
select * from finish();
rollback;
