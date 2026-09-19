-- All helpers are SECURITY INVOKER and callable only by service_role.
create function app_private.require_member(p_site uuid,p_actor uuid,p_roles text[] default array['owner','admin','editor']) returns void
language plpgsql set search_path='' as $$
begin
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor and deleted_at is null and (banned_until is null or banned_until<now())) then raise exception 'unauthorized' using errcode='PT401'; end if;
 perform 1 from app_private.sites s join app_private.site_memberships m on m.site_id=s.id
 where s.id=p_site and s.status='active' and m.user_id=p_actor and m.active and m.role=any(p_roles) for share of m;
 if not found then raise exception 'forbidden' using errcode='PT403'; end if;
end $$;
create function app_private.is_public(p_post uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.post_publications u join app_private.posts p on p.id=u.post_id join app_private.sites s on s.id=p.site_id where u.post_id=p_post and u.withdrawn_at is null and p.status='published' and s.status='active')
$$;
create function app_private.guard_owner() returns trigger language plpgsql set search_path='' as $$
begin
 if old.role='owner' and old.active and (tg_op='DELETE' or not new.active or new.role<>'owner') then
 perform 1 from app_private.sites where id=old.site_id for update;
 if not exists(select 1 from app_private.site_memberships where site_id=old.site_id and user_id<>old.user_id and active and role='owner') then raise exception 'last_owner' using errcode='PT409'; end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger protect_last_owner before update or delete on app_private.site_memberships for each row execute function app_private.guard_owner();
create function app_private.guard_comment() returns trigger language plpgsql set search_path='' as $$
begin
 if (select kind from app_private.posts where id=new.post_id)<>'article' then raise exception 'pdf_reactions_disabled' using errcode='PT422'; end if;
 if new.parent_id is not null and not exists(select 1 from public.comments where id=new.parent_id and post_id=new.post_id and parent_id is null) then raise exception 'invalid_reply' using errcode='PT422'; end if;
 return new;
end $$;
create trigger comment_integrity before insert or update on public.comments for each row execute function app_private.guard_comment();
create function app_private.guard_like() returns trigger language plpgsql set search_path='' as $$ begin
 if (select kind from app_private.posts where id=new.post_id)<>'article' then raise exception 'pdf_reactions_disabled' using errcode='PT422'; end if; return new; end $$;
create trigger like_integrity before insert or update on app_private.post_likes for each row execute function app_private.guard_like();
create function app_private.guard_publication_asset() returns trigger language plpgsql set search_path='' as $$ begin
 if not exists(select 1 from public.post_publications p join app_private.media_assets a on a.site_id=p.site_id where p.post_id=new.post_id and a.id=new.asset_id and a.state='ready') then raise exception 'invalid_asset' using errcode='PT422'; end if; return new; end $$;
create trigger approved_asset_integrity before insert or update on public.publication_assets for each row execute function app_private.guard_publication_asset();
create function app_private.audit(p_site uuid,p_actor uuid,p_action text,p_resource uuid,p_changes jsonb default '{}') returns void language sql set search_path='' as $$
 insert into app_private.audit_events(site_id,actor_id,action,resource_id,changes) values(p_site,p_actor,p_action,p_resource,p_changes)
$$;
create function app_private.check_settings(p_site uuid,p_settings jsonb) returns void language plpgsql set search_path='' as $$
declare k text; a uuid; begin
 if jsonb_typeof(p_settings) is distinct from 'object' or (p_settings->>'template_id') is null or p_settings->>'template_id' not in ('A','B','C','D') or octet_length(p_settings::text)>20000 then raise exception 'invalid_settings' using errcode='PT422'; end if;
 for k in select jsonb_object_keys(p_settings) loop
 if k not in ('template_id','title','description','hero_asset_id','featured_post_id') then raise exception 'unknown_setting' using errcode='PT422'; end if;
 end loop;
 if length(coalesce(p_settings->>'title',''))>150 or length(coalesce(p_settings->>'description',''))>500 then raise exception 'invalid_settings' using errcode='PT422'; end if;
 a:=nullif(p_settings->>'hero_asset_id','')::uuid;
 if a is not null and not exists(select 1 from app_private.media_assets where id=a and site_id=p_site and kind='image' and state='ready') then raise exception 'invalid_asset' using errcode='PT422'; end if;
 a:=nullif(p_settings->>'featured_post_id','')::uuid;
 if a is not null and not exists(select 1 from app_private.posts where id=a and site_id=p_site and app_private.is_public(id)) then raise exception 'invalid_featured_post' using errcode='PT422'; end if;
end $$;
create function app_private.validate_publish(p_post app_private.posts) returns void language plpgsql set search_path='' as $$
declare d jsonb:=p_post.draft_content; m jsonb:=coalesce(d->'metadata','{}'); cat text:=d->>'category_code'; a uuid; sd date; ed date;
begin
 if p_post.status='trashed' or length(btrim(coalesce(d->>'title',''))) not between 1 and 150 or coalesce(d->>'slug','') !~ '^[a-z0-9][a-z0-9-]{0,119}$' then raise exception 'invalid_title_or_slug' using errcode='PT422'; end if;
 if cat is null or cat not in ('day-walk','overnight-trip','food-cafe','stay-review','itinerary-pdf') then raise exception 'invalid_category' using errcode='PT422'; end if;
 if jsonb_typeof(coalesce(d->'tags','[]'))<>'array' or jsonb_array_length(coalesce(d->'tags','[]'))>20 then raise exception 'invalid_tags' using errcode='PT422'; end if;
 if exists(select 1 from jsonb_array_elements(coalesce(d->'tags','[]')) t where jsonb_typeof(t)<>'string' or length(btrim(t#>>'{}')) not between 1 and 30) then raise exception 'invalid_tags' using errcode='PT422'; end if;
 if p_post.kind='pdf' then
 if cat<>'itinerary-pdf' then raise exception 'invalid_category' using errcode='PT422'; end if;
 a:=nullif(d->>'pdf_asset_id','')::uuid;
 if not exists(select 1 from app_private.media_assets f join app_private.media_assets v on v.id=f.preview_asset_id and v.site_id=f.site_id where f.id=a and f.site_id=p_post.site_id and f.kind='pdf' and f.state='ready' and v.state='ready' and v.kind='image' and (f.metadata->>'page_count')::int between 1 and 200) then raise exception 'pdf_not_ready' using errcode='PT422'; end if;
 else
 if cat='itinerary-pdf' or jsonb_typeof(d->'blocks') is distinct from 'array' or jsonb_array_length(d->'blocks')=0 or jsonb_typeof(m)<>'object' or length(btrim(coalesce(m->>'region','')))=0 then raise exception 'incomplete_article' using errcode='PT422'; end if;
 a:=nullif(d->>'cover_asset_id','')::uuid;
 if not exists(select 1 from app_private.media_assets where id=a and site_id=p_post.site_id and kind='image' and state='ready') then raise exception 'cover_not_ready' using errcode='PT422'; end if;
 if cat in ('day-walk','food-cafe') then sd:=(m->>'visited_on')::date; if sd is null then raise exception 'missing_date' using errcode='PT422'; end if;
 elsif cat='overnight-trip' then sd:=(m->>'start_date')::date; ed:=(m->>'end_date')::date;
 else sd:=(m->>'check_in')::date; ed:=(m->>'check_out')::date; end if;
 if cat in ('overnight-trip','stay-review') and (sd is null or ed is null or ed<=sd) then raise exception 'invalid_dates' using errcode='PT422'; end if;
 if cat in ('food-cafe','stay-review') and length(btrim(coalesce(m->>'place_name','')))=0 then raise exception 'missing_place' using errcode='PT422'; end if;
 if cat='food-cafe' and coalesce(m->>'venue_type','') not in ('cafe','restaurant') then raise exception 'invalid_venue' using errcode='PT422'; end if;
 end if;
end $$;
-- Single service-only transaction entry point; actor and hashes are supplied by verified Edge code.
create function public.travel_api(p_action text,p_actor uuid default null,p_input jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
#variable_conflict use_column
declare
 s uuid:=nullif(p_input->>'site_id','')::uuid; v_id uuid:=nullif(p_input->>'id','')::uuid;
 p app_private.posts; c public.comments; a app_private.media_assets; st app_private.sites;
 d jsonb; res jsonb; rev uuid; aid uuid; key text; n int; v int; role_name text; target uuid; b boolean;
 lim int:=least(greatest(coalesce((p_input->>'limit')::int,12),1),50);
 offst int:=least(greatest(coalesce((p_input->>'offset')::int,0),0),100000);
 actorhash text:=p_input->>'actor_hash'; win timestamptz;
begin
 if p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'invalid_input' using errcode='PT400'; end if;
 if p_actor is not null and not exists(select 1 from auth.users where id=p_actor and deleted_at is null and (banned_until is null or banned_until<now())) then raise exception 'unauthorized' using errcode='PT401'; end if;
 if p_action='rate.consume' then
 n:=greatest(1,least((p_input->>'window_seconds')::int,86400));
 win:=to_timestamp(floor(extract(epoch from now())/n)*n);
 insert into app_private.rate_limits(key_hash,action,window_start,count) values(p_input->>'key_hash',p_input->>'action',win,1)
 on conflict(key_hash,action,window_start) do update set count=app_private.rate_limits.count+1 returning count into v;
 return jsonb_build_object('allowed',v<=(p_input->>'max')::int,'retry_after',n);
 elsif p_action='site.get' then
 select * into st from app_private.sites where status='active' and (id=s or (s is null and slug=coalesce(p_input->>'slug','parents-travel')));
 if not found then raise exception 'not_found' using errcode='PT404'; end if;
 return jsonb_build_object('id',st.id,'slug',st.slug,'name',st.name,'settings',st.published_settings,'version',st.settings_version);
 elsif p_action='posts.list' then
 return coalesce((select jsonb_agg(x) from (select u.post_id,u.slug,u.title,u.category_code,u.tags,u.metadata,u.cover_asset_id,u.pdf_asset_id,u.published_at,u.updated_at,
 case when p.kind='article' then (select count(*) from app_private.post_likes l where l.post_id=u.post_id) end as like_count,
 case when p.kind='article' then (select count(*) from public.comments c where c.post_id=u.post_id and c.status='visible') end as comment_count
 from public.post_publications u join app_private.posts p on p.id=u.post_id where u.site_id=s and app_private.is_public(u.post_id)
 and (p_input->>'category' is null or u.category_code=p_input->>'category') and (p_input->>'tag' is null or p_input->>'tag'=any(u.tags))
 order by u.published_at desc,u.post_id limit lim offset offst) x),'[]');
 elsif p_action='post.get' then
 select * into p from app_private.posts where app_private.posts.id=(select u.post_id from public.post_publications u where u.site_id=s and (u.post_id=v_id or (v_id is null and u.slug=p_input->>'slug')));
 if p.id is null or not app_private.is_public(p.id) then raise exception 'not_found' using errcode='PT404'; end if;
 return (select to_jsonb(u)-'revision_id'-'withdrawn_at' from public.post_publications u where post_id=p.id) || jsonb_build_object('like_count',case when p.kind='article' then (select count(*) from app_private.post_likes where post_id=p.id) end,'comment_count',case when p.kind='article' then (select count(*) from public.comments where post_id=p.id and status='visible') end);
 elsif p_action='comments.list' then
 if not app_private.is_public(v_id) then raise exception 'not_found' using errcode='PT404'; end if;
 return coalesce((select jsonb_agg(x) from (select c.id,c.parent_id,case when c.status='deleted' then '' else c.body end as body,c.status,c.version,c.created_at,c.updated_at,
 case when c.status='deleted' or c.author_kind='anonymized' then '삭제된 사용자' else coalesce(pr.display_name,c.guest_name,'독자') end as display_name,
 exists(select 1 from app_private.site_memberships m join app_private.posts p on p.site_id=m.site_id where p.id=c.post_id and m.user_id=c.author_id and m.active) as is_staff
 from public.comments c left join public.profiles pr on pr.user_id=c.author_id where c.post_id=v_id and (c.status='visible' or (c.status='deleted' and exists(select 1 from public.comments r where r.parent_id=c.id and r.status='visible')))
 order by c.created_at,c.id limit lim offset offst) x),'[]');
 elsif p_action='me' then
 if p_actor is null then raise exception 'unauthorized' using errcode='PT401'; end if;
 return jsonb_build_object('user_id',p_actor,'profile',(select to_jsonb(pr) from public.profiles pr where user_id=p_actor),'memberships',coalesce((select jsonb_agg(jsonb_build_object('site_id',m.site_id,'role',m.role,'name',st.name)) from app_private.site_memberships m join app_private.sites st on st.id=m.site_id where m.user_id=p_actor and m.active and st.status='active'),'[]'));
 elsif p_action='profile.save' then
 if p_actor is null then raise exception 'unauthorized' using errcode='PT401'; end if;
 insert into public.profiles(user_id,display_name) values(p_actor,btrim(p_input->>'display_name')) on conflict(user_id) do update set display_name=excluded.display_name;
 return jsonb_build_object('saved',true);
 elsif p_action like 'admin.%' then
 -- Resource-based scope overrides arbitrary client site_id, but mismatches are rejected.
 if p_action in ('admin.post.get','admin.post.save','admin.post.publish','admin.post.status','admin.revisions','admin.revision.restore') then
 select * into p from app_private.posts x where x.id=v_id for update;
 if p.id is null then raise exception 'not_found' using errcode='PT404'; end if;
 if s is not null and s<>p.site_id then raise exception 'forbidden' using errcode='PT403'; end if; s:=p.site_id;
 end if;
 perform app_private.require_member(s,p_actor);
 if p_action='admin.posts' then
 return coalesce((select jsonb_agg(x) from (select id,kind,status,draft_content->>'title' as title,lock_version,updated_at,first_published_at from app_private.posts where site_id=s order by updated_at desc limit lim offset offst) x),'[]');
 elsif p_action='admin.post.get' then return to_jsonb(p);
 elsif p_action='admin.post.create' then
 insert into app_private.posts(site_id,author_id,kind,draft_content) values(s,p_actor,p_input->>'kind',coalesce(p_input->'content','{}')) returning * into p; return to_jsonb(p);
 elsif p_action='admin.post.save' then
 if p.lock_version is distinct from (p_input->>'version')::int then raise exception 'version_conflict' using errcode='PT409'; end if;
 update app_private.posts set draft_content=p_input->'content',lock_version=lock_version+1,updated_at=now() where app_private.posts.id=p.id returning * into p;
 if coalesce((p_input->>'checkpoint')::boolean,false) then insert into app_private.post_revisions(post_id,snapshot,created_by) values(p.id,p.draft_content,p_actor); end if;
 return to_jsonb(p);
 elsif p_action='admin.revisions' then return coalesce((select jsonb_agg(x) from (select id,created_at,created_by,schema_version from app_private.post_revisions where post_id=p.id order by created_at desc limit lim offset offst)x),'[]');
 elsif p_action='admin.revision.restore' then
 if p.lock_version is distinct from (p_input->>'version')::int then raise exception 'version_conflict' using errcode='PT409'; end if;
 select snapshot into d from app_private.post_revisions where post_id=p.id and app_private.post_revisions.id=(p_input->>'revision_id')::uuid;
 if not found then raise exception 'not_found' using errcode='PT404'; end if;
 update app_private.posts set draft_content=d,lock_version=lock_version+1,updated_at=now() where app_private.posts.id=p.id returning * into p; return to_jsonb(p);
 elsif p_action='admin.post.publish' then
 if p.lock_version is distinct from (p_input->>'version')::int then raise exception 'version_conflict' using errcode='PT409'; end if;
 perform app_private.validate_publish(p); d:=p.draft_content;
 if p.kind='article' and length(coalesce(p_input->>'rendered_html',''))=0 then raise exception 'empty_body' using errcode='PT422'; end if;
 insert into app_private.post_revisions(post_id,snapshot,created_by) values(p.id,d,p_actor) returning app_private.post_revisions.id into rev;
 insert into public.post_publications(post_id,site_id,revision_id,slug,title,category_code,tags,body_html,metadata,cover_asset_id,pdf_asset_id,comments_enabled,published_at)
 values(p.id,s,rev,d->>'slug',d->>'title',d->>'category_code',array(select distinct btrim(t) from jsonb_array_elements_text(coalesce(d->'tags','[]'))t),case when p.kind='article' then p_input->>'rendered_html' end,coalesce(d->'metadata','{}'),case when p.kind='article' then (d->>'cover_asset_id')::uuid end,case when p.kind='pdf' then (d->>'pdf_asset_id')::uuid end,p.kind='article' and coalesce((d->>'comments_enabled')::boolean,true),coalesce(p.first_published_at,now()))
 on conflict(post_id) do update set revision_id=excluded.revision_id,slug=excluded.slug,title=excluded.title,category_code=excluded.category_code,tags=excluded.tags,body_html=excluded.body_html,metadata=excluded.metadata,cover_asset_id=excluded.cover_asset_id,pdf_asset_id=excluded.pdf_asset_id,comments_enabled=excluded.comments_enabled,updated_at=now(),withdrawn_at=null;
 delete from public.publication_assets where post_id=p.id;
 for aid in select distinct x::uuid from jsonb_array_elements_text(coalesce(p_input->'asset_ids','[]'))x loop
 if not exists(select 1 from app_private.media_assets where app_private.media_assets.id=aid and site_id=s and kind='image' and state='ready') then raise exception 'invalid_asset' using errcode='PT422'; end if;
 insert into public.publication_assets(post_id,asset_id,purpose) values(p.id,aid,'body') on conflict do nothing;
 end loop;
 aid:=case when p.kind='article' then (d->>'cover_asset_id')::uuid else (d->>'pdf_asset_id')::uuid end;
 insert into public.publication_assets(post_id,asset_id,purpose) values(p.id,aid,case when p.kind='article' then 'cover' else 'pdf' end) on conflict(post_id,asset_id) do update set purpose=excluded.purpose;
 if p.kind='pdf' then insert into public.publication_assets(post_id,asset_id,purpose) select p.id,preview_asset_id,'pdf-preview' from app_private.media_assets where app_private.media_assets.id=aid; end if;
 update app_private.posts set status='published',first_published_at=coalesce(first_published_at,now()),deleted_at=null,lock_version=lock_version+1,updated_at=now() where app_private.posts.id=p.id;
 perform app_private.audit(s,p_actor,'post.publish',p.id,jsonb_build_object('revision_id',rev));
 insert into app_private.outbox_jobs(site_id,type,resource_id,dedupe_key) values(s,'invalidate_cache',p.id,'publish:'||rev::text);
 return jsonb_build_object('post_id',p.id,'revision_id',rev,'version',p.lock_version+1);
 elsif p_action='admin.post.status' then
 if p.lock_version is distinct from (p_input->>'version')::int then raise exception 'version_conflict' using errcode='PT409'; end if;
 key:=p_input->>'status'; if key not in ('private','trashed') or key is null then raise exception 'invalid_status' using errcode='PT422'; end if;
 update app_private.posts set status=key,deleted_at=case when key='trashed' then now() end,lock_version=lock_version+1,updated_at=now() where app_private.posts.id=p.id;
 update public.post_publications set withdrawn_at=now() where post_id=p.id;
 perform app_private.audit(s,p_actor,'post.'||key,p.id);
 insert into app_private.outbox_jobs(site_id,type,resource_id,dedupe_key) values(s,'invalidate_cache',p.id,'status:'||p.id::text||':'||(p.lock_version+1)::text);
 return jsonb_build_object('version',p.lock_version+1,'status',key);
 elsif p_action='admin.members' then
 perform app_private.require_member(s,p_actor,array['owner']);
 return coalesce((select jsonb_agg(to_jsonb(m)) from app_private.site_memberships m where site_id=s),'[]');
 elsif p_action='admin.member.set' then
 -- Acquire site lock before changing owner rows; serializes concurrent owner removals.
 perform 1 from app_private.sites where app_private.sites.id=s for update;
 perform app_private.require_member(s,p_actor,array['owner']); target:=(p_input->>'user_id')::uuid;
 role_name:=p_input->>'role'; b:=coalesce((p_input->>'active')::boolean,true);
 insert into app_private.site_memberships(site_id,user_id,role,active,granted_by) values(s,target,role_name,b,p_actor)
 on conflict(site_id,user_id) do update set role=excluded.role,active=excluded.active,granted_by=p_actor,updated_at=now();
 perform app_private.audit(s,p_actor,'member.set',target,jsonb_build_object('role',role_name,'active',b)); return jsonb_build_object('saved',true);
 elsif p_action in ('admin.settings.get','admin.settings.save','admin.settings.apply') then
 select * into st from app_private.sites where app_private.sites.id=s for update;
 if p_action='admin.settings.get' then return jsonb_build_object('draft',st.draft_settings,'published',st.published_settings,'version',st.settings_version); end if;
 if st.settings_version is distinct from (p_input->>'version')::int then raise exception 'version_conflict' using errcode='PT409'; end if;
 d:=case when p_action='admin.settings.save' then p_input->'settings' else st.draft_settings end; perform app_private.check_settings(s,d);
 update app_private.sites set draft_settings=d,published_settings=case when p_action='admin.settings.apply' then d else published_settings end,settings_version=settings_version+1,settings_updated_at=now() where app_private.sites.id=s;
 perform app_private.audit(s,p_actor,p_action,s); return jsonb_build_object('version',st.settings_version+1);
 elsif p_action='admin.comments' then
 return coalesce((select jsonb_agg(x) from (select c.id,c.post_id,c.parent_id,c.body,c.status,c.version,c.created_at,c.author_kind,coalesce(pr.display_name,c.guest_name,'독자') as display_name from public.comments c join app_private.posts p on p.id=c.post_id left join public.profiles pr on pr.user_id=c.author_id where p.site_id=s order by c.created_at desc limit lim offset offst)x),'[]');
 elsif p_action='admin.comment.moderate' then
 select c0.* into c from public.comments c0 join app_private.posts p0 on p0.id=c0.post_id where c0.id=v_id and p0.site_id=s for update of c0;
 if c.id is null then raise exception 'not_found' using errcode='PT404'; end if;
 if c.version is distinct from (p_input->>'version')::int then raise exception 'version_conflict' using errcode='PT409'; end if;
 key:=p_input->>'status'; if key is null or key not in ('visible','hidden','deleted') or c.status='deleted' then raise exception 'invalid_status' using errcode='PT422'; end if;
 update public.comments set status=key,body=case when key='deleted' then '' else body end,version=version+1,updated_at=now(),deleted_at=case when key='deleted' then now() end where public.comments.id=c.id;
 perform app_private.audit(s,p_actor,'comment.'||key,c.id); return jsonb_build_object('version',c.version+1);
 elsif p_action='admin.reports' then
 return coalesce((select jsonb_agg(x) from (select r.* from app_private.comment_reports r join public.comments c on c.id=r.comment_id join app_private.posts p on p.id=c.post_id where p.site_id=s order by r.created_at desc limit lim offset offst)x),'[]');
 elsif p_action='admin.report.resolve' then
 key:=p_input->>'status'; if key is null or key not in ('resolved','dismissed') then raise exception 'invalid_status' using errcode='PT422'; end if;
 update app_private.comment_reports r set status=key from public.comments c,app_private.posts p where r.id=v_id and c.id=r.comment_id and p.id=c.post_id and p.site_id=s;
 if not found then raise exception 'not_found' using errcode='PT404'; end if;
 perform app_private.audit(s,p_actor,'report.'||key,v_id); return jsonb_build_object('saved',true);
 elsif p_action='admin.audit' then
 perform app_private.require_member(s,p_actor,array['owner','admin']);
 return coalesce((select jsonb_agg(x) from (select * from app_private.audit_events where site_id=s order by created_at desc limit lim offset offst)x),'[]');
 end if;
 elsif p_action='comment.create' then
 select * into p from app_private.posts x where x.id=v_id for share;
 if p.id is null or not app_private.is_public(p.id) or p.kind<>'article' or not (select comments_enabled from public.post_publications where post_id=p.id) then raise exception 'comments_unavailable' using errcode='PT403'; end if;
 if p_actor is not null then actorhash:='user:'||p_actor::text; elsif length(coalesce(actorhash,''))<32 then raise exception 'visitor_required' using errcode='PT401'; end if;
 if nullif(p_input->>'parent_id','') is not null and not exists(select 1 from public.comments where public.comments.id=(p_input->>'parent_id')::uuid and post_id=p.id and parent_id is null and status='visible') then raise exception 'invalid_reply' using errcode='PT422'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p.id::text||actorhash||(p_input->>'request_key'),0));
 select * into c from public.comments where post_id=p.id and request_actor_hash=actorhash and request_key=(p_input->>'request_key')::uuid;
 if c.id is not null then
 if c.request_hash is distinct from p_input->>'request_hash' then raise exception 'idempotency_conflict' using errcode='PT409'; end if;
 return jsonb_build_object('id',c.id,'version',c.version,'duplicate',true);
 end if;
 insert into public.comments(post_id,author_id,author_kind,guest_name,parent_id,body,request_key,request_actor_hash,request_hash)
 values(p.id,p_actor,case when p_actor is null then 'guest' else 'member' end,case when p_actor is null then p_input->>'guest_name' end,nullif(p_input->>'parent_id','')::uuid,btrim(p_input->>'body'),(p_input->>'request_key')::uuid,actorhash,p_input->>'request_hash') returning * into c;
 if p_actor is null then insert into app_private.comment_credentials(comment_id,password_hash) values(c.id,p_input->>'password_hash'); end if;
 return jsonb_build_object('id',c.id,'version',c.version,'duplicate',false);
 elsif p_action='comment.credential' then
 -- Internal only: Edge verifies Argon2 before forwarding a mutation. Not a client action.
 select c0.* into c from public.comments c0 where c0.id=v_id;
 if c.id is null or not app_private.is_public(c.post_id) or c.author_kind<>'guest' or c.status='deleted' then raise exception 'not_found' using errcode='PT404'; end if;
 return (select jsonb_build_object('password_hash',password_hash) from app_private.comment_credentials where comment_id=v_id);
 elsif p_action in ('comment.edit','comment.delete') then
 select * into c from public.comments c0 where c0.id=v_id for update;
 if c.id is null or not app_private.is_public(c.post_id) or c.status='deleted' then raise exception 'not_found' using errcode='PT404'; end if;
 if not ((c.author_kind='member' and c.author_id=p_actor) or (c.author_kind='guest' and coalesce((p_input->>'guest_verified')::boolean,false))) then raise exception 'forbidden' using errcode='PT403'; end if;
 if c.version is distinct from (p_input->>'version')::int then raise exception 'version_conflict' using errcode='PT409'; end if;
 update public.comments set body=case when p_action='comment.delete' then '' else btrim(p_input->>'body') end,status=case when p_action='comment.delete' then 'deleted' when status='hidden' then 'hidden' else 'visible' end,version=version+1,updated_at=now(),deleted_at=case when p_action='comment.delete' then now() end where public.comments.id=c.id;
 return jsonb_build_object('id',c.id,'version',c.version+1);
 elsif p_action='comment.report' then
 if p_actor is null then raise exception 'unauthorized' using errcode='PT401'; end if;
 select * into c from public.comments c0 where c0.id=v_id;
 if c.id is null or c.status<>'visible' or not app_private.is_public(c.post_id) then raise exception 'not_found' using errcode='PT404'; end if;
 insert into app_private.comment_reports(comment_id,reporter_id,reason) values(v_id,p_actor,p_input->>'reason') on conflict(comment_id,reporter_id) do nothing;
 return jsonb_build_object('reported',true);
 elsif p_action='like.set' then
 select * into p from app_private.posts p0 where p0.id=v_id for share;
 if p.id is null or not app_private.is_public(p.id) or p.kind<>'article' then raise exception 'reactions_unavailable' using errcode='PT403'; end if;
 if p_actor is null and length(coalesce(actorhash,''))<32 then raise exception 'visitor_required' using errcode='PT401'; end if;
 b:=(p_input->>'liked')::boolean; if b is null then raise exception 'invalid_input' using errcode='PT422'; end if;
 if b then insert into app_private.post_likes(post_id,user_id,visitor_hash) values(v_id,p_actor,case when p_actor is null then actorhash end) on conflict do nothing;
 else delete from app_private.post_likes where post_id=v_id and ((p_actor is not null and user_id=p_actor) or (p_actor is null and visitor_hash=actorhash)); end if;
 return jsonb_build_object('liked',b,'count',(select count(*) from app_private.post_likes where post_id=v_id));
 elsif p_action='asset.create' then
 perform app_private.require_member(s,p_actor);
 key:=p_input->>'kind'; if key is null or key not in ('image','pdf') then raise exception 'invalid_kind' using errcode='PT422'; end if;
 aid:=gen_random_uuid();
 insert into app_private.media_assets(id,site_id,owner_id,kind,bucket,object_path) values(aid,s,p_actor,key,case when key='pdf' then 'documents-private' else 'originals-private' end,s::text||'/'||aid::text||'/original') returning * into a;
 return to_jsonb(a);
 elsif p_action in ('asset.internal','asset.complete','asset.access') then
 select * into a from app_private.media_assets a0 where a0.id=v_id;
 if a.id is null then raise exception 'not_found' using errcode='PT404'; end if;
 if s is not null and s<>a.site_id then raise exception 'forbidden' using errcode='PT403'; end if;
 if p_action<>'asset.access' or not (a.state='ready' and exists(select 1 from app_private.sites where app_private.sites.id=a.site_id and status='active') and (exists(select 1 from public.publication_assets pa where pa.asset_id=a.id and app_private.is_public(pa.post_id)) or exists(select 1 from app_private.sites where app_private.sites.id=a.site_id and published_settings->>'hero_asset_id'=a.id::text))) then perform app_private.require_member(a.site_id,p_actor); end if;
 if p_action='asset.complete' then
 if a.state<>'uploading' and a.state<>'failed' then return to_jsonb(a); end if;
 update app_private.media_assets set state='processing',metadata=p_input->'metadata' where app_private.media_assets.id=a.id returning * into a;
 insert into app_private.outbox_jobs(site_id,type,resource_id,dedupe_key) values(a.site_id,'process_asset',a.id,'process:'||a.id::text) on conflict(site_id,dedupe_key) do update set status='queued',next_run_at=now(),lease_until=null;
 end if;
 return to_jsonb(a);
 end if;
 raise exception 'unknown_action' using errcode='PT400';
end $$;
-- Remove default public EXECUTE explicitly, including helper functions.
revoke all on function public.travel_api(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.travel_api(text,uuid,jsonb) to service_role;
revoke all on all functions in schema app_private from public,anon,authenticated;
grant execute on all functions in schema app_private to service_role;
notify pgrst,'reload schema';
