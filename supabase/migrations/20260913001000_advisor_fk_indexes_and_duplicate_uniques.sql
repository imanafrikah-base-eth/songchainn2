-- Performance advisor: 39 unindexed foreign keys, 3 duplicate indexes.
-- Behaviour preserving: indexes only. The three dropped objects are duplicate
-- UNIQUE constraints on identical columns; the twin constraint that stays
-- enforces exactly the same uniqueness. Nothing in pg_proc or the repo names
-- the dropped constraints (checked 13 Sep 2026), so ON CONFLICT (cols) keeps
-- working through the surviving constraint.

create index if not exists idx_social_posts_media_id on public.social_posts (media_id);
create index if not exists idx_battles_created_by on public.battles (created_by);
create index if not exists idx_battles_host_user_id on public.battles (host_user_id);
create index if not exists idx_direct_messages_sender_user_id on public.direct_messages (sender_user_id);
create index if not exists idx_dm_ai_jobs_thread_id on public.dm_ai_jobs (thread_id);
create index if not exists idx_dm_ai_jobs_user_message_id on public.dm_ai_jobs (user_message_id);
create index if not exists idx_battle_room_messages_user_id on public.battle_room_messages (user_id);
create index if not exists idx_battle_speaker_requests_approved_by on public.battle_speaker_requests (approved_by);
create index if not exists idx_battle_speaker_requests_user_id on public.battle_speaker_requests (user_id);
create index if not exists idx_user_roles_user_id on public.user_roles (user_id);
create index if not exists idx_playlist_collaborators_user_id on public.playlist_collaborators (user_id);
create index if not exists idx_phase_two_beta_reports_user_id on public.phase_two_beta_reports (user_id);
create index if not exists idx_artist_claims_reviewed_by on public.artist_claims (reviewed_by);
create index if not exists idx_artist_claims_user_id on public.artist_claims (user_id);
create index if not exists idx_world_streets_key_nft_id on public.world_streets (key_nft_id);
create index if not exists idx_world_roles_user_id on public.world_roles (user_id);
create index if not exists idx_world_citizens_user_id on public.world_citizens (user_id);
create index if not exists idx_dm_conversations_last_sender_id on public.dm_conversations (last_sender_id);
create index if not exists idx_post_tags_created_by on public.post_tags (created_by);
create index if not exists idx_world_feature_requests_world_id on public.world_feature_requests (world_id);
create index if not exists idx_content_reports_handled_by on public.content_reports (handled_by);
create index if not exists idx_content_reports_reporter_id on public.content_reports (reporter_id);
create index if not exists idx_account_actions_created_by on public.account_actions (created_by);
create index if not exists idx_account_actions_report_id on public.account_actions (report_id);
create index if not exists idx_account_appeals_decided_by on public.account_appeals (decided_by);
create index if not exists idx_account_appeals_user_id on public.account_appeals (user_id);
create index if not exists idx_bug_reports_user_id on public.bug_reports (user_id);
create index if not exists idx_world_nfts_world_id on public.world_nfts (world_id);
create index if not exists idx_artist_verification_requests_reviewed_by on public.artist_verification_requests (reviewed_by);
create index if not exists idx_account_links_linked_by_admin on public.account_links (linked_by_admin);
create index if not exists idx_farcaster_identities_set_by on public.farcaster_identities (set_by);
create index if not exists idx_world_voice_sessions_host_id on public.world_voice_sessions (host_id);
create index if not exists idx_world_voice_sessions_world_id on public.world_voice_sessions (world_id);
create index if not exists idx_world_episodes_host_id on public.world_episodes (host_id);
create index if not exists idx_world_episodes_session_id on public.world_episodes (session_id);
create index if not exists idx_world_episodes_world_id on public.world_episodes (world_id);
create index if not exists idx_battle_voice_fees_host_user_id on public.battle_voice_fees (host_user_id);
create index if not exists idx_artist_coins_added_by on public.artist_coins (added_by);
create index if not exists idx_dm_coin_access_artist_user_id on public.dm_coin_access (artist_user_id);

-- Duplicate UNIQUE constraints (identical btree on identical columns).
alter table public.user_follows drop constraint if exists user_follows_unique_pair;          -- keeps user_follows_follower_id_following_id_key
alter table public.battle_rooms drop constraint if exists battle_rooms_battle_user_unique;    -- keeps battle_rooms_battle_id_user_id_key
alter table public.room_profiles drop constraint if exists room_user_unique;                 -- keeps room_profiles_room_user_unique
