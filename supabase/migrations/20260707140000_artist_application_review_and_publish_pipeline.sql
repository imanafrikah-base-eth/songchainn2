-- Persist artist submissions (previously email-only) so admins can review
-- and publish them into the live songs catalog.
create table public.artist_applications (
  id uuid primary key default gen_random_uuid(),
  real_name text not null,
  artist_name text not null,
  location text not null,
  reason text not null,
  contact_email text,
  wallet_address text not null,
  songs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.artist_applications enable row level security;

create policy "Admins can view artist applications"
on public.artist_applications for select
to authenticated
using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'));

create policy "Admins can update artist applications"
on public.artist_applications for update
to authenticated
using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'))
with check (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'));

-- No insert policy for client roles: the submit-artist-application edge
-- function writes here using the service role key, which bypasses RLS.

-- Fields needed to merge admin-published songs into the app's catalog view
-- (which otherwise comes from a static src/data/musicData.ts file).
alter table public.songs
  add column if not exists genre text,
  add column if not exists town_square text,
  add column if not exists artist_id text;

-- Previously only `anon` could read published songs, which meant logged-in
-- (`authenticated`) users had no RLS policy for this table at all.
drop policy if exists "public read songs external" on public.songs;
create policy "Public can read published songs"
on public.songs for select
to public
using (is_published = true);

create policy "Admins can insert songs"
on public.songs for insert
to authenticated
with check (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'));

create policy "Admins can update songs"
on public.songs for update
to authenticated
using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'))
with check (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'));

-- Admins need to read (and generate signed URLs for) the private submitted
-- files in order to preview and republish them.
create policy "Admins can read artist submission files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'artist-uploads'
  and exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin')
);

-- Public bucket that published (admin-approved) song audio is copied into.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'songs-audio',
  'songs-audio',
  true,
  26214400,
  array['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/flac']
)
on conflict (id) do nothing;

create policy "Public can read published song audio"
on storage.objects for select
to public
using (bucket_id = 'songs-audio');

create policy "Admins can upload published song audio"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'songs-audio'
  and exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin')
);
