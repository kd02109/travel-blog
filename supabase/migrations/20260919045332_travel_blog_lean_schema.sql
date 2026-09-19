-- Lean blog schema. All writes go through the authenticated Edge gateway.
create schema app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to service_role;
create table app_private.sites (
 id uuid primary key default gen_random_uuid(), slug text not null unique check(slug ~ '^[a-z0-9][a-z0-9-]{0,119}$'),
 name text not null check(length(name) between 1 and 150), status text not null default 'active' check(status in ('active','suspended','archived')),
 draft_settings jsonb not null default '{"template_id":"D"}', published_settings jsonb not null default '{"template_id":"D"}',
 settings_version integer not null default 0, settings_updated_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create table app_private.site_memberships (
 site_id uuid not null references app_private.sites, user_id uuid not null references auth.users on delete cascade,
 role text not null check(role in ('owner','admin','editor')), active boolean not null default true,
 granted_by uuid references auth.users on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key(site_id,user_id)
);
create index memberships_user_idx on app_private.site_memberships(user_id,active);
create index memberships_granter_idx on app_private.site_memberships(granted_by);
create table app_private.posts (
 id uuid primary key default gen_random_uuid(), site_id uuid not null references app_private.sites,
 author_id uuid not null references auth.users, kind text not null check(kind in ('article','pdf')),
 status text not null default 'draft' check(status in ('draft','published','private','trashed')),
 draft_content jsonb not null default '{}' check(jsonb_typeof(draft_content)='object' and octet_length(draft_content::text)<=1048576),
 schema_version integer not null default 1 check(schema_version=1), lock_version integer not null default 0,
 first_published_at timestamptz, deleted_at timestamptz, updated_at timestamptz not null default now(), unique(site_id,id)
);
create index posts_list_idx on app_private.posts(site_id,status,updated_at desc);
create index posts_author_idx on app_private.posts(author_id);
create table app_private.post_revisions (
 id uuid primary key default gen_random_uuid(), post_id uuid not null references app_private.posts,
 snapshot jsonb not null, schema_version integer not null default 1 check(schema_version=1), created_by uuid not null references auth.users,
 created_at timestamptz not null default now(), unique(post_id,id)
);
create index revisions_post_idx on app_private.post_revisions(post_id,created_at desc);
create index revisions_creator_idx on app_private.post_revisions(created_by);
create table app_private.media_assets (
 id uuid primary key default gen_random_uuid(), site_id uuid not null references app_private.sites, owner_id uuid not null references auth.users,
 kind text not null check(kind in ('image','pdf')), bucket text not null check(bucket in ('originals-private','draft-media-private','published-media','documents-private')),
 object_path text not null, state text not null default 'uploading' check(state in ('uploading','processing','ready','failed')),
 metadata jsonb not null default '{}' check(jsonb_typeof(metadata)='object'), preview_asset_id uuid,
 created_at timestamptz not null default now(), unique(bucket,object_path), unique(site_id,id),
 foreign key(site_id,preview_asset_id) references app_private.media_assets(site_id,id), check(preview_asset_id is null or preview_asset_id<>id)
);
create index assets_owner_idx on app_private.media_assets(owner_id);
create index assets_preview_idx on app_private.media_assets(site_id,preview_asset_id);
create table public.profiles (
 user_id uuid primary key references auth.users on delete cascade, display_name text not null check(length(btrim(display_name)) between 2 and 30),
 avatar_asset_id uuid references app_private.media_assets on delete set null
);
create index profiles_avatar_idx on public.profiles(avatar_asset_id);
create table public.post_publications (
 post_id uuid primary key, site_id uuid not null, revision_id uuid not null,
 slug text not null check(slug ~ '^[a-z0-9][a-z0-9-]{0,119}$'), title text not null check(length(btrim(title)) between 1 and 150),
 category_code text not null check(category_code in ('day-walk','overnight-trip','food-cafe','stay-review','itinerary-pdf')),
 tags text[] not null default '{}', body_html text, metadata jsonb not null default '{}', cover_asset_id uuid, pdf_asset_id uuid,
 comments_enabled boolean not null default true, published_at timestamptz not null, updated_at timestamptz not null default now(), withdrawn_at timestamptz,
 unique(site_id,slug), foreign key(site_id,post_id) references app_private.posts(site_id,id),
 foreign key(post_id,revision_id) references app_private.post_revisions(post_id,id),
 foreign key(site_id,cover_asset_id) references app_private.media_assets(site_id,id), foreign key(site_id,pdf_asset_id) references app_private.media_assets(site_id,id),
 check((category_code='itinerary-pdf' and pdf_asset_id is not null and not comments_enabled and body_html is null) or (category_code<>'itinerary-pdf' and pdf_asset_id is null and cover_asset_id is not null and length(body_html)>0))
);
create index publications_list_idx on public.post_publications(site_id,published_at desc,post_id);
create index publications_category_idx on public.post_publications(site_id,category_code,published_at desc,post_id);
create index publications_revision_idx on public.post_publications(post_id,revision_id);
create index publications_cover_idx on public.post_publications(site_id,cover_asset_id);
create index publications_pdf_idx on public.post_publications(site_id,pdf_asset_id);
create table public.publication_assets (
 post_id uuid not null references public.post_publications(post_id) on delete cascade, asset_id uuid not null references app_private.media_assets,
 purpose text not null check(purpose in ('cover','body','pdf','pdf-preview')), alt text, caption text, primary key(post_id,asset_id)
);
create index publication_assets_asset_idx on public.publication_assets(asset_id);
create table public.comments (
 id uuid primary key default gen_random_uuid(), post_id uuid not null references app_private.posts,
 author_id uuid references auth.users on delete set null, author_kind text not null check(author_kind in ('member','guest','anonymized')),
 guest_name text, parent_id uuid, body text not null check(length(body)<=1000), status text not null default 'visible' check(status in ('visible','pending','hidden','deleted')),
 version integer not null default 0, request_key uuid not null, request_actor_hash text not null, request_hash text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
 unique(post_id,id), unique(post_id,request_actor_hash,request_key), foreign key(post_id,parent_id) references public.comments(post_id,id),
 check(parent_id is null or parent_id<>id),
 check((author_kind='member' and author_id is not null and guest_name is null) or (author_kind='guest' and author_id is null and length(btrim(guest_name)) between 2 and 30) or (author_kind='anonymized' and author_id is null and guest_name is null)),
 check(status='deleted' or length(btrim(body))>=1)
);
create index comments_list_idx on public.comments(post_id,status,created_at,id);
create index comments_parent_idx on public.comments(post_id,parent_id);
create index comments_author_idx on public.comments(author_id);
create table app_private.comment_credentials (
 comment_id uuid primary key references public.comments on delete cascade, password_hash text not null check(password_hash like '$argon2id$%')
);
create table app_private.comment_reports (
 id uuid primary key default gen_random_uuid(), comment_id uuid not null references public.comments on delete cascade,
 reporter_id uuid not null references auth.users on delete cascade, reason text not null check(reason in ('spam','abuse','personal_information','other')),
 status text not null default 'open' check(status in ('open','resolved','dismissed')), created_at timestamptz not null default now(), unique(comment_id,reporter_id)
);
create index reports_reporter_idx on app_private.comment_reports(reporter_id);
create table app_private.post_likes (
 id uuid primary key default gen_random_uuid(), post_id uuid not null references app_private.posts on delete cascade,
 user_id uuid references auth.users on delete cascade, visitor_hash text, created_at timestamptz not null default now(),
 check(num_nonnulls(user_id,visitor_hash)=1)
);
create unique index likes_user_unique on app_private.post_likes(post_id,user_id) where user_id is not null;
create unique index likes_visitor_unique on app_private.post_likes(post_id,visitor_hash) where visitor_hash is not null;
create index likes_user_idx on app_private.post_likes(user_id);
create table app_private.audit_events (
 id uuid primary key default gen_random_uuid(), site_id uuid not null references app_private.sites, actor_id uuid references auth.users on delete set null,
 action text not null, resource_id uuid, changes jsonb not null default '{}', created_at timestamptz not null default now()
);
create index audit_site_idx on app_private.audit_events(site_id,created_at desc);
create index audit_actor_idx on app_private.audit_events(actor_id);
create table app_private.outbox_jobs (
 id uuid primary key default gen_random_uuid(), site_id uuid not null references app_private.sites,
 type text not null check(type in ('process_asset','invalidate_cache')), resource_id uuid not null, dedupe_key text not null,
 status text not null default 'queued' check(status in ('queued','running','done','failed')), attempts integer not null default 0,
 next_run_at timestamptz not null default now(), lease_until timestamptz, unique(site_id,dedupe_key)
);
create index jobs_claim_idx on app_private.outbox_jobs(status,next_run_at);
create table app_private.rate_limits (
 key_hash text not null, action text not null, window_start timestamptz not null, count integer not null check(count>=0), primary key(key_hash,action,window_start)
);
-- No base-table Data API access. The Edge Function is the explicit server boundary.
do $$ declare r record; begin
 for r in select schemaname,tablename from pg_tables where schemaname='app_private' or (schemaname='public' and tablename in ('profiles','post_publications','publication_assets','comments')) loop
 execute format('alter table %I.%I enable row level security',r.schemaname,r.tablename);
 execute format('revoke all on table %I.%I from public, anon, authenticated',r.schemaname,r.tablename);
 execute format('grant select, insert, update, delete on table %I.%I to service_role',r.schemaname,r.tablename);
 execute format('create policy server_only on %I.%I to service_role using (true) with check (true)',r.schemaname,r.tablename);
 end loop;
end $$;
alter default privileges in schema app_private revoke execute on functions from public;
-- Private buckets also for published images: approved access is checked before signing.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('originals-private','originals-private',false,20971520,array['image/jpeg','image/png','image/webp']),
 ('draft-media-private','draft-media-private',false,20971520,array['image/jpeg','image/png','image/webp']),
 ('published-media','published-media',false,20971520,array['image/jpeg','image/png','image/webp']),
 ('documents-private','documents-private',false,20971520,array['application/pdf','image/png','image/jpeg']);
insert into app_private.sites(slug,name) values ('parents-travel','오늘도 함께 걷다');
