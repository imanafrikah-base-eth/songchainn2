-- PREPARED, NOT APPLIED (13 Sep 2026). Review before applying.
-- Security advisor: security_definer_view (10 ERROR). Only the four views whose
-- readers see exactly the same rows under security_invoker are switched here.
--
-- song_like_counts   -> liked_songs has "Likes are public" (public, true) and anon/auth
--                       hold SELECT on song_id. Same counts for everyone.
-- battle_vote_counts -> battle_votes has "Anyone can view votes" (public, true) and
--                       anon/auth hold SELECT on battle_id, side. Same counts.
-- battle_live_users  -> anon has no grant on the view already. authenticated has
--                       battle_rooms_read_signed_in (true) + audience_profiles
--                       ap_select (true) and column SELECT on every column used.
-- room_live_users    -> anon has no grant already. authenticated has
--                       room_profiles_read_signed_in (true) and every column.
--
-- NOT switched, because invoker would change what people read:
-- songchainn_public_songs -> songs' public policy also hides scheduled releases
--   (release_date / release_at in the future); the view shows every is_published row.
-- song_pulse_counts       -> pulses SELECT policy is authenticated only; anon would read 0.
-- battle_trade_standing   -> battle_trades policy is own rows only; totals would collapse
--   to the reader's own trades, and anon holds no table grant.
-- battle_listener_counts, battle_live_counts, room_live_counts -> base tables are
--   authenticated only since 20260912000400; these views ARE the signed-out count.
--   Memory rule: never revoke or break these.
alter view public.song_like_counts   set (security_invoker = true);
alter view public.battle_vote_counts set (security_invoker = true);
alter view public.battle_live_users  set (security_invoker = true);
alter view public.room_live_users    set (security_invoker = true);
