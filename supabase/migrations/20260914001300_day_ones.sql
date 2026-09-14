-- Day Ones (founder, 14 Sep 2026).
--
-- Every fan gets a numbered, permanent receipt of when they found a song and
-- its artist: "Day One #37 of APE SHITT". It is earned, never bought: a real
-- listen (the 30 second play the app already counts) AND a like on the same
-- song. The number is the order fans got there in. The artist's own accounts
-- never earn one on their own music.
--
-- A receipt can also be recorded on Base as an EAS attestation made by
-- SONGCHAINN to the fan's wallet (edge function day-one-attest), so anybody can
-- check it on base.easscan.org and it can never be bought or moved later.
-- The attester key is generated here, inside Vault, and is only readable by the
-- service role: it never passes through a laptop, a chat or a repo.
--
-- A receipt is recognition and access. It is not a share, a stake or a promise
-- of money, and nothing in the app may say otherwise.

create table if not exists public.day_one_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('song', 'artist')),
  target_id text not null,
  artist_id text,
  fan_number integer not null check (fan_number > 0),
  earned_at timestamptz not null default now(),
  attestation_uid text,
  attested_to text,
  attest_tx text,
  attested_at timestamptz,
  unique (user_id, kind, target_id),
  unique (kind, target_id, fan_number)
);

create index if not exists day_one_receipts_user_idx on public.day_one_receipts (user_id, earned_at desc);
create index if not exists day_one_receipts_target_idx on public.day_one_receipts (kind, target_id, fan_number);
create index if not exists day_one_receipts_artist_idx on public.day_one_receipts (artist_id, kind, fan_number);

create table if not exists public.day_one_counters (
  kind text not null,
  target_id text not null,
  last_number integer not null default 0,
  primary key (kind, target_id)
);

alter table public.day_one_receipts enable row level security;
alter table public.day_one_counters enable row level security;

-- Being early is public, like likes are. Nobody writes these from a browser.
drop policy if exists day_one_receipts_public_read on public.day_one_receipts;
create policy day_one_receipts_public_read on public.day_one_receipts for select using (true);
grant select on public.day_one_receipts to anon, authenticated;
revoke insert, update, delete on public.day_one_receipts from anon, authenticated;
revoke all on public.day_one_counters from anon, authenticated;

create or replace function public.day_one_next_number(_kind text, _target text)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.day_one_counters as c (kind, target_id, last_number)
  values (_kind, _target, 1)
  on conflict (kind, target_id) do update set last_number = c.last_number + 1
  returning last_number;
$$;
revoke all on function public.day_one_next_number(text, text) from public, anon, authenticated;

-- Give this person their receipts for this song and its artist, if they have
-- earned them and do not have them yet. Never raises: a like or a play must
-- never fail because of this.
create or replace function public.award_day_one(_user uuid, _song_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _artist text;
  _owner uuid;
  _published boolean;
begin
  if _user is null or _song_id is null then return; end if;

  select s.artist_id, s.owner_id, coalesce(s.is_published, false)
    into _artist, _owner, _published
    from public.songs s where s.id = _song_id;
  if not found or not _published then return; end if;

  -- The artist never earns a receipt on their own music.
  if _owner = _user then return; end if;
  if _artist is not null and exists (
    select 1 from public.artist_accounts a where a.user_id = _user and a.artist_id::text = _artist
  ) then return; end if;

  -- A real listen and a like, both.
  if not exists (select 1 from public.liked_songs l where l.user_id = _user and l.song_id = _song_id) then return; end if;
  if not exists (
    select 1 from public.song_analytics e where e.user_id = _user and e.song_id = _song_id and e.event_type = 'play'
  ) then return; end if;

  if not exists (select 1 from public.day_one_receipts r where r.user_id = _user and r.kind = 'song' and r.target_id = _song_id) then
    insert into public.day_one_receipts (user_id, kind, target_id, artist_id, fan_number)
    values (_user, 'song', _song_id, _artist, public.day_one_next_number('song', _song_id))
    on conflict do nothing;
  end if;

  if _artist is not null and not exists (
    select 1 from public.day_one_receipts r where r.user_id = _user and r.kind = 'artist' and r.target_id = _artist
  ) then
    insert into public.day_one_receipts (user_id, kind, target_id, artist_id, fan_number)
    values (_user, 'artist', _artist, _artist, public.day_one_next_number('artist', _artist))
    on conflict do nothing;
  end if;
exception when others then
  raise warning 'award_day_one: %', sqlerrm;
end;
$$;
revoke all on function public.award_day_one(uuid, text) from public, anon, authenticated;

create or replace function public.trg_day_one_like()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.award_day_one(new.user_id, new.song_id);
  return new;
end $$;

create or replace function public.trg_day_one_play()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.event_type = 'play' and new.user_id is not null then
    perform public.award_day_one(new.user_id, new.song_id);
  end if;
  return new;
end $$;

drop trigger if exists day_one_on_like on public.liked_songs;
create trigger day_one_on_like after insert on public.liked_songs
  for each row execute function public.trg_day_one_like();

drop trigger if exists day_one_on_play on public.song_analytics;
create trigger day_one_on_play after insert on public.song_analytics
  for each row execute function public.trg_day_one_play();

-- The history already here counts. Fans who got there first before this
-- existed keep their place: numbered by when they qualified (the later of
-- their first play and their like).
with qualified as (
  select l.user_id, l.song_id, s.artist_id,
         greatest(l.created_at, min(e.created_at)) as qualified_at
    from public.liked_songs l
    join public.songs s on s.id = l.song_id and coalesce(s.is_published, false)
    join public.song_analytics e on e.user_id = l.user_id and e.song_id = l.song_id and e.event_type = 'play'
   where (s.owner_id is null or s.owner_id <> l.user_id)
     and not exists (select 1 from public.artist_accounts a where a.user_id = l.user_id and a.artist_id::text = s.artist_id)
   group by l.user_id, l.song_id, s.artist_id, l.created_at
),
song_rows as (
  select user_id, 'song'::text kind, song_id target_id, artist_id, qualified_at,
         row_number() over (partition by song_id order by qualified_at, user_id) n
    from qualified
),
artist_first as (
  select user_id, artist_id, min(qualified_at) qualified_at from qualified where artist_id is not null group by user_id, artist_id
),
artist_rows as (
  select user_id, 'artist'::text kind, artist_id target_id, artist_id, qualified_at,
         row_number() over (partition by artist_id order by qualified_at, user_id) n
    from artist_first
)
insert into public.day_one_receipts (user_id, kind, target_id, artist_id, fan_number, earned_at)
select user_id, kind, target_id, artist_id, n, qualified_at from song_rows
union all
select user_id, kind, target_id, artist_id, n, qualified_at from artist_rows
on conflict do nothing;

insert into public.day_one_counters (kind, target_id, last_number)
select kind, target_id, max(fan_number) from public.day_one_receipts group by kind, target_id
on conflict (kind, target_id) do update set last_number = greatest(public.day_one_counters.last_number, excluded.last_number);

-- My receipts, with what they are for.
create or replace function public.my_day_ones()
returns table (
  id uuid, kind text, target_id text, artist_id text, fan_number integer, earned_at timestamptz,
  total_fans integer, song_title text, artist_name text, cover_url text,
  attestation_uid text, attested_to text, attest_tx text, attested_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.kind, r.target_id, r.artist_id, r.fan_number, r.earned_at,
         coalesce(c.last_number, r.fan_number),
         case when r.kind = 'song' then s.title end,
         coalesce(s.artist_name, (select s2.artist_name from public.songs s2 where s2.artist_id = r.artist_id and s2.artist_name is not null order by s2.created_at limit 1)),
         case when r.kind = 'song' then s.cover_art_url
              else coalesce((select s3.artist_image_url from public.songs s3 where s3.artist_id = r.artist_id and s3.artist_image_url is not null order by s3.created_at limit 1),
                            (select s4.cover_art_url from public.songs s4 where s4.artist_id = r.artist_id and s4.cover_art_url is not null order by s4.created_at limit 1)) end,
         r.attestation_uid, r.attested_to, r.attest_tx, r.attested_at
    from public.day_one_receipts r
    left join public.day_one_counters c on c.kind = r.kind and c.target_id = r.target_id
    left join public.songs s on r.kind = 'song' and s.id = r.target_id
   where r.user_id = auth.uid()
   order by r.earned_at desc;
$$;
revoke all on function public.my_day_ones() from public, anon;
grant execute on function public.my_day_ones() to authenticated;

-- An artist's first fans, by name, lowest number first.
create or replace function public.artist_day_ones(_artist_id text, _limit integer default 100)
returns table (user_id uuid, display_name text, avatar_url text, fan_number integer, earned_at timestamptz, on_chain boolean)
language sql
stable
security definer
set search_path = public
as $$
  select r.user_id,
         coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.username), ''), 'A fan'),
         coalesce(p.profile_picture_url, p.avatar_url),
         r.fan_number, r.earned_at, r.attestation_uid is not null
    from public.day_one_receipts r
    left join public.audience_profiles p on p.user_id = r.user_id
   where r.kind = 'artist' and r.target_id = _artist_id
   order by r.fan_number
   limit greatest(1, least(coalesce(_limit, 100), 500));
$$;
grant execute on function public.artist_day_ones(text, integer) to anon, authenticated;

-- The attester key, made once, inside Vault.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'day_one_attester_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'day_one_attester_key', 'EAS attester for Day One receipts on Base');
  end if;
end $$;

create or replace function public.day_one_attester_secret()
returns text
language sql
stable
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'day_one_attester_key' limit 1;
$$;
revoke all on function public.day_one_attester_secret() from public, anon, authenticated;
grant execute on function public.day_one_attester_secret() to service_role;
