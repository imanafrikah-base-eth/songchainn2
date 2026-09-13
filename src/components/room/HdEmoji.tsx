import { useState, type ReactNode } from 'react';

/**
 * Emoji drawn the same on every phone: Apple's artwork at 64 px from the
 * emoji-datasource-apple package on jsDelivr, lazy loaded, a few KB each.
 * The phone's own emoji font differed from device to device and looked flat
 * on most Android phones. If the picture cannot load (offline, a brand new
 * emoji), it tries the code without the variation selector, then falls back to
 * the phone's own glyph, so nothing ever shows as a broken image.
 */

const BASE = 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64/';

export function emojiCode(emoji: string): string {
  return Array.from(emoji)
    .map((c) => (c.codePointAt(0) ?? 0).toString(16))
    .join('-');
}

export function HdEmoji({ emoji, size = 20, className = '' }: { emoji: string; size?: number; className?: string }) {
  const full = emojiCode(emoji);
  const bare = full
    .split('-')
    .filter((c) => c !== 'fe0f')
    .join('-');
  // 0: exact code, 1: without the variation selector, 2: the phone's own glyph.
  const [step, setStep] = useState(0);

  if (!full || step >= 2) {
    return (
      <span role="img" aria-label={emoji} className={className} style={{ fontSize: size * 0.9, lineHeight: 1 }}>
        {emoji}
      </span>
    );
  }

  return (
    <img
      src={`${BASE}${step === 0 ? full : bare}.png`}
      alt={emoji}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={`inline-block select-none align-[-0.2em] ${className}`}
      style={{ width: size, height: size }}
      onError={() => setStep((s) => (s === 0 && bare !== full ? 1 : 2))}
    />
  );
}

/** One emoji: a pictograph, its optional skin tone or variation selector, and any ZWJ sequence after it. */
const EMOJI_RE = /(\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?(?:‍\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?)*)/u;
const EMOJI_SPLIT = new RegExp(EMOJI_RE.source, 'gu');

/** True when the text is nothing but one to three emoji, which then show big, like Telegram. */
export function isEmojiOnly(text: string): boolean {
  const trimmed = text.replace(/\s+/g, '');
  if (!trimmed) return false;
  const parts = trimmed.split(EMOJI_SPLIT).filter(Boolean);
  return parts.length > 0 && parts.length <= 3 && parts.every((p) => EMOJI_RE.test(p));
}

/** Plain text with every emoji in it swapped for the HD picture. */
export function withHdEmoji(text: string, size = 20, keyPrefix = 'e'): ReactNode[] {
  if (!text) return [];
  return text
    .split(EMOJI_SPLIT)
    .filter((part) => part !== '')
    .map((part, i) =>
      EMOJI_RE.test(part) && /[^#-9©®]/.test(part) ? (
        <HdEmoji key={`${keyPrefix}-${i}`} emoji={part} size={size} />
      ) : (
        part
      ),
    );
}
