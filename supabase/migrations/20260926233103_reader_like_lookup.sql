-- The signed visitor identity remains scoped to one browser tab across reloads.
-- The browser never receives direct database access; this RPC is service-role only.
create or replace function public.travel_like_get(
  p_post_id uuid,
  p_actor uuid,
  p_actor_hash text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_liked boolean;
  v_count bigint;
begin
  select p.kind into v_kind
  from app_private.posts p
  where p.id = p_post_id and app_private.is_public(p.id);

  if v_kind is distinct from 'article' then
    raise exception 'reactions_unavailable' using errcode = 'PT403';
  end if;
  if p_actor is null and coalesce(p_actor_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'visitor_required' using errcode = 'PT401';
  end if;

  select exists (
    select 1 from app_private.post_likes l
    where l.post_id = p_post_id and (
      (p_actor is not null and l.user_id = p_actor)
      or (p_actor is null and l.visitor_hash = p_actor_hash)
    )
  ), (select count(*) from app_private.post_likes l where l.post_id = p_post_id)
  into v_liked, v_count;

  return jsonb_build_object('liked', v_liked, 'count', v_count);
end
$$;

revoke all on function public.travel_like_get(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.travel_like_get(uuid, uuid, text) to service_role;
