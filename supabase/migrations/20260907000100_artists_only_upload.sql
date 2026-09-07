-- Only an artist account puts records up.
--
-- Until now anybody signed in could insert a song row and upload-url would
-- quietly make them an artist on first publish. Ernest's rule, 7 Sep 2026:
-- the audience never has an artist's tools. An artist account is granted
-- (Admin > Claims, approve_artist_claim), not earned by pressing Upload.
--
-- The policy keeps its name and its other conditions; it gains is_artist().
-- upload-url refuses the same people earlier, with a reason, but a policy is
-- the wall and the function is the sign on it.

drop policy if exists "Artists insert own songs" on public.songs;
create policy "Artists insert own songs"
  on public.songs for insert
  with check (
    owner_id = auth.uid()
    and status = 'uploading'
    and audition is null
    and is_artist(auth.uid())
  );
