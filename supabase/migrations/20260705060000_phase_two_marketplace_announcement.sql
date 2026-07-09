-- One-time broadcast notification announcing Phase Two: The Music Marketplace
-- to all users who had completed onboarding at launch time. Guarded with
-- NOT EXISTS so this migration is safe to re-run without double-notifying.

INSERT INTO public.notifications (user_id, type, title, message, metadata, is_read, created_at)
SELECT
  ap.user_id,
  'announcement',
  '🎉 Phase Two is Live: The Music Marketplace',
  'Phase One was Audience First. Now songs are real, tradeable coins on Base -- buy in to support an artist, or sell back for ETH anytime. Tap to explore.',
  '{"cta_path": "/marketplace", "phase": 2}'::jsonb,
  false,
  now()
FROM public.audience_profiles ap
WHERE ap.onboarding_completed = true
  AND NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = ap.user_id AND n.type = 'announcement' AND n.metadata->>'phase' = '2'
  );
