-- Filter the complete site inbox before pagination. Keep the original
-- travel_admin_comments RPC available while the Edge function is deployed.
create function public.travel_admin_comment_inbox(
  p_actor uuid,
  p_site_id uuid,
  p_filter text default 'all',
  p_limit integer default 50,
  p_offset integer default 0
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inbox_filter text := coalesce(p_filter, 'all');
begin
  if inbox_filter not in ('all', 'unanswered', 'reported', 'hidden') then
    raise exception 'invalid_filter' using errcode = 'PT422';
  end if;

  perform app_private.require_member(p_site_id, p_actor);

  return coalesce((
    select jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc, row_data.id desc)
    from (
      select
        c.id,
        c.post_id,
        c.parent_id,
        c.body,
        c.status,
        c.version,
        c.created_at,
        c.author_kind,
        coalesce(pr.display_name, c.guest_name, '독자') as display_name,
        coalesce(pub.title, p.draft_content->>'title', '제목 없는 글') as post_title,
        coalesce(p.status = 'published' and pub.withdrawn_at is null and pub.comments_enabled, false) as comments_enabled,
        exists (
          select 1
          from app_private.site_memberships m
          where m.site_id = p_site_id
            and m.user_id = c.author_id
            and m.active
            and m.role in ('owner', 'admin', 'editor')
        ) as is_staff,
        coalesce((
          select jsonb_agg(
            jsonb_build_object('id', r.id, 'reason', r.reason, 'created_at', r.created_at)
            order by r.created_at desc, r.id desc
          )
          from app_private.comment_reports r
          where r.comment_id = c.id and r.status = 'open'
        ), '[]'::jsonb) as open_reports
      from public.comments c
      join app_private.posts p on p.id = c.post_id and p.site_id = p_site_id
      left join public.post_publications pub on pub.post_id = p.id
      left join public.profiles pr on pr.user_id = c.author_id
      where inbox_filter = 'all'
        or (inbox_filter = 'hidden' and c.status = 'hidden')
        or (inbox_filter = 'reported' and exists (
          select 1 from app_private.comment_reports r
          where r.comment_id = c.id and r.status = 'open'
        ))
        or (inbox_filter = 'unanswered'
          and c.parent_id is null
          and c.status = 'visible'
          and not exists (
            select 1
            from public.comments reply
            join app_private.site_memberships m
              on m.site_id = p_site_id
              and m.user_id = reply.author_id
              and m.active
              and m.role in ('owner', 'admin', 'editor')
            where reply.post_id = c.post_id
              and reply.parent_id = c.id
              and reply.status = 'visible'
          ))
      order by c.created_at desc, c.id desc
      limit least(greatest(coalesce(p_limit, 50), 1), 50)
      offset least(greatest(coalesce(p_offset, 0), 0), 100000)
    ) row_data
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.travel_admin_comment_inbox(uuid, uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.travel_admin_comment_inbox(uuid, uuid, text, integer, integer)
  to service_role;

notify pgrst, 'reload schema';
