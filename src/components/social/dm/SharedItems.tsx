import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ListMusic, Music, Pause, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { SONGS } from '@/data/musicData';
import { usePlayerActions, usePlayerState } from '@/context/PlayerContext';
import { ArtistName } from '@/components/ArtistName';
import { cn } from '@/lib/utils';

/**
 * What rides along inside a message: a song that arrives ready to play, or a
 * playlist that opens in one tap. Compact cards, the same on both sides.
 */

const CARD = 'flex w-[min(17rem,72vw)] items-center gap-3 rounded-2xl border border-border bg-card p-2 text-left';

export function SongInMessage({ songId }: { songId: string }) {
  const song = SONGS.find((s) => s.id === songId);
  const { currentSong, isPlaying } = usePlayerState();
  const { playSong, togglePlay } = usePlayerActions();

  if (!song) {
    return (
      <div className={cn(CARD, 'text-muted-foreground')}>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted">
          <Music size={18} aria-hidden="true" />
        </span>
        <span className="text-xs">That song is no longer here.</span>
      </div>
    );
  }

  const isThis = currentSong?.id === song.id;
  const playingThis = isThis && isPlaying;

  return (
    <div className={CARD}>
      {song.coverImage ? (
        <img src={song.coverImage} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-xl bg-muted object-cover" />
      ) : (
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted">
          <Music size={18} className="text-muted-foreground" aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{song.title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          <ArtistName name={song.artist} artistId={song.artistId} size={12} />
        </span>
      </span>
      <button
        type="button"
        onClick={() => (isThis ? togglePlay() : playSong(song))}
        aria-label={playingThis ? `Pause ${song.title}` : `Play ${song.title}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
      >
        {playingThis ? <Pause size={16} aria-hidden="true" /> : <Play size={16} className="ml-0.5" aria-hidden="true" />}
      </button>
    </div>
  );
}

export function PlaylistInMessage({ playlistId }: { playlistId: string }) {
  const { data: name, isLoading } = useQuery({
    queryKey: ['dm-playlist-name', playlistId],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from('playlists').select('id,name').eq('id', playlistId).maybeSingle();
      return (data?.name as string | undefined) ?? null;
    },
  });

  return (
    <Link
      to={`/playlist/${playlistId}`}
      className={cn(
        CARD,
        'transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted">
        <ListMusic size={18} className="text-muted-foreground" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">
          {isLoading ? 'Playlist' : name ?? 'A playlist'}
        </span>
        <span className="block truncate text-xs text-muted-foreground">Playlist, tap to open</span>
      </span>
    </Link>
  );
}
