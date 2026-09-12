/**
 * Is this a name a person chose, or something the system filled in for them?
 *
 * Sign-up used to copy the email's local part, or a synthetic wallet handle,
 * into display_name, so Community filled up with cards titled
 * "wallet-0x16f5..." and "someone603@gm...". A person only appears in public
 * people lists, and only gets past the name step, with a real name.
 *
 * Keep these rules in step with public.is_real_name() in
 * supabase/migrations/20260912001400_community_shows_only_real_names.sql.
 */

type NamedProfile = {
  display_name?: string | null;
  profile_name?: string | null;
} | null | undefined;

/** The name a profile actually shows: display_name first, then profile_name. */
export function effectiveName(profile: NamedProfile): string {
  const display = (profile?.display_name ?? '').trim();
  if (display) return display;
  return (profile?.profile_name ?? '').trim();
}

/**
 * Why a name is not usable, or null when it is fine. The message is shown
 * inline under the name field, so it is written for the person typing.
 */
export function realNameProblem(name: string | null | undefined, email?: string | null): string | null {
  const n = (name ?? '').trim();
  if (!n) return 'Add the name people know you by.';
  if (n.includes('@')) return 'That looks like an email address. Use your name instead.';
  if (/^wallet-0x/i.test(n) || /^0x[0-9a-f]{6,}/i.test(n)) {
    return 'That looks like a wallet address. Use your name instead.';
  }
  if (/^(fc|fb)-\d+$/i.test(n) || /^user \d+$/i.test(n)) return 'Add the name people know you by.';
  // Founding artists sign in with <artist>@artists.songchainn.xyz, so their
  // real artist name (T3RNNN) is their placeholder email's local part too.
  if (email && !/@artists\.songchainn\.xyz$/i.test(email.trim())) {
    const local = email.split('@')[0]?.trim() ?? '';
    // Only a local part that reads like an address (digits, dots, underscores)
    // counts. A plain word such as "nda" or "ben" is a name a person can choose.
    if (local && /[0-9._+-]/.test(local) && n.toLowerCase() === local.toLowerCase()) {
      return 'That is the start of your email address. Use your name instead.';
    }
  }
  return null;
}

export function hasRealName(name: string | null | undefined, email?: string | null): boolean {
  return realNameProblem(name, email) === null;
}

/** Convenience for profile rows: checks the name the profile actually shows. */
export function profileHasRealName(profile: NamedProfile, email?: string | null): boolean {
  return hasRealName(effectiveName(profile), email);
}
