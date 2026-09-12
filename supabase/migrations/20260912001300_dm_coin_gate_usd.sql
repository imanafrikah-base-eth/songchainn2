-- Messaging a musician costs the same as seeing when they are online:
-- $0.50 worth of their coin (HOLDER_PERK_USD in src/hooks/useArtistCoinHolding.ts).
-- artist-dm-gate prices the holding with Zora's coin price and records it here;
-- a failed price read records nothing and never allows.

alter table public.dm_coin_access add column if not exists usd_value numeric not null default 0;

create or replace function public.can_dm_artist(_me uuid, _other uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    _me is not null and _other is not null and (
      not public.is_artist(_other)
      or public.is_artist(_me)
      or public.is_admin(_me)
      or exists (
        select 1
        from public.dm_messages m
        join public.dm_participants p
          on p.conversation_id = m.conversation_id and p.user_id = _me
        where m.sender_user_id = _other
      )
      or exists (
        select 1 from public.dm_coin_access a
        where a.user_id = _me
          and a.artist_user_id = _other
          and a.usd_value >= 0.50
          and a.checked_at > now() - interval '15 minutes'
      )
    );
$function$;

revoke all on function public.can_dm_artist(uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_dm_artist(uuid, uuid) to service_role;
