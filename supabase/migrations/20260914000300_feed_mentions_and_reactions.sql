-- @mentions and emoji reactions on the feed (founder, 14 Sep 2026).
--
-- 1. content_mentions: the people somebody picked with "@" in a post or a
--    comment. The words keep "@Their Name" as typed; these rows say which
--    person each name meant, so the name links to the right page even when two
--    people share a first name. Only the author of the words can add them, and
--    the person mentioned is notified once (unique row, write_notification
--    already skips yourself and anybody blocked either way).
-- 2. feed_reactions: Telegram style emoji reactions on posts and comments.
--    Separate from post_likes, so the heart keeps counting exactly as before.
-- Both are cleaned up when the post or comment they belong to is deleted.

create table if not exists public.content_mentions (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('post', 'comment')),
  source_id uuid not null,
  post_id uuid not null references public.social_posts(id) on delete cascade,
  mentioned_user_id uuid not null,
  mentioned_name text not null check (char_length(mentioned_name) between 1 and 80),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (source_type, source_id, mentioned_user_id)
);

create index if not exists content_mentions_source_idx on public.content_mentions (source_type, source_id);
create index if not exists content_mentions_post_idx on public.content_mentions (post_id);
create index if not exists content_mentions_user_idx on public.content_mentions (mentioned_user_id);

alter table public.content_mentions enable row level security;

drop policy if exists "mentions are readable" on public.content_mentions;
create policy "mentions are readable" on public.content_mentions
  for select using (not public.blocked_either_way(created_by));

drop policy if exists "authors mention people in their own words" on public.content_mentions;
create policy "authors mention people in their own words" on public.content_mentions
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and mentioned_user_id <> (select auth.uid())
    and not public.has_restriction((select auth.uid()), 'mute')
    and not public.blocked_either_way(mentioned_user_id)
    and (
      (source_type = 'post' and source_id = post_id and exists (
        select 1 from public.social_posts p where p.id = source_id and p.user_id = (select auth.uid())
      ))
      or (source_type = 'comment' and exists (
        select 1 from public.post_comments c
         where c.id = source_id and c.post_id = content_mentions.post_id and c.user_id = (select auth.uid())
      ))
    )
  );

drop policy if exists "authors remove their mentions" on public.content_mentions;
create policy "authors remove their mentions" on public.content_mentions
  for delete to authenticated using (created_by = (select auth.uid()));

grant select on public.content_mentions to anon, authenticated;
grant insert, delete on public.content_mentions to authenticated;

create or replace function public.notify_content_mention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.write_notification(
    new.mentioned_user_id,
    new.created_by,
    'mention',
    'You were mentioned',
    coalesce(public.display_name_of(new.created_by), 'Someone')
      || case when new.source_type = 'comment' then ' mentioned you in a comment' else ' mentioned you in a post' end,
    new.post_id,
    jsonb_build_object('source_type', new.source_type, 'source_id', new.source_id)
  );
  return new;
end $$;

drop trigger if exists notify_content_mention_trg on public.content_mentions;
create trigger notify_content_mention_trg
  after insert on public.content_mentions
  for each row execute function public.notify_content_mention();

create table if not exists public.feed_reactions (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('post', 'comment')),
  target_id uuid not null,
  user_id uuid not null default auth.uid(),
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  unique (target_type, target_id, user_id, emoji)
);

create index if not exists feed_reactions_target_idx on public.feed_reactions (target_type, target_id);
create index if not exists feed_reactions_user_idx on public.feed_reactions (user_id);

alter table public.feed_reactions enable row level security;

drop policy if exists "reactions are readable" on public.feed_reactions;
create policy "reactions are readable" on public.feed_reactions
  for select using (not public.blocked_either_way(user_id));

drop policy if exists "react as yourself to what you can see" on public.feed_reactions;
create policy "react as yourself to what you can see" on public.feed_reactions
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and not public.has_restriction((select auth.uid()), 'mute')
    and (
      (target_type = 'post' and exists (
        select 1 from public.social_posts p
         where p.id = target_id and p.is_deleted = false and not public.blocked_either_way(p.user_id)
      ))
      or (target_type = 'comment' and exists (
        select 1 from public.post_comments c
         where c.id = target_id and not public.blocked_either_way(c.user_id)
      ))
    )
  );

drop policy if exists "take your own reaction back" on public.feed_reactions;
create policy "take your own reaction back" on public.feed_reactions
  for delete to authenticated using (user_id = (select auth.uid()));

grant select on public.feed_reactions to anon, authenticated;
grant insert, delete on public.feed_reactions to authenticated;

-- Reactions and mentions go with the post or comment they were on.
create or replace function public.feed_cleanup_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.feed_reactions where target_type = 'comment' and target_id = old.id;
  delete from public.content_mentions where source_type = 'comment' and source_id = old.id;
  return old;
end $$;

drop trigger if exists feed_cleanup_comment_trg on public.post_comments;
create trigger feed_cleanup_comment_trg
  after delete on public.post_comments
  for each row execute function public.feed_cleanup_comment();

create or replace function public.feed_cleanup_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.feed_reactions where target_type = 'post' and target_id = old.id;
  return old;
end $$;

drop trigger if exists feed_cleanup_post_trg on public.social_posts;
create trigger feed_cleanup_post_trg
  after delete on public.social_posts
  for each row execute function public.feed_cleanup_post();
