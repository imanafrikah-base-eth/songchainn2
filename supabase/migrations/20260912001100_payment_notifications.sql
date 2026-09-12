-- When anyone pays or gets paid, both sides hear about it.
--
-- Only server-written money tables get a trigger: battle_trades,
-- battle_host_fees, battle_fee_shares, battle_voice_fees,
-- battle_winner_payouts and artist_payouts. Every one of those rows is written
-- by an edge function after Base confirmed the transfer.
--
-- song_purchases deliberately gets NOTHING: the browser writes it without any
-- verification, so a trigger there would let anyone forge "you got paid".
-- Client-side buys report through the payment-receipt edge function instead,
-- which reads the transaction off Base itself.
--
-- SAFETY. These are AFTER triggers on tables that record real money. Every
-- trigger body is wrapped in BEGIN ... EXCEPTION WHEN OTHERS THEN NULL, so a
-- notification that fails can never roll back a recorded payment.

/* ----------------------------------------------------- dedupe for receipts */
create table if not exists public.payment_receipts (
  tx_hash    text primary key check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,
  context_id text,
  created_at timestamptz not null default now()
);
alter table public.payment_receipts enable row level security;
revoke all on table public.payment_receipts from anon, authenticated;
grant all on table public.payment_receipts to service_role;
create index if not exists payment_receipts_user_idx on public.payment_receipts (user_id);

/* ------------------------------------------------------ an honest amount */
-- Raw token units to a readable label, only for tokens whose decimals we know.
-- Anything else returns null and the message is written without a number,
-- because a wrong number about money is worse than none.
create or replace function public.payment_amount_label(p_raw numeric, p_token text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v numeric;
  sym text;
  dec integer;
  s text;
begin
  if p_raw is null or p_raw <= 0 then
    return null;
  end if;
  case lower(coalesce(p_token, ''))
    when 'eth' then sym := 'ETH'; dec := 18;
    when '0xefa920796416daf8dc8df7e5ceaeee45ae3350be' then sym := '$WWAT'; dec := 18;
    when '0x4200000000000000000000000000000000000006' then sym := 'WETH'; dec := 18;
    when '0x833589fcd6edb6e08f4c7c32d65f71ee54a5a0ba' then sym := 'USDC'; dec := 6;
    when '0x1111111111166b7fe7bd91427724b487980afc69' then sym := 'ZORA'; dec := 18;
    else return null;
  end case;
  v := p_raw / power(10::numeric, dec);
  v := round(v, case when v >= 1000 then 0 when v >= 1 then 2 else 6 end);
  if v = 0 then
    return 'less than 0.000001 ' || sym;
  end if;
  s := to_char(v, 'FM999,999,999,999,990.999999');
  if position('.' in s) > 0 then
    s := rtrim(rtrim(s, '0'), '.');
  end if;
  return s || ' ' || sym;
end;
$$;

/* ------------------------------------------------- who is behind a wallet */
-- A PROVED user wallet first, then an artist's payout wallet on file.
create or replace function public.payment_user_for_address(p_addr text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a text := lower(trim(coalesce(p_addr, '')));
  u uuid;
begin
  if a !~ '^0x[0-9a-f]{40}$' then
    return null;
  end if;
  select w.user_id into u
    from public.user_wallets w
   where lower(w.address) = a
     and w.verified_at is not null
   order by w.verified_at
   limit 1;
  if u is not null then
    return u;
  end if;
  select aa.user_id into u
    from public.artist_wallets aw
    join public.artist_accounts aa on aa.artist_id = aw.artist_id
   where lower(aw.wallet_address) = a
     and aa.user_id is not null
   limit 1;
  return u;
end;
$$;

create or replace function public.payment_user_for_artist_name(p_name text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select aa.user_id
    from public.artist_wallets aw
    join public.artist_accounts aa on aa.artist_id = aw.artist_id
   where lower(aw.artist_name) = lower(trim(coalesce(p_name, '')))
     and aa.user_id is not null
   limit 1;
$$;

/* ------------------------------------------------------- the one writer */
create or replace function public.notify_payment(
  p_payer uuid,
  p_payee uuid,
  p_kind text,
  p_amount_label text,
  p_meta jsonb default '{}'::jsonb,
  p_notify_payer boolean default true,
  p_notify_payee boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  amt text := nullif(trim(coalesce(p_amount_label, '')), '');
  meta jsonb := coalesce(p_meta, '{}'::jsonb)
                || jsonb_build_object('kind', p_kind, 'amount', amt);
  payer_phrase text;
  payee_phrase text;
  t_payer text := 'You paid';
  t_payee text := 'You got paid';
  m_payer text;
  m_payee text;
begin
  case p_kind
    when 'battle_backing' then
      payer_phrase := 'to back a song in a battle';
    when 'battle_host_fee' then
      payer_phrase := 'to host a battle';
    when 'battle_fee_share' then
      payee_phrase := 'from a battle host fee';
    when 'battle_voice_fee' then
      payer_phrase := 'to open voice in a battle';
    when 'battle_winner_payout' then
      payee_phrase := 'from the winners pot of a battle you backed';
    when 'artist_payout' then
      payee_phrase := 'from your song coins';
    when 'world_key' then
      payer_phrase := 'for a world key';
      payee_phrase := 'when a fan bought your world key';
    when 'song_copy' then
      payer_phrase := 'for a copy of a song';
      payee_phrase := 'when a fan bought a copy of your song';
    when 'song_sell' then
      payer_phrase := 'selling a song coin';
      payee_phrase := 'when a fan sold your song coin';
    when 'coin_buy' then
      payer_phrase := 'for a coin';
      payee_phrase := 'when a fan bought your coin';
    when 'drop_collect' then
      payer_phrase := 'to collect a drop';
      payee_phrase := 'when a fan collected your drop';
    when 'wwat' then
      payer_phrase := 'for $WWAT';
      payee_phrase := 'from a $WWAT purchase';
    else
      payer_phrase := 'for a purchase';
      payee_phrase := 'from a purchase';
  end case;
  payer_phrase := coalesce(payer_phrase, 'for a purchase');
  payee_phrase := coalesce(payee_phrase, 'from a purchase');

  m_payer := case when amt is not null
                  then 'You paid ' || amt || ' ' || payer_phrase || '.'
                  else 'Your payment ' || payer_phrase || ' went through.' end;
  m_payee := case when amt is not null
                  then 'You got paid ' || amt || ' ' || payee_phrase || '.'
                  else 'You got paid ' || payee_phrase || '.' end;

  -- The truthful exceptions.
  if p_kind = 'battle_backing' then
    -- The fan bought the artist's song coin. The artist did not receive that ETH.
    t_payee := 'Your song was backed';
    m_payee := case when amt is not null
                    then 'A fan put ' || amt || ' behind your song in a battle.'
                    else 'A fan backed your song in a battle.' end;
  elsif p_kind = 'battle_winner_payout' then
    -- The host funded the pot with their fee; the pot pays the backer.
    t_payer := 'Your battle paid a winner';
    m_payer := case when amt is not null
                    then 'The winners pot from your battle sent ' || amt || ' to a backer.'
                    else 'The winners pot from your battle paid a backer.' end;
  elsif p_kind = 'song_sell' then
    t_payer := 'Your sale went through';
    m_payer := case when amt is not null
                    then 'You sold ' || amt || '.'
                    else 'You sold a song coin.' end;
  elsif p_kind = 'artist_payout_routed' then
    t_payee := 'Your coins pay you now';
    m_payee := 'Earnings from your song coins now go straight to your wallet.';
  end if;

  if p_notify_payer and p_payer is not null then
    perform public.write_notification(p_payer, p_payee, 'payment_sent', t_payer, m_payer, null, meta);
  end if;
  if p_notify_payee and p_payee is not null then
    perform public.write_notification(p_payee, p_payer, 'payment_received', t_payee, m_payee, null, meta);
  end if;
end;
$$;

/* ------------------------------------------------------------- triggers */

create or replace function public.notify_payment_battle_trade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_artist_id text;
  v_artist_name text;
  v_recipient text;
  v_payee uuid;
begin
  begin
    select s.artist_id, s.artist_name into v_artist_id, v_artist_name
      from public.songs s where s.id = new.song_id;
    if v_artist_id is not null then
      select aa.user_id into v_payee
        from public.artist_accounts aa
       where aa.artist_id = v_artist_id and aa.user_id is not null;
    end if;
    if v_payee is null then
      select sc.payout_recipient into v_recipient
        from public.song_coins sc where sc.song_id = new.song_id;
      v_payee := public.payment_user_for_address(v_recipient);
    end if;
    if v_payee is null and v_artist_name is not null then
      v_payee := public.payment_user_for_artist_name(v_artist_name);
    end if;
    perform public.notify_payment(
      new.user_id, v_payee, 'battle_backing',
      public.payment_amount_label(new.eth_spent_wei, 'eth'),
      jsonb_build_object(
        'tx_hash', new.tx_hash, 'battle_id', new.battle_id, 'song_id', new.song_id,
        'cta_path', '/wavewarz-africa/room/' || new.battle_id::text));
  exception when others then
    null;
  end;
  return null;
end;
$$;

create or replace function public.notify_payment_battle_host_fee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.notify_payment(
      new.host_user_id, null, 'battle_host_fee',
      public.payment_amount_label(new.amount_raw, new.token_address),
      jsonb_build_object(
        'tx_hash', new.tx_hash, 'battle_id', new.battle_id,
        'cta_path', '/wavewarz-africa/room/' || new.battle_id::text),
      true, false);
  exception when others then
    null;
  end;
  return null;
end;
$$;

create or replace function public.notify_payment_battle_fee_share()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payee uuid;
  v_host uuid;
begin
  begin
    if new.payee_kind = 'artist' then
      v_payee := public.payment_user_for_artist_name(new.artist_name);
      if v_payee is null then
        v_payee := public.payment_user_for_address(new.wallet_address);
      end if;
      select b.host_user_id into v_host from public.battles b where b.id = new.battle_id;
      perform public.notify_payment(
        v_host, v_payee, 'battle_fee_share',
        public.payment_amount_label(new.amount_raw, new.token_address),
        jsonb_build_object(
          'tx_hash', new.tx_hash, 'battle_id', new.battle_id,
          'cta_path', '/wavewarz-africa/room/' || new.battle_id::text),
        false, true);
    end if;
  exception when others then
    null;
  end;
  return null;
end;
$$;

create or replace function public.notify_payment_battle_voice_fee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if not new.exempt and new.amount_raw is not null then
      perform public.notify_payment(
        new.host_user_id, null, 'battle_voice_fee',
        public.payment_amount_label(new.amount_raw, new.token_address),
        jsonb_build_object(
          'tx_hash', new.tx_hash, 'battle_id', new.battle_id,
          'cta_path', '/wavewarz-africa/room/' || new.battle_id::text),
        true, false);
    end if;
  exception when others then
    null;
  end;
  return null;
end;
$$;

create or replace function public.notify_payment_battle_winner_payout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
  v_raw numeric;
begin
  begin
    if new.status = 'sent'
       and (tg_op = 'INSERT' or old.status is distinct from 'sent') then
      select b.host_user_id into v_host from public.battles b where b.id = new.battle_id;
      if new.amount_raw ~ '^[0-9]+(\.[0-9]+)?$' then
        v_raw := new.amount_raw::numeric;
      end if;
      perform public.notify_payment(
        v_host, new.user_id, 'battle_winner_payout',
        public.payment_amount_label(v_raw, new.token_address),
        jsonb_build_object(
          'tx_hash', new.tx_hash, 'battle_id', new.battle_id,
          'cta_path', '/wavewarz-africa/room/' || new.battle_id::text));
    end if;
  exception when others then
    null;
  end;
  return null;
end;
$$;

create or replace function public.notify_payment_artist_payout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payee uuid;
  v_label text;
begin
  begin
    select aa.user_id into v_payee
      from public.artist_accounts aa
     where aa.artist_id = new.artist_id and aa.user_id is not null;
    if v_payee is not null then
      -- artist_payouts.amount has no fixed unit on record, so the number is
      -- never guessed at: the token is named and the amount stays in metadata.
      v_label := case when nullif(trim(coalesce(new.token_symbol, '')), '') is not null
                      then 'in ' || trim(new.token_symbol) end;
      perform public.notify_payment(
        null, v_payee,
        case when new.kind = 'routed' then 'artist_payout_routed' else 'artist_payout' end,
        v_label,
        jsonb_build_object(
          'tx_hash', new.tx_hash, 'artist_id', new.artist_id,
          'token_symbol', new.token_symbol, 'raw_amount', new.amount,
          'coin_count', new.coin_count, 'cta_path', '/studio'),
        false, true);
    end if;
  exception when others then
    null;
  end;
  return null;
end;
$$;

drop trigger if exists battle_trades_notify_payment on public.battle_trades;
create trigger battle_trades_notify_payment
  after insert on public.battle_trades
  for each row execute function public.notify_payment_battle_trade();

drop trigger if exists battle_host_fees_notify_payment on public.battle_host_fees;
create trigger battle_host_fees_notify_payment
  after insert on public.battle_host_fees
  for each row execute function public.notify_payment_battle_host_fee();

drop trigger if exists battle_fee_shares_notify_payment on public.battle_fee_shares;
create trigger battle_fee_shares_notify_payment
  after insert on public.battle_fee_shares
  for each row execute function public.notify_payment_battle_fee_share();

drop trigger if exists battle_voice_fees_notify_payment on public.battle_voice_fees;
create trigger battle_voice_fees_notify_payment
  after insert on public.battle_voice_fees
  for each row execute function public.notify_payment_battle_voice_fee();

drop trigger if exists battle_winner_payouts_notify_payment on public.battle_winner_payouts;
create trigger battle_winner_payouts_notify_payment
  after insert or update of status on public.battle_winner_payouts
  for each row execute function public.notify_payment_battle_winner_payout();

drop trigger if exists artist_payouts_notify_payment on public.artist_payouts;
create trigger artist_payouts_notify_payment
  after insert on public.artist_payouts
  for each row execute function public.notify_payment_artist_payout();

/* --------------------------------------------------------------- grants */
-- Triggers and the service role only. Nobody signed in can call these.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.payment_amount_label(numeric, text)',
    'public.payment_user_for_address(text)',
    'public.payment_user_for_artist_name(text)',
    'public.notify_payment(uuid, uuid, text, text, jsonb, boolean, boolean)',
    'public.notify_payment_battle_trade()',
    'public.notify_payment_battle_host_fee()',
    'public.notify_payment_battle_fee_share()',
    'public.notify_payment_battle_voice_fee()',
    'public.notify_payment_battle_winner_payout()',
    'public.notify_payment_artist_payout()'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('revoke all on function %s from authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
