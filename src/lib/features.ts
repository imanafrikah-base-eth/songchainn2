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
export const WORLDS_ENABLED = true;

/**
 * The Create World builder and the viewer for worlds built with it.
 *
 * Separate from WORLDS_ENABLED on purpose. That flag holds World #001 shut
 * until its artist is ready to open it; this one lets other artists build and
 * walk their own worlds in the meantime. Turning this on must never turn that
 * one on.
 */
export const WORLD_BUILDER_ENABLED = true;

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

/**
 * Which ways in are actually offered on the auth screen.
 *
 * A sign-in button that cannot work is worse than no button: the person came
 * here to join, hit a wall, and left. Every one of these was on screen and
 * broken, which is why 167 of 167 accounts to date were created with email and
 * password, and nothing else.
 *
 * Checked against the live project's /auth/v1/settings on 22 Aug 2026:
 *
 *   google    listed as enabled but the authorize endpoint answers
 *             "Unsupported provider: missing OAuth secret", so it failed for
 *             every user, every time. To switch it on: create an OAuth client
 *             in Google Cloud, put the client ID and SECRET into Supabase
 *             (Authentication > Providers > Google), confirm
 *             /auth/v1/authorize?provider=google redirects to accounts.google.com,
 *             then flip this to true.
 *   facebook  provider is not enabled on the project at all.
 *   phone     disabled on the project, and there is no SMS provider configured.
 *   emailLink magic links need working SMTP; the handler was already hardcoded
 *             to refuse, so it only ever produced an error toast.
 *
 * Email and password is unaffected and stays the primary path. It works, and
 * mailer_autoconfirm is on, so a new account is usable immediately with no
 * confirmation email standing in the way.
 */
export const AUTH_PROVIDERS = {
  google: false,
  facebook: false,
  phone: false,
  emailLink: false,
} as const;
