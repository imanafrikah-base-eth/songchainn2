-- Download stats are internal: only admin accounts may read them.
-- (Replaces the public-read policy from 20260722210000.)
drop policy if exists "zabal_downloads_public_read" on public.zabal_gamez_beat_downloads;
drop policy if exists "zabal_downloads_admin_read" on public.zabal_gamez_beat_downloads;
create policy "zabal_downloads_admin_read"
  on public.zabal_gamez_beat_downloads for select
  to authenticated
  using (
    lower(coalesce(auth.jwt()->>'email', '')) in (
      'songchaindao@gmail.com',
      'music.imanafrikah@gmail.com',
      'info@thezao.com'
    )
  );

revoke select on public.zabal_gamez_beat_downloads from anon;
