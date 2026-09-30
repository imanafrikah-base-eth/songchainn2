import { useCallback, useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';

interface PauseRow {
  paused_at: string;
  resume_at: string | null;
}

type Length = '1m' | '3m' | 'open';

const LENGTHS: Array<{ value: Length; label: string }> = [
  { value: '1m', label: 'A month' },
  { value: '3m', label: 'Three months' },
  { value: 'open', label: 'Until I say' },
];

function dayLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * A break from the app without leaving it. The artist's records, pictures and
 * clips and world go quiet together and come back exactly as they were, on
 * the day they chose or when they say so. Nothing is deleted. Asked for by
 * N3M3SIS on 21 Sep 2026: "go dark", a three month break, "I don't want to
 * delete".
 */
export function TakeABreak() {
  const { user, isArtist } = useAuth();
  const queryClient = useQueryClient();
  const [pause, setPause] = useState<PauseRow | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [length, setLength] = useState<Length>('3m');

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('artist_pauses' as never)
      .select('paused_at, resume_at')
      .eq('user_id', user.id)
      .maybeSingle();
    setPause((data as PauseRow | null) ?? null);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!user || !isArtist) return null;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['published-catalog'] });
    void queryClient.invalidateQueries({ queryKey: ['paused-artists'] });
  };

  const start = async () => {
    setBusy(true);
    try {
      const days = length === '1m' ? 30 : length === '3m' ? 90 : null;
      const until = days ? new Date(Date.now() + days * 86_400_000).toISOString() : null;
      const { data, error } = await supabase.rpc('pause_my_music' as never, { p_until: until } as never);
      if (error) throw error;
      const r = (data ?? {}) as { songs?: number; media?: number; worlds?: number; already?: boolean };
      const worlds = r.worlds ?? 0;
      toast.success('You are on a break', {
        description: `${r.songs ?? 0} records, ${r.media ?? 0} pictures and clips and ${worlds} ${worlds === 1 ? 'world' : 'worlds'} are out of sight until you are back.`,
      });
      await load();
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That did not go through.');
    } finally {
      setBusy(false);
    }
  };

  const comeBack = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc('resume_my_music' as never);
      if (error) throw error;
      toast.success('Welcome back', { description: 'Everything is back where it was.' });
      await load();
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That did not go through.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <p className="text-sm font-medium text-foreground flex items-center gap-2">
        {pause ? <Sun className="w-4 h-4 text-primary" /> : <Moon className="w-4 h-4 text-primary" />}
        {pause ? 'You are on a break' : 'Take a break'}
      </p>
      {pause ? (
        <>
          <p className="mt-1 text-xs text-muted-foreground">
            Your records, pictures and clips and world are out of sight since {dayLabel(pause.paused_at)}.
            {pause.resume_at ? ` They come back on their own on ${dayLabel(pause.resume_at)}.` : ' They stay away until you say.'}
          </p>
          <Button variant="outline" className="mt-3 min-h-11 rounded-full" disabled={busy} onClick={() => void comeBack()}>
            I am back
          </Button>
        </>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted-foreground">
            Everything you have out goes quiet, your records, your pictures and clips, your world. Nothing is deleted, and it all comes back as it was.
          </p>
          <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="How long">
            {LENGTHS.map((l) => (
              <button
                key={l.value}
                type="button"
                role="radio"
                aria-checked={length === l.value}
                onClick={() => setLength(l.value)}
                className={`min-h-10 rounded-full border px-4 text-xs font-semibold transition-colors ${
                  length === l.value ? 'border-primary bg-primary/15 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <Button variant="outline" className="mt-3 min-h-11 rounded-full" disabled={busy || pause === undefined} onClick={() => void start()}>
            Go quiet
          </Button>
        </>
      )}
    </div>
  );
}
