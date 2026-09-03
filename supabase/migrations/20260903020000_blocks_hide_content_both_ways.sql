-- Blocking already stopped messages (send_direct_message and open_conversation
-- check user_blocks). It did not touch the feed: a blocked person's posts and
-- comments still appeared, and yours still appeared to them. Now neither side
-- sees the other's posts or comments, enforced by the database rather than by
-- a filter a client could forget.
--
-- The check runs as a definer function because RLS on user_blocks only shows
-- a person the blocks they made; the "they blocked me" direction is invisible
-- to a plain subquery.
-- Applied to the live project 3 Sep 2026.

create or replace function public.blocked_either_way(other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_blocks b
     where (b.blocker_id = (select auth.uid()) and b.blocked_id = other)
        or (b.blocked_id = (select auth.uid()) and b.blocker_id = other)
  );
$$;

revoke all on function public.blocked_either_way(uuid) from public;
grant execute on function public.blocked_either_way(uuid) to anon, authenticated;

create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id);

drop policy if exists "blocked people do not see each other's posts" on public.social_posts;
create policy "blocked people do not see each other's posts"
  on public.social_posts
  as restrictive
  for select
  using (not public.blocked_either_way(user_id));

drop policy if exists "blocked people do not see each other's comments" on public.post_comments;
create policy "blocked people do not see each other's comments"
  on public.post_comments
  as restrictive
  for select
  using (not public.blocked_either_way(user_id));
