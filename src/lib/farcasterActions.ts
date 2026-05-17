// Thin wrappers around @farcaster/miniapp-sdk actions so the rest of the app
// can call platform features without duplicating "are we in a miniapp" checks.
// All functions fall back to a sensible web behaviour when the SDK is unavailable.
import sdk from '@farcaster/miniapp-sdk';

let cachedInMiniApp: boolean | null = null;

export async function isInMiniApp(): Promise<boolean> {
  if (cachedInMiniApp !== null) return cachedInMiniApp;
  try {
    cachedInMiniApp = await sdk.isInMiniApp();
  } catch {
    cachedInMiniApp = false;
  }
  return cachedInMiniApp;
}

// Open an external URL. Uses sdk.actions.openUrl when inside a miniapp (so
// Warpcast / Base App route it through their native opener); falls back to
// window.open on regular web.
export async function fcOpenUrl(url: string): Promise<void> {
  if (!url) return;
  try {
    if (await isInMiniApp()) {
      await sdk.actions.openUrl(url);
      return;
    }
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[fc] openUrl fell back to window.open:', err);
  }
  try {
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch { /* noop */ }
}

// Open the Farcaster composer pre-filled with text + embed URLs.
// Returns true if the cast composer was opened.
export async function fcComposeCast(opts: { text: string; embeds?: string[]; channelKey?: string }): Promise<boolean> {
  try {
    if (!(await isInMiniApp())) return false;
    const composer = (sdk.actions as any)?.composeCast;
    if (typeof composer !== 'function') return false;
    await composer({
      text: opts.text,
      embeds: opts.embeds?.slice(0, 2),
      channelKey: opts.channelKey,
    });
    return true;
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[fc] composeCast failed:', err);
    return false;
  }
}

// Navigate to a Farcaster profile by fid inside the host client.
export async function fcViewProfile(fid: number): Promise<boolean> {
  try {
    if (!(await isInMiniApp())) return false;
    const viewProfile = (sdk.actions as any)?.viewProfile;
    if (typeof viewProfile !== 'function') return false;
    await viewProfile({ fid });
    return true;
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[fc] viewProfile failed:', err);
    return false;
  }
}

// Prompt the user to add this miniapp to their Warpcast / Base App home.
// Per Farcaster docs, hosts may also surface this automatically; we only
// call it on explicit user gesture.
export async function fcAddMiniApp(): Promise<boolean> {
  try {
    if (!(await isInMiniApp())) return false;
    const addMiniApp = (sdk.actions as any)?.addMiniApp;
    if (typeof addMiniApp !== 'function') return false;
    await addMiniApp();
    return true;
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[fc] addMiniApp failed:', err);
    return false;
  }
}
