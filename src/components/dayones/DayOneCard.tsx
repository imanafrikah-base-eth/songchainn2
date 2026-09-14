import { forwardRef } from 'react';
import { BadgeCheck } from 'lucide-react';
import { thumb } from '@/lib/img';
import { cn } from '@/lib/utils';
import type { DayOne } from '@/lib/dayOnes';

/**
 * A Day One card: the thing people screenshot and post.
 *
 * Built like a ticket stub, not a badge. The record's own artwork carries the
 * colour, the number is the loudest thing on it, and everything else is small
 * and exact: what, who, when. A receipt recorded on Base carries the seal and
 * a short attestation id anybody can look up.
 */

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export const DayOneCard = forwardRef<HTMLDivElement, { receipt: DayOne; size?: 'sm' | 'md'; className?: string }>(
  function DayOneCard({ receipt, size = 'md', className }, ref) {
    const isSong = receipt.kind === 'song';
    const heading = isSong ? receipt.song_title ?? 'A record' : receipt.artist_name ?? 'An artist';
    const sub = isSong ? receipt.artist_name ?? '' : 'Artist';
    const small = size === 'sm';
    const onChain = Boolean(receipt.attestation_uid);

    return (
      <div
        ref={ref}
        className={cn(
          'relative isolate overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0c] text-white',
          small ? 'w-44' : 'w-full max-w-[20rem]',
          className,
        )}
        style={{ aspectRatio: '4 / 5.4' }}
      >
        {/* The artwork, top two thirds, fading into the stub. */}
        {receipt.cover_url ? (
          <img
            src={thumb(receipt.cover_url, small ? 192 : 384)}
            alt=""
            className="absolute inset-x-0 top-0 h-[64%] w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="absolute inset-x-0 top-0 h-[64%] bg-neutral-800" />
        )}
        <div className="absolute inset-x-0 top-0 h-[64%] bg-gradient-to-b from-black/35 via-transparent to-[#0b0b0c]" />

        {/* Header strip */}
        <div className={cn('relative flex items-center justify-between', small ? 'px-2.5 pt-2.5' : 'px-4 pt-4')}>
          <span className={cn('rounded-full bg-black/55 font-semibold uppercase tracking-[0.18em]', small ? 'px-2 py-0.5 text-[8px]' : 'px-2.5 py-1 text-[10px]')}>
            Day One
          </span>
          {onChain && (
            <span
              className={cn('inline-flex items-center gap-1 rounded-full bg-black/55 font-medium', small ? 'px-1.5 py-0.5 text-[8px]' : 'px-2 py-1 text-[10px]')}
              title="Recorded on Base"
            >
              <BadgeCheck className={small ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5'} aria-hidden="true" />
              On Base
            </span>
          )}
        </div>

        {/* The stub */}
        <div className={cn('absolute inset-x-0 bottom-0', small ? 'p-2.5' : 'p-4')}>
          <div className="flex items-end justify-between gap-2">
            <span className={cn('font-mono font-bold leading-none tabular-nums tracking-tight', small ? 'text-4xl' : 'text-6xl')}>
              #{receipt.fan_number}
            </span>
            {receipt.total_fans > receipt.fan_number && (
              <span className={cn('pb-1 text-white/55 tabular-nums', small ? 'text-[9px]' : 'text-xs')}>of {receipt.total_fans}</span>
            )}
          </div>
          {/* Perforation */}
          <div className={cn('border-t border-dashed border-white/20', small ? 'my-1.5' : 'my-3')} />
          <p className={cn('truncate font-semibold', small ? 'text-[11px]' : 'text-base')}>{heading}</p>
          <div className={cn('flex items-center justify-between gap-2 text-white/55', small ? 'text-[9px]' : 'text-xs')}>
            <span className="truncate">{sub}</span>
            <span className="shrink-0 tabular-nums">{fmtDate(receipt.earned_at)}</span>
          </div>
          {!small && (
            <p className="mt-2 truncate font-mono text-[9px] uppercase tracking-wider text-white/35">
              {onChain ? `EAS ${receipt.attestation_uid!.slice(0, 10)}…${receipt.attestation_uid!.slice(-6)}` : 'songchainn.xyz'}
            </p>
          )}
        </div>
      </div>
    );
  },
);

export default DayOneCard;
