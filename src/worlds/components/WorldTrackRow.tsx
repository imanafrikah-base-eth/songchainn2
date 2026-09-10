// One playable track inside a room. Plays through the app's global player and
// links out to the song page for pulses, comments and collecting.

import { Link } from 'react-router-dom';
import { ArtistName } from '@/components/ArtistName';
import { Play, Pause } from 'lucide-react';
import type { Song } from '@/data/musicData';
import { usePlayerActions, useSafePlayerState } from '@/context/PlayerContext';
import { getSongSlugUrl } from '@/lib/slugRoutes';

export function WorldTrackRow({
  song,
  index,
  accentText = 'text-amber-300',
}: {
  song: Song;
  index?: number;
  accentText?: string;
}) {
  const { playSong, togglePlay } = usePlayerActions();
  const playerState = useSafePlayerState();
  const isCurrent = playerState?.currentSong?.id === song.id;
  const isPlaying = isCurrent && playerState?.isPlaying;

  const handlePlay = () => {
    if (isCurrent) togglePlay();
    else playSong(song);
  };

  return (
    <div className="group flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-2.5 transition hover:border-white/15 hover:bg-white/[0.06]">
      {typeof index === 'number' && (
        <span className={`w-6 text-center text-sm font-bold ${index < 3 ? accentText : 'text-white/40'}`}>
          {index + 1}
        </span>
      )}
      {song.coverImage ? (
        <img
          src={song.coverImage}
          alt=""
          loading="lazy"
          className="h-11 w-11 flex-shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="h-11 w-11 flex-shrink-0 rounded-lg bg-white/10" />
      )}
      <div className="min-w-0 flex-1">
        <Link
          to={getSongSlugUrl(song)}
          className={`block truncate text-sm font-semibold ${isCurrent ? accentText : 'text-white'} hover:underline`}
        >
          {song.title}
        </Link>
        <p className="truncate text-xs text-white/50"><ArtistName name={song.artist} artistId={song.artistId} size={11} /></p>
      </div>
      <button
        type="button"
        onClick={handlePlay}
        aria-label={isPlaying ? `Pause ${song.title}` : `Play ${song.title}`}
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
      </button>
    </div>
  );
}
