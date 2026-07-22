-- Tracks every cypher beat download so totals can be shown and reported.
-- Inserts happen only via the track-zabal-download edge function (service role).
create table if not exists public.zabal_gamez_beat_downloads (
  id uuid primary key default gen_random_uuid(),
  source text,
  created_at timestamptz not null default now()
);

alter table public.zabal_gamez_beat_downloads enable row level security;

-- Public count/read so the section can show social-proof totals
drop policy if exists "zabal_downloads_public_read" on public.zabal_gamez_beat_downloads;
create policy "zabal_downloads_public_read"
  on public.zabal_gamez_beat_downloads for select
  to anon, authenticated
  using (true);

grant select on public.zabal_gamez_beat_downloads to anon, authenticated;

create index if not exists zabal_downloads_created_idx
  on public.zabal_gamez_beat_downloads (created_at desc);
