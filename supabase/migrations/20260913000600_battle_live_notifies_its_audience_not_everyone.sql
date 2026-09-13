-- A battle going live used to notify every profile on SONGCHAINN.
--
-- notify_battle_live inserted one row per audience_profiles row, so every
-- battle wrote ~200 notifications. On 13 Sep 2026 that was 2,679 of the 3,202
-- notifications ever written, 2,657 of them never opened, and the bell had
-- become something people learned to ignore.
--
-- It now reaches the people a battle is actually for:
--   * fans of either artist (liked_artists by catalogue id, resolved from the
--     battle's artist names through songs and worlds),
--   * followers of either artist's account and of the host, creator and co-hosts,
--   * the artists and hosts themselves,
--   * anyone who voted, joined a battle room, sat in a live room or backed a
--     corner in the last 30 days.
-- Dry run against the last six battles: 9 to 12 recipients each, not ~200.
--
-- The message format (BATTLE_LIVE::<id>::<title> is now LIVE) is unchanged,
-- because the bell parses it to build the room link.

create or replace function public.battle_live_audience(_battle_id uuid)
returns table(user_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $body$
  with b as (select * from public.battles where id = _battle_id),
  names as (
    select upper(trim(n)) nm
    from b, unnest(array[b.artist_a_name, b.artist_b_name]) n
    where coalesce(trim(n), '') <> ''
  ),
  art as (
    select distinct s.artist_id from public.songs s
      join names on upper(trim(s.artist_name)) = names.nm
      where s.artist_id is not null
    union
    select distinct w.artist_id from public.worlds w
      join names on upper(trim(w.artist_name)) = names.nm
      where w.artist_id is not null
  ),
  art_users as (
    select aa.user_id from public.artist_accounts aa
      join art on art.artist_id = aa.artist_id
      where aa.user_id is not null
  ),
  hosts as (
    select b.host_user_id uid from b where b.host_user_id is not null
    union select b.created_by from b where b.created_by is not null
    union select h::uuid from b, unnest(coalesce(b.co_hosts, '{}'::text[])) h
      where h ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  aud as (
    select la.user_id from public.liked_artists la join art on art.artist_id = la.artist_id
    union select uf.follower_id from public.user_follows uf where uf.following_id in (select user_id from art_users)
    union select uf.follower_id from public.user_follows uf where uf.following_id in (select uid from hosts)
    union select user_id from art_users
    union select uid from hosts
    union select v.user_id from public.battle_votes v where v.created_at > now() - interval '30 days'
    union select br.user_id from public.battle_rooms br where br.joined_at > now() - interval '30 days'
    union select lu.user_id from public.battle_live_users lu where lu.joined_at > now() - interval '30 days'
    union select bt.user_id from public.battle_trades bt where bt.created_at > now() - interval '30 days'
  )
  select distinct aud.user_id
  from aud
  join public.audience_profiles ap on ap.user_id = aud.user_id
  where aud.user_id is not null;
$body$;

-- Internal to the trigger. Never an RPC: it lists who follows whom.
revoke all on function public.battle_live_audience(uuid) from public, anon, authenticated;

create or replace function public.notify_battle_live()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if (tg_op = 'INSERT' and new.status = 'live')
     or (tg_op = 'UPDATE' and new.status = 'live' and old.status is distinct from 'live') then
    insert into public.notifications (user_id, type, from_user_id, message)
    select a.user_id, 'mention', new.host_user_id,
           'BATTLE_LIVE::' || new.id || '::' || new.title || ' is now LIVE'
    from public.battle_live_audience(new.id) a
    where a.user_id is distinct from new.host_user_id;
  end if;
  return new;
end;
$function$;
