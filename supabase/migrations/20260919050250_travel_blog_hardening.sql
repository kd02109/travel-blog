-- Existing event-trigger helper must not be a client RPC.
-- Hosted projects may have this helper; fresh local stacks need not have it.
do $$ begin
 if to_regprocedure('public.rls_auto_enable()') is not null then
  revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
 end if;
end $$;
create index publications_site_post_idx on public.post_publications(site_id,post_id);
-- Background worker RPC. This is never exposed as a client Edge action.
create or replace function public.travel_worker(p_action text,p_input jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
#variable_conflict use_column
declare j app_private.outbox_jobs; a app_private.media_assets; v uuid; meta jsonb; path text; preview uuid;
begin
 if p_action='claim' then
 select * into j from app_private.outbox_jobs where (status='queued' and next_run_at<=now()) or (status='running' and lease_until<now()) order by next_run_at for update skip locked limit 1;
 if j.id is null then return null; end if;
 update app_private.outbox_jobs set status='running',attempts=attempts+1,lease_until=now()+interval '5 minutes' where id=j.id returning * into j;
 select * into a from app_private.media_assets where id=j.resource_id and site_id=j.site_id;
 return jsonb_build_object('job',to_jsonb(j),'asset',case when a.id is not null then to_jsonb(a) end);
 end if;
 select * into j from app_private.outbox_jobs where id=(p_input->>'job_id')::uuid and status='running' and lease_until=(p_input->>'lease_until')::timestamptz and lease_until>now() and attempts=(p_input->>'attempt')::int for update;
 if j.id is null then raise exception 'stale_job_lease' using errcode='PT409'; end if;
 if p_action='fail' then
 update app_private.outbox_jobs set status=case when attempts>=5 then 'failed' else 'queued' end,next_run_at=now()+interval '1 minute'*power(2,least(attempts,6)),lease_until=null where id=j.id;
 if j.type='process_asset' then update app_private.media_assets set state=case when j.attempts>=5 then 'failed' else 'processing' end,metadata=metadata||jsonb_build_object('error_code','processing_failed') where id=j.resource_id and site_id=j.site_id; end if;
 return jsonb_build_object('recorded',true);
 elsif p_action='complete' then
 if j.type='process_asset' then
 select * into a from app_private.media_assets where id=j.resource_id and site_id=j.site_id for update;
 meta:=p_input->'metadata';path:=p_input->>'object_path';
 if a.id is null or jsonb_typeof(meta) is distinct from 'object' or coalesce((meta->>'bytes')::bigint,0) not between 1 and 20971520 or meta->>'checksum' is null or path not like a.site_id::text||'/'||a.id::text||'/%' or path like '%..%' then raise exception 'invalid_processed_asset' using errcode='PT422'; end if;
 if a.kind='image' then
 if coalesce(meta->>'mime','') not in ('image/png','image/jpeg','image/webp') or coalesce((meta->>'width')::int,0) not between 1 and 20000 or coalesce((meta->>'height')::int,0) not between 1 and 20000 then raise exception 'invalid_image' using errcode='PT422'; end if;
 else
 if coalesce(meta->>'mime','')<>'application/pdf' or coalesce((meta->>'page_count')::int,0) not between 1 and 200 then raise exception 'invalid_pdf' using errcode='PT422'; end if;
 v:=gen_random_uuid();
 if p_input->>'preview_path' is null or jsonb_typeof(p_input->'preview_metadata') is distinct from 'object' or p_input->>'preview_path' not like a.site_id::text||'/'||a.id::text||'/%' or p_input->>'preview_path' like '%..%' then raise exception 'invalid_preview' using errcode='PT422'; end if;
 insert into app_private.media_assets(id,site_id,owner_id,kind,bucket,object_path,state,metadata) values(v,a.site_id,a.owner_id,'image','documents-private',p_input->>'preview_path','ready',p_input->'preview_metadata') returning id into preview;
 end if;
 if not exists(select 1 from storage.objects where bucket_id=a.bucket and name=path) then raise exception 'file_missing' using errcode='PT422'; end if;
 if a.kind='pdf' and not exists(select 1 from storage.objects where bucket_id='documents-private' and name=p_input->>'preview_path') then raise exception 'preview_missing' using errcode='PT422'; end if;
 update app_private.media_assets set state='ready',object_path=path,metadata=meta,preview_asset_id=preview where id=a.id;
 end if;
 update app_private.outbox_jobs set status='done',lease_until=null where id=j.id;
 return jsonb_build_object('completed',true);
 end if;
 raise exception 'unknown_action' using errcode='PT400';
end $$;
revoke all on function public.travel_worker(text,jsonb) from public,anon,authenticated;
grant execute on function public.travel_worker(text,jsonb) to service_role;
notify pgrst,'reload schema';
