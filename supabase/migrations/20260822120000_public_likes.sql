-- Make likes readable on anybody's profile.
--
-- liked_songs and liked_artists were owner-only, so the Likes tab on someone
-- else's profile could only ever show a number. On a music social app what you
-- like is part of who you are, so the founder asked for it to be public, the
-- same way listening history already is via song_analytics.
--
-- Read only. Inserting and deleting a like stays strictly owner-only: the
-- existing "Users manage own liked songs" and per-command policies are
-- untouched, so nobody can like or unlike anything on someone else's behalf.
--
-- Nothing here exposes an email, a wallet, or anything a person did not choose
-- to attach to a public profile. If this should ever be rolled back, drop the
-- two policies below and the owner-only SELECT policies still stand.

drop policy if exists "Likes are public" on public.liked_songs;
create policy "Likes are public"
  on public.liked_songs for select
  using (true);

drop policy if exists "Liked artists are public" on public.liked_artists;
create policy "Liked artists are public"
  on public.liked_artists for select
  using (true);

comment on table public.liked_songs is
  'What each person likes. Publicly readable; only the owner can add or remove.';
comment on table public.liked_artists is
  'Which artists each person follows. Publicly readable; only the owner can add or remove.';
