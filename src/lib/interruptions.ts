/**
 * Interruption budget.
 *
 * The app has ten separate things that can appear over the top of what someone
 * is doing: the Mo$ha agent, behaviour CTAs, the install banner, the update
 * banner, notification banners, the location prompt, the Phase Two notice, the
 * invite sheet, the claim-artist prompt and the offline indicator.
 *
 * Each one was individually reasonable and throttled. None of them knew the
 * others existed, so in a real session they stack, and the app feels like it is
 * pestering rather than playing. This is the arbiter they all go through.
 *
 * Rules, in order:
 *   1. Nothing interrupts during the opening seconds. Let people arrive.
 *   2. One at a time. Ever.
 *   3. A small budget per session for anything promotional.
 *   4. Per-surface cooldowns survive reloads.
 *   5. `critical` bypasses the budget but still queues behind rule 2, because
 *      two overlapping overlays is never the right answer.
 */

export type InterruptionPriority = 'critical' | 'useful' | 'promo';

/** Nothing may interrupt within this long of the app opening. */
const QUIET_START_MS = 20_000;
/** Minimum gap between any two interruptions. */
const MIN_GAP_MS = 1000 * 90;
/** How many non-critical interruptions a single session may spend. */
const SESSION_BUDGET = 2;
/** Default per-surface cooldown when a surface does not name its own. */
const DEFAULT_COOLDOWN_MS = 1000 * 60 * 60 * 6;

const SPENT_KEY = 'songchainn_interruptions_spent_v1';
const LAST_KEY = 'songchainn_interruptions_last_v1';
const COOLDOWN_PREFIX = 'songchainn_interruption_cd_';

const bootedAt = Date.now();

/** The surface currently on screen, if any. */
let holder: string | null = null;
const listeners = new Set<() => void>();

function readNumber(storage: Storage | null, key: string): number {
  try {
    return Number(storage?.getItem(key) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function writeNumber(storage: Storage | null, key: string, value: number) {
  try {
    storage?.setItem(key, String(value));
  } catch {
    /* private mode, restricted webview: budget just resets, never throws */
  }
}

function session(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function local(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function notify() {
  for (const l of listeners) l();
}

export function subscribeInterruptions(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export interface ClaimOptions {
  priority?: InterruptionPriority;
  /** Override the default per-surface cooldown. */
  cooldownMs?: number;
}

/**
 * Ask to show an interrupting surface. Returns true only if it may appear now.
 * The caller must call `release` when it is dismissed or auto-hides.
 */
export function claimInterruption(id: string, opts: ClaimOptions = {}): boolean {
  const { priority = 'promo', cooldownMs = DEFAULT_COOLDOWN_MS } = opts;
  const now = Date.now();

  // 2. one at a time, for every priority including critical
  if (holder && holder !== id) return false;
  if (holder === id) return true;

  // 1. let people arrive
  if (priority !== 'critical' && now - bootedAt < QUIET_START_MS) return false;

  // 4. per-surface cooldown
  const lastShown = readNumber(local(), COOLDOWN_PREFIX + id);
  if (priority !== 'critical' && lastShown && now - lastShown < cooldownMs) return false;

  if (priority !== 'critical') {
    // pacing between surfaces
    const last = readNumber(session(), LAST_KEY);
    if (last && now - last < MIN_GAP_MS) return false;

    // 3. session budget, promo only
    if (priority === 'promo') {
      const spent = readNumber(session(), SPENT_KEY);
      if (spent >= SESSION_BUDGET) return false;
      writeNumber(session(), SPENT_KEY, spent + 1);
    }
    writeNumber(session(), LAST_KEY, now);
  }

  writeNumber(local(), COOLDOWN_PREFIX + id, now);
  holder = id;
  notify();
  return true;
}

/** Hand the floor back. Safe to call when not holding it. */
export function releaseInterruption(id: string) {
  if (holder !== id) return;
  holder = null;
  notify();
}

/** Who, if anyone, currently owns the screen. */
export function currentInterruption(): string | null {
  return holder;
}

/** Escape hatch for QA: clears budgets and cooldowns. */
export function resetInterruptionBudget() {
  try {
    session()?.removeItem(SPENT_KEY);
    session()?.removeItem(LAST_KEY);
    const ls = local();
    if (ls) {
      for (let i = ls.length - 1; i >= 0; i--) {
        const k = ls.key(i);
        if (k?.startsWith(COOLDOWN_PREFIX)) ls.removeItem(k);
      }
    }
  } catch {
    /* nothing to reset */
  }
  holder = null;
  notify();
}
