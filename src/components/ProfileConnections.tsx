import { useEffect, useState } from 'react';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';

/**
 * Farcaster and Zora, connected the way a wallet is: one row each, one tap.
 *
 * Neither is a wallet, so there is nothing to sign. A person types the name
 * they use there, it is checked for shape, and it goes on their profile as
 * a chip next to their other links. Sits under the wallet list in the
 * wallet sheet and in profile settings, and takes up two rows, no more.
 */

type Kind = 'farcaster' | 'zora';

const ROWS: Array<{ kind: Kind; label: string; short: string; hint: string; column: 'farcaster_username' | 'zora_handle'; home: (h: string) => string }> = [
  { kind: 'farcaster', label: 'Farcaster', short: 'FC', hint: 'your Farcaster name', column: 'farcaster_username', home: (h) => `https://warpcast.com/${h}` },
  { kind: 'zora', label: 'Zora', short: 'ZO', hint: 'your Zora handle', column: 'zora_handle', home: (h) => `https://zora.co/@${h}` },
];

/**
 * Why this is a name and not a Connect button.
 *
 * People kept trying to "connect Zora" and finding nothing, because a Zora
 * account is not a browser wallet: it lives on zora.co and signs there. The
 * same is true of Farcaster. So here they are what they actually are, names
 * that go on your page, and the wallet that pays is a separate thing.
 */
const WHY = 'Zora and Farcaster are profiles, not wallets. Putting your name here shows them on your page. To buy or hold anything, connect the wallet on this device: usually the Base app or MetaMask.';

function clean(raw: string): string {
  return raw.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?(warpcast\.com|farcaster\.xyz|zora\.co)\/@?/i, '').replace(/[/?#].*$/, '').slice(0, 64);
}

export function ProfileConnections({ compact = false }: { compact?: boolean }) {
  const { user, audienceProfile } = useAuth();
  const [values, setValues] = useState<Record<Kind, string>>({ farcaster: '', zora: '' });
  const [editing, setEditing] = useState<Kind | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<Kind | null>(null);

  useEffect(() => {
    const p = audienceProfile as unknown as Record<string, unknown> | null | undefined;
    setValues({
      farcaster: typeof p?.farcaster_username === 'string' ? p.farcaster_username : '',
      zora: typeof p?.zora_handle === 'string' ? p.zora_handle : '',
    });
  }, [audienceProfile]);

  if (!user) return null;

  const save = async (row: (typeof ROWS)[number], next: string) => {
    setBusy(row.kind);
    try {
      const value = clean(next);
      if (value && !/^[a-z0-9_.-]{1,64}$/i.test(value)) throw new Error(`That does not look like ${row.hint}.`);
      const { error } = await supabase
        .from('audience_profiles')
        .update({ [row.column]: value || null } as never)
        .eq('user_id', user.id);
      if (error) throw error;
      setValues((v) => ({ ...v, [row.kind]: value }));
      setEditing(null);
      toast(value ? `${row.label} connected` : `${row.label} removed`);
    } catch (e) {
      toast.error((e as Error)?.message || 'That did not save.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={compact ? 'mt-4' : ''}>
      <p className="mb-1 text-xs text-muted-foreground text-center">Connect a profile</p>
      <p className="mb-2 text-center text-[11px] leading-relaxed text-muted-foreground/80">{WHY}</p>
      <div className="space-y-2">
        {ROWS.map((row) => {
          const value = values[row.kind];
          const isEditing = editing === row.kind;
          return (
            <div key={row.kind} className="flex min-h-14 items-center gap-3 rounded-2xl glass border border-border/60 px-4 py-2 text-foreground">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-[11px] font-bold text-primary">{row.short}</span>
              {isEditing ? (
                <form
                  className="flex min-w-0 flex-1 items-center gap-2"
                  onSubmit={(e) => { e.preventDefault(); void save(row, draft); }}
                >
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={row.kind === 'zora' ? 'your Zora handle, or paste your zora.co link' : row.hint}
                    maxLength={80}
                    className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
                  />
                  <button type="submit" disabled={busy === row.kind} aria-label={`Save ${row.label}`} className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-60">
                    {busy === row.kind ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </button>
                  <button type="button" onClick={() => setEditing(null)} aria-label="Cancel" className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </form>
              ) : (
                <>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-semibold">{row.label}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {value ? (
                        <a href={row.home(value)} target="_blank" rel="noopener noreferrer" className="hover:underline">@{value}</a>
                      ) : 'Not connected'}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => { setDraft(value); setEditing(row.kind); }}
                    className={`flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full px-4 text-xs font-semibold ${value ? 'border border-border text-foreground' : 'bg-primary text-primary-foreground'}`}
                  >
                    {value ? <><Pencil className="h-3.5 w-3.5" /> Change</> : 'Connect'}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ProfileConnections;
