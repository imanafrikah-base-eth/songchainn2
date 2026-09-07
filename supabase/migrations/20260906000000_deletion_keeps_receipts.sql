-- Deleting an account keeps the receipts.
--
-- The delete-account function promises, and the Privacy Policy repeats, that
-- purchases, trades, bookings and coin launches survive an account deletion
-- with the account unlinked. Three tables broke that promise silently: their
-- user column was `references auth.users(id) on delete cascade`, so the moment
-- the auth record went, the receipt went with it. A record of money moving on
-- Base is not personal data to be wiped; it is the proof somebody paid, and
-- the thing an accountant or a dispute would ask for.
--
-- Each of these becomes `on delete set null`, which means the column has to
-- allow null first. The wallet address and the transaction hash stay on the
-- row, so the receipt is still complete; only the pointer to a person goes.
--
-- artist_accounts.user_id is in the same position for a different reason:
-- the claim on an artist page (its verification badge, its theme) is public
-- work, and the delete-account function now unlinks it rather than deleting
-- it. The first version of that table (20251229100000) made the column
-- `unique not null ... on delete cascade`; the rewrite in 20260822000000 used
-- `create table if not exists` and so never changed it on a database where
-- the first had already run. This migration settles it either way.
--
-- The foreign keys were declared inline without a name, so Postgres named
-- them `<table>_<column>_fkey`. Rather than trust that, the helper looks the
-- constraint up by what it does (a foreign key on that column pointing at
-- auth.users) and drops whatever it finds before adding the named one. A
-- table that does not exist is skipped with a notice. Safe to run twice.

create or replace function pg_temp.relink_to_auth_users(
  p_table text,
  p_column text,
  p_constraint text,
  p_comment text
) returns void
language plpgsql
as $fn$
declare
  v_name text;
begin
  if to_regclass('public.' || p_table) is null then
    raise notice 'relink: public.% does not exist, skipping', p_table;
    return;
  end if;

  -- 1. The column must accept null before the FK can set it.
  execute format('alter table public.%I alter column %I drop not null', p_table, p_column);

  -- 2. Drop every foreign key on that column that points at auth.users.
  for v_name in
    select c.conname
      from pg_constraint c
      join pg_class t     on t.oid  = c.conrelid
      join pg_namespace n on n.oid  = t.relnamespace
      join pg_class ft    on ft.oid = c.confrelid
      join pg_namespace fn on fn.oid = ft.relnamespace
     where c.contype = 'f'
       and n.nspname = 'public'
       and t.relname = p_table
       and fn.nspname = 'auth'
       and ft.relname = 'users'
       and c.conkey = array[(
         select a.attnum from pg_attribute a
          where a.attrelid = t.oid and a.attname = p_column and not a.attisdropped
       )]
  loop
    execute format('alter table public.%I drop constraint if exists %I', p_table, v_name);
  end loop;

  -- 3. Re-add it, by name, with set null.
  execute format(
    'alter table public.%I add constraint %I foreign key (%I) references auth.users(id) on delete set null',
    p_table, p_constraint, p_column
  );

  -- 4. Say so on the column.
  execute format('comment on column public.%I.%I is %L', p_table, p_column, p_comment);
end
$fn$;

-- Receipts.
select pg_temp.relink_to_auth_users('battle_host_fees', 'host_user_id', 'battle_host_fees_host_user_id_fkey',
  'Who paid. Null once that account has been deleted; the wallet and tx_hash on the row remain the receipt.');
select pg_temp.relink_to_auth_users('battle_trades', 'user_id', 'battle_trades_user_id_fkey',
  'Who traded. Null once that account has been deleted; the wallet and tx_hash on the row remain the receipt.');
select pg_temp.relink_to_auth_users('world_meeting_requests', 'user_id', 'world_meeting_requests_user_id_fkey',
  'Who asked. Null once that account has been deleted; the row stays as the record of the booking.');

-- The artist page claim (see the note at the top).
select pg_temp.relink_to_auth_users('artist_accounts', 'user_id', 'artist_accounts_user_id_fkey',
  'Who owns the page. Null when nobody does yet, or when the owner deleted their account; the claim, badge and theme stay.');

drop function if exists pg_temp.relink_to_auth_users(text, text, text, text);
