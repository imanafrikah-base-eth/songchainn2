import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { withHdEmoji } from '@/components/room/HdEmoji';
import type { MentionLink } from '@/lib/mentions';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Words from the feed with every "@name" that was picked from the list turned
 * into a link to that person, and emoji drawn in HD. A name typed by hand that
 * was never picked stays plain text, because it points at nobody for sure.
 */
export function MentionText({
  text,
  mentions,
  className,
  emojiSize = 18,
}: {
  text: string;
  mentions?: MentionLink[];
  className?: string;
  emojiSize?: number;
}) {
  if (!text) return null;
  const names = [...new Map((mentions ?? []).map((m) => [m.name, m])).values()].sort((a, b) => b.name.length - a.name.length);

  if (!names.length) return <span className={className}>{withHdEmoji(text, emojiSize, 'mt')}</span>;

  const re = new RegExp(`@(${names.map((m) => escapeRe(m.name)).join('|')})`, 'g');
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > last) out.push(...withHdEmoji(text.slice(last, match.index), emojiSize, `mt${i}`));
    const name = match[1];
    const link = names.find((n) => n.name === name);
    if (link) {
      out.push(
        <Link
          key={`mention-${i}`}
          to={link.href}
          onClick={(e) => e.stopPropagation()}
          className="font-semibold text-primary hover:underline"
        >
          @{link.name}
        </Link>,
      );
    }
    last = match.index + match[0].length;
    i += 1;
  }
  if (last < text.length) out.push(...withHdEmoji(text.slice(last), emojiSize, `mt${i}`));
  return <span className={className}>{out}</span>;
}
