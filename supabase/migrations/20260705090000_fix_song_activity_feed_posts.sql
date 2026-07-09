-- social_posts_content_or_media_check required non-empty content or media_url on
-- EVERY row. But song_like/song_pulse/artist_follow posts (and the 'activity'/
-- 'system' types written by create_playlist_social_post/create_songchainn_system_post)
-- never set either -- they carry meaning via song_id/artist_id/playlist_id/metadata
-- instead. Confirmed: social_posts has had zero rows of any type other than 'text'
-- since the table existed. This is why liking/pulsing a song, following an artist,
-- or creating a public playlist has never actually posted to the feed.
alter table public.social_posts drop constraint social_posts_content_or_media_check;
alter table public.social_posts add constraint social_posts_has_payload_check
check (
  (content is not null and length(trim(content)) > 0)
  or (media_url is not null and length(trim(media_url)) > 0)
  or (text_content is not null and length(trim(text_content)) > 0)
  or song_id is not null
  or playlist_id is not null
  or artist_id is not null
);

-- Add 'song_comment' (new: commenting on a song now shares to feed, matching
-- song_like/song_pulse) plus 'activity'/'system', which existing DB triggers
-- already produce but could never actually insert under the old post_type check.
alter table public.social_posts drop constraint social_posts_post_type_check;
alter table public.social_posts add constraint social_posts_post_type_check
check (post_type = any (array[
  'text', 'song_share', 'playlist_share', 'listening', 'welcome',
  'song_like', 'song_pulse', 'artist_follow', 'song_comment',
  'activity', 'system'
]));

-- liked_songs had two separate AFTER INSERT triggers both calling
-- create_song_like_social_post() -- every like would have produced two
-- identical feed posts once the check constraint above stopped blocking them.
drop trigger if exists trg_song_like_post on public.liked_songs;

-- Preserve "post to feed at most once per user+song" for likes (matches the
-- semantics of the client-side check this replaces).
create or replace function public.create_song_like_social_post()
returns trigger
language plpgsql
security definer
as $$
begin
  if not exists (
    select 1 from public.social_posts
    where user_id = new.user_id and song_id = new.song_id and post_type = 'song_like'
  ) then
    insert into public.social_posts (user_id, post_type, song_id, metadata, visibility)
    values (new.user_id, 'song_like', new.song_id, jsonb_build_object('song_id', new.song_id, 'action', 'liked'), 'public');
  end if;
  return new;
end;
$$;

-- Preserve the "at most one pulse post per user+song per 4 hours" cooldown
-- (matches the client-side check this replaces) so rapid pulsing can't spam the feed.
create or replace function public.create_song_pulse_social_post()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.event_type = 'pulse' and new.song_id is not null and new.user_id is not null then
    if not exists (
      select 1 from public.social_posts
      where user_id = new.user_id
        and song_id = new.song_id
        and post_type = 'song_pulse'
        and created_at > now() - interval '4 hours'
    ) then
      insert into public.social_posts (user_id, post_type, song_id, metadata, visibility)
      values (new.user_id, 'song_pulse', new.song_id, jsonb_build_object('song_id', new.song_id, 'action', 'pulsed'), 'public');
    end if;
  end if;
  return new;
end;
$$;
