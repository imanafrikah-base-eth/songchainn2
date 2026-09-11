-- Why an upload stopped, written down by the phone it stopped on.
--
-- On 10 Sep 2026 an artist's pictures and records stopped arriving. The row
-- for each one was reserved, the browser was handed its signed link, and the
-- file never reached storage. Nothing recorded why: the send goes browser to
-- bucket, so no server ever saw it fail, and the artist was told "try a
-- smaller file" by everyone including Mo$ha. This is where the real reason
-- lands from now on, one row per failed attempt, readable by the person it
-- happened to (and by Mo$ha and the founder through the service role).

create table if not exists public.upload_failures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- 'visual' is artist_media (gallery, world art, covers); 'song' is songs.
  kind text not null check (kind in ('visual', 'song')),
  row_id uuid,
  -- 'send' is the direct road to storage; 'relay' is the second road through upload-relay.
  stage text not null check (stage in ('send', 'relay')),
  message text,
  http_status integer,
  bytes bigint,
  content_type text,
  user_agent text,
  online boolean,
  created_at timestamptz not null default now()
);

create index if not exists upload_failures_user_created
  on public.upload_failures (user_id, created_at desc);

alter table public.upload_failures enable row level security;

drop policy if exists "own upload failures in" on public.upload_failures;
create policy "own upload failures in" on public.upload_failures
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "own upload failures read" on public.upload_failures;
create policy "own upload failures read" on public.upload_failures
  for select to authenticated
  using (user_id = (select auth.uid()));

grant select, insert on public.upload_failures to authenticated;
