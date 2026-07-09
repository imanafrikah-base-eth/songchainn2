-- Pulses previously only recorded wall-clock time, never the song playback
-- position, so the feed had no way to show "pulsed at 1:22" or seek the card
-- to that moment. Add a nullable position_seconds column captured by the
-- client (currentTime of the audio element at the moment of the pulse) and
-- thread it through to the feed post's metadata.
alter table public.song_analytics add column if not exists position_seconds numeric;

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
      values (
        new.user_id, 'song_pulse', new.song_id,
        jsonb_build_object('song_id', new.song_id, 'action', 'pulsed', 'position_seconds', new.position_seconds),
        'public'
      );
    end if;
  end if;
  return new;
end;
$$;
