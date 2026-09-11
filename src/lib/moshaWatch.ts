/**
 * What the person just did, so Mo$ha's next question follows on from it.
 *
 * An artist asked Mo$ha to help change their world, went to the page, and
 * then every question he asked was the same generic one, because he had no
 * idea what they had already done. This is the short memory that fixes that:
 * the builder writes a plain line here each time something is saved ("put a
 * picture on the street The Gallery"), and whichever Mo$ha is talking to them
 * next (the chat, or the card riding along on the page) is handed the last
 * half hour of it.
 *
 * It lives in this tab only (sessionStorage) and never leaves the phone except
 * as part of a question the person is asking Mo$ha.
 */

export interface Doing {
  at: number;
  key: string;
  text: string;
}

const DOINGS_KEY = 'songchainn:mosha-doings';
const WINDOW_MS = 30 * 60 * 1000;
const MAX = 12;

function load(): Doing[] {
  try {
    const raw = sessionStorage.getItem(DOINGS_KEY);
    const list = raw ? (JSON.parse(raw) as Doing[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

let doings: Doing[] = typeof window !== 'undefined' ? load() : [];
const listeners = new Set<(d: Doing) => void>();

/**
 * Note one thing done. The same key again replaces the last line rather than
 * adding one, so typing a street name is one thing done, not forty.
 */
export function noteDid(key: string, text: string): void {
  const d: Doing = { at: Date.now(), key, text };
  const last = doings[doings.length - 1];
  doings = last && last.key === key ? [...doings.slice(0, -1), d] : [...doings, d].slice(-MAX);
  try {
    sessionStorage.setItem(DOINGS_KEY, JSON.stringify(doings));
  } catch {
    /* private browsing: it still works for as long as the page is open */
  }
  listeners.forEach((fn) => fn(d));
}

/** The last half hour of it, oldest first, as plain lines. */
export function recentDoings(): string[] {
  const cutoff = Date.now() - WINDOW_MS;
  return doings.filter((d) => d.at >= cutoff).map((d) => d.text);
}

/** Hear about each thing as it is done. Returns the way to stop listening. */
export function onDid(fn: (d: Doing) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/* Where they like to change their world: asked every time, but the one they
   picked last time is offered first. */
const WHERE_KEY = 'songchainn:mosha-edit-where';
export type EditWhere = 'chat' | 'page';

export function lastEditWhere(): EditWhere | null {
  try {
    const v = localStorage.getItem(WHERE_KEY);
    return v === 'chat' || v === 'page' ? v : null;
  } catch {
    return null;
  }
}

export function rememberEditWhere(where: EditWhere): void {
  try {
    localStorage.setItem(WHERE_KEY, where);
  } catch {
    /* it only costs the order of two buttons */
  }
}

/* Mo$ha riding along on the builder, for the world they asked to be taken to,
   until they tell him to stop or close the tab. */
const GUIDE_KEY = 'songchainn:mosha-guiding';

export function startGuiding(worldId: string): void {
  try {
    sessionStorage.setItem(GUIDE_KEY, worldId);
  } catch {
    /* the card still shows for this visit */
  }
}

export function stopGuiding(): void {
  try {
    sessionStorage.removeItem(GUIDE_KEY);
  } catch {
    /* nothing to undo */
  }
}

export function guidingWorld(): string | null {
  try {
    return sessionStorage.getItem(GUIDE_KEY);
  } catch {
    return null;
  }
}
