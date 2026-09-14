import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDayOneEarned, type DayOne } from '@/lib/dayOnes';
import { DayOneCard } from '@/components/dayones/DayOneCard';

/**
 * The one moment worth interrupting the music for: you just got there first.
 *
 * A like on a song you really listened to earns a Day One, and the card slides
 * in with your number. Nothing else pops up while music plays.
 */
export function DayOneMoment() {
  const queryClient = useQueryClient();
  const [receipt, setReceipt] = useState<DayOne | null>(null);
  const [artistNumber, setArtistNumber] = useState<number | null>(null);
  const timer = useRef<number | null>(null);
  const pending = useRef<{ song?: string; artist?: number }>({});

  const close = () => {
    setReceipt(null);
    setArtistNumber(null);
    if (timer.current) window.clearTimeout(timer.current);
  };

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  useDayOneEarned((row) => {
    if (row.kind === 'artist') pending.current.artist = row.fan_number;
    if (row.kind === 'song') pending.current.song = row.id;
    // The song and the artist receipt land together; wait a beat and show one card.
    window.setTimeout(async () => {
      const { song, artist } = pending.current;
      pending.current = {};
      if (!song && artist == null) return;
      const { data } = await supabase.rpc('my_day_ones' as never);
      const list = (data ?? []) as unknown as DayOne[];
      void queryClient.invalidateQueries({ queryKey: ['day-ones'] });
      const shown = song ? list.find((d) => d.id === song) : list.find((d) => d.kind === 'artist' && d.fan_number === artist);
      if (!shown) return;
      setReceipt(shown);
      setArtistNumber(song && artist != null ? artist : null);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setReceipt(null), 12000);
    }, 700);
  });

  return (
    <AnimatePresence>
      {receipt && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          className="fixed bottom-24 right-3 z-[80] w-[min(calc(100vw-1.5rem),20rem)] rounded-2xl border border-border bg-background p-3 shadow-2xl sm:right-5 md:bottom-6"
          role="status"
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                You are Day One #{receipt.fan_number}
              </p>
              <p className="text-xs text-muted-foreground">
                {receipt.kind === 'song'
                  ? `for ${receipt.song_title ?? 'this record'}${artistNumber ? `, and #${artistNumber} for ${receipt.artist_name ?? 'the artist'}` : ''}. It is yours for good.`
                  : `for ${receipt.artist_name ?? 'this artist'}. It is yours for good.`}
              </p>
            </div>
            <button type="button" onClick={close} aria-label="Close" className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-end gap-3">
            <DayOneCard receipt={receipt} size="sm" />
            <div className="flex min-w-0 flex-1 flex-col gap-2 pb-1">
              <Link
                to="/day-ones"
                onClick={close}
                className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground"
              >
                See your cards
              </Link>
              <p className="text-[11px] leading-snug text-muted-foreground">Share it, or record it on Base from there.</p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default DayOneMoment;
