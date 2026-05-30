-- Full replica identity so realtime UPDATE events include all farcaster profile columns,
-- not just the primary key (fid). Required for the community page live subscription.
ALTER TABLE public.farcaster_profiles REPLICA IDENTITY FULL;
