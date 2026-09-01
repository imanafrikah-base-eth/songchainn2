import { useEffect, useState } from 'react';
import { KeyRound, Music } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { DraftStreet } from '@/worlds/builder/useWorldBuilder';

/**
 * The key on one street, set by the artist and changeable whenever they like.
 *
 * A world used to have exactly one gate covering the whole place, chosen once.
 * What an artist actually wants is per door, and to be able to move it: this
 * street is open to anyone, that one opens to whoever holds this record, and
 * next month it opens to a different record entirely.
 *
 * Leaving it on "same as the world" is the old behaviour, so an artist who
 * never touches this loses nothing.
 */

interface OwnSong {
  id: string;
  title: string;
}

export function StreetKey({
  street, onSave,
}: {
  street: DraftStreet;
  onSave: (patch: Partial<DraftStreet>) => void;
}) {
  const [songs, setSongs] = useState<OwnSong[]>([]);
  const [loading, setLoading] = useState(false);

  /* Only songs this artist actually owns can be a key to their own door. */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data: session } = await supabase.auth.getUser();
      const uid = session?.user?.id;
      if (!uid) {
        if (!cancelled) { setSongs([]); setLoading(false); }
        return;
      }
      const { data } = await supabase
        .from('songs')
        .select('id, title')
        .eq('owner_id', uid)
        .order('title');
      if (cancelled) return;
      setSongs((data ?? []).map((s) => ({ id: String(s.id), title: s.title || 'Untitled' })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const kind = street.key_kind ?? 'inherit';

  const setKind = (next: string) => {
    if (next === 'inherit') {
      onSave({ key_kind: null, key_song_id: null, key_threshold: null });
      return;
    }
    if (next === 'open') {
      onSave({ key_kind: 'open', key_song_id: null, key_threshold: null });
      return;
    }
    // An artist with nothing uploaded must not be able to pick this. It used to
    // write key_kind:'song' with a null song, which the loader ignores, so the
    // select said the door was locked and the door was not. The screen and the
    // saved state have to agree.
    if (songs.length === 0) return;
    onSave({
      key_kind: 'song',
      key_song_id: street.key_song_id ?? songs[0]?.id ?? null,
      key_threshold: street.key_threshold ?? '1',
    });
  };

  const selectCls =
    'h-9 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground';

  return (
    <div className="mt-2.5 rounded-lg border border-border bg-background/40 p-2.5">
      <div className="mb-2 flex items-center gap-1.5">
        <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Key to this street
        </span>
      </div>

      <select className={selectCls} value={kind} onChange={(e) => setKind(e.target.value)}>
        <option value="inherit">Same as the rest of the world</option>
        <option value="open">Open to anyone</option>
        <option value="song" disabled={songs.length === 0}>
          Hold one of my songs{songs.length === 0 ? ' (upload one first)' : ''}
        </option>
      </select>

      {kind === 'song' && (
        <div className="mt-2 space-y-2">
          {loading ? (
            <p className="text-xs text-muted-foreground">Finding your songs...</p>
          ) : songs.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              You have no songs on SONGCHAINN yet, so there is nothing to lock this with. Upload one
              in the Studio and it will show up here.
            </p>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                <Music className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <select
                  className={selectCls}
                  value={street.key_song_id ?? ''}
                  onChange={(e) => onSave({ key_song_id: e.target.value })}
                >
                  {songs.map((s) => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="shrink-0">Copies needed</span>
                <input
                  type="number"
                  min={1}
                  className="h-9 w-20 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
                  value={street.key_threshold ?? '1'}
                  onChange={(e) => onSave({ key_threshold: e.target.value || '1' })}
                />
              </label>
              <p className="text-[11px] text-muted-foreground">
                Anyone holding this much of that song walks straight in. Change the song or the
                number whenever you want and the door changes with it.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
