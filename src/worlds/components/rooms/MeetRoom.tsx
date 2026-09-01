// The Parlour: asking to meet the artist.
//
// Ask first, pay after. The request costs nothing to make and the world never
// touches anybody's tokens; if the artist accepts, payment happens wallet to
// wallet and the fee quoted here is the fee that stands. That ordering is the
// whole design, and it is why this room can exist without a treasury.
//
// The price shown is the price for THIS visitor, discounted by how much of the
// key they hold. Someone one tier up sees what holding more would have saved
// them, because that is the honest argument for holding, and it beats any
// amount of copy about belonging.

import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, Check, Loader2, Ticket, TrendingUp } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { WorldConfig, WorldRings } from '../../types';
import {
  MEETING_KINDS,
  MEETING_STATUS_COPY,
  quoteFor,
  nextTierSaving,
  type MeetingKind,
  type MeetingKindDef,
  type MeetingStatus,
} from '../../meetings';

interface OpenRequest {
  id: string;
  kind: MeetingKind;
  status: MeetingStatus;
  fee_tokens: string;
  created_at: string;
}

export function MeetRoom({ world, rings }: { world: WorldConfig; rings: WorldRings }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [chosen, setChosen] = useState<MeetingKindDef>(MEETING_KINDS[0]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [existing, setExisting] = useState<OpenRequest | null>(null);
  const [loaded, setLoaded] = useState(false);

  // A person only gets one open request per world, enforced by a unique index
  // in the database. Show them the one they already have rather than letting
  // them write a second and meet an error.
  useEffect(() => {
    let active = true;
    void (async () => {
      if (!isSupabaseConfigured || !user?.id) {
        if (active) setLoaded(true);
        return;
      }
      try {
        const { data } = await supabase
          .from('world_meeting_requests')
          // fee_tokens is numeric(38,0). PostgREST serialises numeric as a JSON
          // number, and anything past 2^53 comes back mangled: a 38 digit value
          // reads as 1.2345678901234568e+37. Casting to text on the way out keeps
          // the agreed amount exact, which is the entire point of freezing it.
          .select('id, kind, status, fee_tokens::text, created_at')
          .eq('world_slug', world.slug)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1);
        if (active) setExisting((data?.[0] as OpenRequest | undefined) ?? null);
      } catch {
        // A failed read just means we show the form. Worst case the database
        // rejects a duplicate and we say so then.
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [user?.id, world.slug]);

  const quote = quoteFor(chosen, rings);
  const upgrade = nextTierSaving(chosen, rings);

  const submit = useCallback(async () => {
    if (!user?.id) {
      toast({
        title: 'Sign in first',
        description: 'A booking needs a name attached to it so he can reply to you.',
      });
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.from('world_meeting_requests').insert({
        world_slug: world.slug,
        user_id: user.id,
        kind: chosen.id,
        minutes: chosen.minutes,
        fee_tokens: String(quote.fee),
        tier: quote.tier,
        message: message.trim() || null,
      });
      if (error) {
        // 23505 is the one-open-request-per-person index doing its job.
        const duplicate = error.code === '23505';
        toast({
          title: duplicate ? 'You already have a request open' : 'That did not send',
          description: duplicate
            ? 'Wait for a reply on the one you have, or withdraw it first.'
            : 'Something went wrong on the way. Try again in a moment.',
          variant: 'destructive',
        });
        return;
      }
      setExisting({
        id: 'new',
        kind: chosen.id,
        status: 'pending',
        fee_tokens: String(quote.fee),
        created_at: new Date().toISOString(),
      });
      toast({
        title: 'Asked',
        description: `Your request is with ${world.artistName}. Nothing is owed unless he says yes.`,
      });
      setMessage('');
    } finally {
      setSending(false);
    }
  }, [chosen, message, quote, toast, user?.id, world.artistName, world.slug]);

  if (loaded && existing && existing.status !== 'declined') {
    return (
      <div className="rounded-2xl border border-rose-400/25 bg-rose-400/[0.06] p-6">
        <div className="mb-2 flex items-center gap-2 text-rose-200">
          <CalendarCheck className="h-5 w-5" />
          <h3 className="font-heading text-lg font-bold">
            {MEETING_STATUS_COPY[existing.status]}
          </h3>
        </div>
        <p className="text-sm leading-relaxed text-white/65">
          You asked for{' '}
          <span className="text-white">
            {MEETING_KINDS.find((k) => k.id === existing.kind)?.name ?? existing.kind}
          </span>{' '}
          at {Number(existing.fee_tokens).toLocaleString()} {world.tokenSymbol}. That price is held
          for you. Nothing is owed unless {world.artistName} accepts.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="mb-2 flex items-center gap-2 text-white">
          <Ticket className="h-5 w-5 text-rose-300" />
          <h3 className="font-heading text-lg font-bold">Ask him in person</h3>
        </div>
        <p className="text-sm leading-relaxed text-white/60">
          Pick what you are asking for. You pay nothing to ask, and nothing at all unless{' '}
          {world.artistName} says yes. Your price is set by how much of the key you are holding.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {MEETING_KINDS.map((kind) => {
          const q = quoteFor(kind, rings);
          const active = kind.id === chosen.id;
          return (
            <button
              key={kind.id}
              type="button"
              onClick={() => setChosen(kind)}
              aria-pressed={active}
              className={`rounded-2xl border p-5 text-left transition ${
                active
                  ? 'border-rose-400/60 bg-rose-400/[0.08]'
                  : 'border-white/10 bg-white/[0.02] hover:border-white/25'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-heading text-base font-bold text-white">{kind.name}</h4>
                {active && <Check className="h-4 w-4 shrink-0 text-rose-300" />}
              </div>
              <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-white/40">
                {kind.minutes} minutes
              </p>
              <p className="mt-2 text-sm leading-relaxed text-white/60">{kind.blurb}</p>
              <p className="mt-3 font-mono text-sm font-bold tabular-nums text-rose-200">
                {q.fee.toLocaleString()} {world.tokenSymbol}
              </p>
              {q.discountPct > 0 && (
                <p className="mt-0.5 text-[11px] text-emerald-300/80">
                  {q.discountPct}% off as {q.tierLabel}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {upgrade && (
        <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-xs text-white/55">
          <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
          <p>
            Holding {upgrade.holding.toLocaleString()} {world.tokenSymbol} makes you {upgrade.label},
            and this would cost {upgrade.fee.toLocaleString()} instead.
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <label htmlFor="meet-message" className="mb-2 block text-sm font-medium text-white">
          What do you want to say to him?
        </label>
        <textarea
          id="meet-message"
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 2000))}
          rows={4}
          placeholder="Tell him who you are and what this is for."
          className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-rose-400/60 focus:outline-none focus:ring-1 focus:ring-rose-400/40"
        />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-sm tabular-nums text-white/70">
            {quote.fee.toLocaleString()} {world.tokenSymbol}
            {quote.discountPct > 0 && (
              <span className="ml-2 text-xs text-white/35 line-through">
                {quote.baseFee.toLocaleString()}
              </span>
            )}
          </p>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={sending}
            className="inline-flex items-center gap-2 rounded-full bg-rose-400 px-5 py-2.5 text-sm font-bold text-black transition hover:bg-rose-300 disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}
            Ask to meet
          </button>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-white/40">
          Asking is free. If he accepts, you pay him directly from your own wallet at the price
          above. This world never holds your tokens at any point.
        </p>
      </div>
    </div>
  );
}
