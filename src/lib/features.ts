// Feature flags for surfaces that are built and working but deliberately not
// shown right now. Same pattern as VOICE_ENABLED in src/battlezone/config.ts:
// nothing is deleted, so flipping one constant brings the whole surface back
// exactly as it was.

/**
 * Artist Worlds (`/world/:slug`, the "Enter World" button on an artist page).
 *
 * Hidden until an artist token is actually live. Pre-launch every door reads
 * locked and the gate shows "the key is being cut", which is a dead end for
 * anyone who walks in. IMan Afrikah is World #001 and the whole framework is
 * built and deployed; it is waiting on the $IMAN launch, not on code.
 *
 * Turning this back on: set true. The world-gate edge function is the real
 * authority on access and is unaffected by this flag.
 */
export const WORLDS_ENABLED = false;

/**
 * Zabal Gamez Artist Track (the About page section, the Auth page section, the
 * Home card, and the one-time Mo$ha prompt about it).
 *
 * Hidden from the SONGCHAINN UI. The backend is untouched: the `zabal-gamez`
 * bucket, the `zabal_gamez_entries` table and the submit-zabal-entry and
 * track-zabal-download edge functions all still work, so existing entries are
 * safe and nothing needs re-deploying to restore it.
 */
export const ZABAL_GAMEZ_ENABLED = false;
