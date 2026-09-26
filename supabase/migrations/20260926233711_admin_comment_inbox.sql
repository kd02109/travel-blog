create or replace function public.travel_admin_comments(
  p_actor uuid,
  p_site_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.require_member(p_site_id, p_actor);
  return coalesce((
    select jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc)
    from (
      select c.id, c.post_id, c.parent_id, c.body, c.status, c.version,
        c.created_at, c.author_kind,
        coalesce(pr.display_name, c.guest_name, '독자') as display_name,
        coalesce(pub.title, p.draft_content->>'title', '제목 없는 글') as post_title,
        exists (
          select 1 from app_private.site_memberships m
          where m.site_id = p_site_id and m.user_id = c.author_id
            and m.active and m.role = any(array['owner','admin','editor']::text[])
        ) as is_staff
      from public.comments c
      join app_private.posts p on p.id = c.post_id and p.site_id = p_site_id
      left join public.post_publications pub on pub.post_id = p.id
      left join public.profiles pr on pr.user_id = c.author_id
      order by c.created_at desc
      limit least(greatest(coalesce(p_limit, 50), 1), 50)
      offset least(greatest(coalesce(p_offset, 0), 0), 100000)
    ) row_data
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.travel_admin_comments(uuid, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.travel_admin_comments(uuid, uuid, integer, integer)
  to service_role;
