-- Documents a trigger that already exists live but was missing from this
-- migration history (confirmed via list_migrations that the remote history
-- diverges from this folder). Written idempotently so re-applying is safe.
-- Fires only for public playlists at creation time; private->public toggles
-- later (updatePlaylistVisibility) intentionally do not post -- separate gap.
create or replace function public.create_playlist_social_post()
returns trigger
language plpgsql
security definer
as $$
begin
  if coalesce(new.is_public, false) = true then
    insert into public.social_posts (
      user_id, post_type, activity_type, target_type, playlist_id,
      text_content, metadata, visibility
    )
    values (
      new.user_id, 'activity', 'playlist_created', 'playlist', new.id,
      null,
      jsonb_build_object('playlist_id', new.id, 'action', 'created'),
      'public'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_playlist_social_post on public.playlists;
create trigger trg_playlist_social_post
  after insert on public.playlists
  for each row execute function public.create_playlist_social_post();
