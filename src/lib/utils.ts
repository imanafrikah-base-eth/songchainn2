import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * A big number, written the way a person would say it out loud.
 *
 * Every count in this app went through toLocaleString, so a well played record
 * read "1,204,338 streams" on a song card. That is a wall of digits in a space
 * meant to be glanced at, and it makes the number the loudest thing on the card
 * instead of the song. Nobody needs the last three digits of a play count while
 * they are deciding what to listen to.
 *
 * Under a thousand stays exact, because 847 is already short and rounding it to
 * "0.8K" would be uglier AND less true. Above that it rounds to one decimal and
 * drops a pointless trailing zero, so 2,000 reads "2K" and not "2.0K". Past a
 * hundred of any unit the decimal stops earning its place, so 148,000 is "148K".
 *
 * The exact figure is never thrown away: pair this with exactCount() in a title
 * attribute. An artist looking at their own numbers deserves the real one, and
 * anybody who wants it can hover.
 */
const COUNT_SUFFIXES = ['', 'K', 'M', 'B', 'T'] as const;

export function compactCount(value: number | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n < 1_000) return String(Math.floor(n));

  let tier = 0;
  let scaled = n;
  while (scaled >= 1_000 && tier < COUNT_SUFFIXES.length - 1) {
    scaled /= 1_000;
    tier += 1;
  }

  // One decimal while it earns its place, none past a hundred: 1.2K, but 148K.
  let shown = scaled >= 100 ? Math.round(scaled) : Math.round(scaled * 10) / 10;

  // ROUNDING CAN PUSH A NUMBER INTO THE NEXT UNIT, and picking the unit before
  // rounding gets that wrong. 999,999 scales to 999.999K, which rounds to 1000
  // and would print "1000K" instead of "1M". So the tier is corrected after the
  // rounding, not before it.
  if (shown >= 1_000 && tier < COUNT_SUFFIXES.length - 1) {
    shown = Math.round((shown / 1_000) * 10) / 10;
    tier += 1;
  }

  return `${shown}${COUNT_SUFFIXES[tier]}`;
}

/** The full number with separators, for a title attribute beside compactCount. */
export function exactCount(value: number | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '0';
  return Math.floor(n).toLocaleString();
}
