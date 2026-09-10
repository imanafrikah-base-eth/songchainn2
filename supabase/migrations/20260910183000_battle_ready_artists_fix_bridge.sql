-- The Main Stage gate matched an artist's wallet row to their account by
-- artist_id, and those two do not speak the same language: artist_wallets
-- keys a payout by name ("name:IMan Afrikah"), while artist_accounts keys by
-- the catalog number. Nothing joined, so the gate said no artist was ready
-- and would have refused every Main Stage battle.
--
-- The name is the bridge that does hold: a wallet row's artist_name against
-- the display name on the verified account. That covers all eleven artists;
-- the collaboration payout rows (X ft Y) match nothing, which is right,
-- because a pair is not an artist who steps on stage.

create or replace function public.battle_artist_ready(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.artist_wallets w
     where lower(btrim(coalesce(w.artist_name, ''))) = lower(btrim(coalesce(p_name, '')))
       and coalesce(w.wallet_address, '') ~ '^0x[0-9a-fA-F]{40}$'
       and exists (
         select 1
           from public.artist_accounts a
           join public.audience_profiles p on p.user_id = a.user_id
          where a.is_verified
            and lower(btrim(coalesce(p.display_name, ''))) = lower(btrim(coalesce(w.artist_name, '')))
       )
  );
$$;
grant execute on function public.battle_artist_ready(text) to authenticated, anon;

create or replace function public.battle_ready_artists()
returns table (artist_id text, artist_name text)
language sql
stable
security definer
set search_path = public
as $$
  select a.artist_id, w.artist_name
    from public.artist_wallets w
    join public.audience_profiles p
      on lower(btrim(coalesce(p.display_name, ''))) = lower(btrim(coalesce(w.artist_name, '')))
    join public.artist_accounts a
      on a.user_id = p.user_id and a.is_verified
   where coalesce(w.wallet_address, '') ~ '^0x[0-9a-fA-F]{40}$'
   group by a.artist_id, w.artist_name
   order by w.artist_name;
$$;
grant execute on function public.battle_ready_artists() to authenticated, anon;
