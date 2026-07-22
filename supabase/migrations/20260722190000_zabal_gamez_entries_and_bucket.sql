-- Zabal Gamez musician track: public bucket for verse uploads + live entries table.

-- Public bucket for Zabal Gamez verse uploads (audio, 30MB cap)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'zabal-gamez',
  'zabal-gamez',
  true,
  31457280,
  array['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/mp4','audio/aac','audio/ogg','audio/flac','audio/webm']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Anyone (signed in or not) may upload their verse into this bucket
drop policy if exists "zabal_gamez_public_upload" on storage.objects;
create policy "zabal_gamez_public_upload"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'zabal-gamez');

-- Public read of the uploaded verses (bucket is public, but be explicit)
drop policy if exists "zabal_gamez_public_read" on storage.objects;
create policy "zabal_gamez_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'zabal-gamez');

-- Entries table: rendered live on the Zabal Gamez wall
create table if not exists public.zabal_gamez_entries (
  id uuid primary key default gen_random_uuid(),
  artist_name text not null,
  contact_email text,
  verse_audio_url text,
  tiktok_url text,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.zabal_gamez_entries enable row level security;

-- Public read of non-hidden entries; inserts happen via the
-- submit-zabal-entry edge function using the service role.
drop policy if exists "zabal_gamez_entries_public_read" on public.zabal_gamez_entries;
create policy "zabal_gamez_entries_public_read"
  on public.zabal_gamez_entries for select
  to anon, authenticated
  using (is_hidden = false);

grant select on public.zabal_gamez_entries to anon, authenticated;

create index if not exists zabal_gamez_entries_created_idx
  on public.zabal_gamez_entries (created_at desc);
