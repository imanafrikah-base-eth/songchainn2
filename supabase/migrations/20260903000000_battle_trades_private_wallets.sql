-- Backers' wallet addresses were readable by anyone: battle_trades and
-- battle_host_fees granted select to anon with a using(true) policy, and each
-- row carries user_id next to wallet_address. The feature only ever needed
-- the aggregate, which battle_trade_standing already provides without the
-- wallet column. So raw rows are now visible only to their own owner, and
-- the view keeps answering for everybody.
-- Applied to the live project 3 Sep 2026.

drop policy if exists battle_trades_read on public.battle_trades;
create policy battle_trades_read
  on public.battle_trades
  for select
  using ((select auth.uid()) = user_id);

drop policy if exists battle_host_fees_read on public.battle_host_fees;
create policy battle_host_fees_read
  on public.battle_host_fees
  for select
  using ((select auth.uid()) = host_user_id);

revoke select on public.battle_trades from anon;
revoke select on public.battle_host_fees from anon;

-- The standing view must keep reading the whole table on behalf of every
-- visitor, so it runs with its owner's rights, not the caller's.
alter view public.battle_trade_standing set (security_invoker = false);
