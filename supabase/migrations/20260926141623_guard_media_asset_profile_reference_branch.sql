-- A single trigger function serves tables with different row shapes. Keep
-- table-specific NEW fields inside their branch so PostgreSQL never resolves
-- profile-only fields while handling posts/publications/revisions.
create or replace function app_private.guard_media_asset_reference_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  asset app_private.media_assets;
  target_site_id uuid;
begin
  if tg_table_name = 'posts' then
    perform app_private.assert_active_asset_refs(new.site_id, new.draft_content);
  elsif tg_table_name = 'post_revisions' then
    select p.site_id into target_site_id
    from app_private.posts p
    where p.id = new.post_id;
    perform app_private.assert_active_asset_refs(target_site_id, new.snapshot);
  elsif tg_table_name = 'sites' then
    perform app_private.assert_active_asset_refs(new.id, new.draft_settings);
    perform app_private.assert_active_asset_refs(new.id, new.published_settings);
  elsif tg_table_name = 'profiles' then
    if new.avatar_asset_id is not null then
      select * into asset
      from app_private.media_assets
      where id = new.avatar_asset_id
      for share;
      if found and asset.cleanup_state <> 'active' then
        raise exception 'asset_cleanup_in_progress' using errcode = 'PT409';
      end if;
    end if;
  elsif tg_table_name = 'post_publications' then
    perform app_private.assert_active_asset_refs(
      new.site_id,
      to_jsonb(coalesce(new.body_html, '') || coalesce(new.metadata::text, ''))
    );
    for asset in
      select *
      from app_private.media_assets
      where id in (new.cover_asset_id, new.pdf_asset_id)
      order by id
      for share
    loop
      if asset.cleanup_state <> 'active' or asset.state <> 'ready' then
        raise exception 'invalid_asset' using errcode = 'PT422';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function app_private.guard_media_asset_reference_write()
  from public, anon, authenticated;
