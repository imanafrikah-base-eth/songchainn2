/**
 * Every time label the inbox prints, in one place so the list, the thread and
 * the day separators never disagree about what "yesterday" means.
 */

const DAY_MS = 86_400_000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Short stamp for a conversation row: now, 2m, 3h, Mon, 12 Sep, 12 Sep 2025. */
export function listTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const t = d.getTime();
  if (Number.isNaN(t)) return '';
  const now = new Date();
  const secs = Math.floor((now.getTime() - t) / 1000);
  if (secs < 60) return 'now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / DAY_MS);
  if (dayDiff === 0) return `${Math.floor(secs / 3600)}h`;
  if (dayDiff < 7) return d.toLocaleDateString('en-GB', { weekday: 'short' });
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Label for the separator between days: Today, Yesterday, Monday, 12 September. */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / DAY_MS);
  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff > 1 && dayDiff < 7) return d.toLocaleDateString('en-GB', { weekday: 'long' });
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  }
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Clock time under a bubble: 14:05. */
export function clockTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Full stamp for a tooltip or a message menu. */
export function fullTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${dayLabel(iso)}, ${clockTime(iso)}`;
}

export function sameDay(a: string, b: string): boolean {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}
