import { useMemo, useState } from 'react';
import { Music2, PauseCircle, PlayCircle, Shuffle, User2 } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { AudioPlayer } from '@/components/AudioPlayer';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { Button } from '@/components/ui/button';
import { usePlayerActions, usePlayerState } from '@/context/PlayerContext';
import { ARTISTS, CATALOGS, SONGS, Song } from '@/data/musicData';
import djShuffleBranding from '@/assets/Dj Suffle Branding.png';

type DjMode = 'artists' | 'all-songs' | 'catalogs';

function shuffleSongs(songs: Song[], options?: { avoidConsecutiveArtist?: boolean }) {
  const list = [...songs];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  if (!options?.avoidConsecutiveArtist || list.length < 2) {
    return list;
  }

  // Re-order in-place to minimize back-to-back same artist in non-artist shuffle modes.
  for (let i = 1; i < list.length; i += 1) {
    if (list[i].artistId !== list[i - 1].artistId) continue;
    let swapIndex = -1;
    for (let j = i + 1; j < list.length; j += 1) {
      if (list[j].artistId !== list[i - 1].artistId) {
        swapIndex = j;
        break;
      }
    }
    if (swapIndex !== -1) {
      [list[i], list[swapIndex]] = [list[swapIndex], list[i]];
    }
  }
  return list;
}

export default function DjShuffle() {
  const [mode, setMode] = useState<DjMode>('all-songs');
  const [selectedArtistIds, setSelectedArtistIds] = useState<string[]>([]);
  const [selectedCatalogIds, setSelectedCatalogIds] = useState<string[]>([]);
  const { playQueue, pause } = usePlayerActions();
  const { currentSong, isPlaying } = usePlayerState();

  const selectedArtistSongs = useMemo(
    () => SONGS.filter((song) => selectedArtistIds.includes(song.artistId)),
    [selectedArtistIds]
  );

  const selectedCatalogSongs = useMemo(() => {
    const songIds = new Set(
      CATALOGS.filter((catalog) => selectedCatalogIds.includes(catalog.id)).flatMap((catalog) => catalog.songIds)
    );
    return SONGS.filter((song) => songIds.has(song.id));
  }, [selectedCatalogIds]);

  const canStart =
    mode === 'all-songs' ||
    (mode === 'artists' && selectedArtistSongs.length > 0) ||
    (mode === 'catalogs' && selectedCatalogSongs.length > 0);

  const startDjShuffle = () => {
    let sourceSongs: Song[] = SONGS;
    if (mode === 'artists') sourceSongs = selectedArtistSongs;
    if (mode === 'catalogs') sourceSongs = selectedCatalogSongs;
    const shuffled = shuffleSongs(sourceSongs, {
      avoidConsecutiveArtist: mode !== 'artists',
    });
    if (!shuffled.length) return;
    playQueue(shuffled, { startIndex: 0 });
    try {
      localStorage.setItem('songchainn_dj_shuffle_active', '1');
    } catch {
      void 0;
    }
  };

  const stopDjShuffle = () => {
    pause();
    try {
      localStorage.removeItem('songchainn_dj_shuffle_active');
    } catch {
      void 0;
    }
  };

  const toggleSelect = (id: string, selected: string[], setSelected: (ids: string[]) => void) => {
    if (selected.includes(id)) {
      setSelected(selected.filter((entry) => entry !== id));
      return;
    }
    setSelected([...selected, id]);
  };

  return (
    <div className="min-h-screen bg-background relative">
      <AnimatedBackground variant="default" />
      <Navigation />
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 relative z-10 space-y-6">
        <section className="rounded-3xl border border-cyan-400/30 bg-black/65 overflow-hidden">
          <div className="grid gap-4 p-4 md:grid-cols-[1.1fr_0.9fr] md:p-6">
            <div className="space-y-3">
              <p className="inline-flex items-center gap-2 rounded-full border border-cyan-300/40 bg-cyan-500/15 px-3 py-1 text-xs font-semibold text-cyan-100">
                <Shuffle className="h-3.5 w-3.5" />
                DJ Shuffle
              </p>
              <h1 className="text-3xl font-bold text-white sm:text-4xl">DJ $huffle</h1>
              <p className="text-sm text-zinc-200 sm:text-base">
                Pick artists, songs, or catalogs and let DJ $huffle keep the music flowing in nonstop random order.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={startDjShuffle} disabled={!canStart} className="bg-emerald-400 text-black hover:bg-emerald-300">
                  <PlayCircle className="mr-2 h-4 w-4" />
                  Start Shuffle
                </Button>
                <Button variant="outline" onClick={stopDjShuffle} className="border-cyan-300/40 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20">
                  <PauseCircle className="mr-2 h-4 w-4" />
                  Stop DJ
                </Button>
              </div>
              <p className="text-xs text-zinc-300">
                Now Playing: {currentSong ? `${currentSong.title} Â· ${currentSong.artist}` : 'Nothing yet'} {isPlaying ? '(Live)' : ''}
              </p>
            </div>
            <div className="rounded-2xl border border-cyan-300/25 bg-black/45 p-2">
              <img src={djShuffleBranding} alt="DJ Shuffle branding" className="h-full w-full rounded-xl object-cover" />
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-cyan-400/25 bg-black/55 p-4 sm:p-6 space-y-4">
          <h2 className="text-xl font-semibold text-white">Shuffle Setup</h2>
          <div className="grid gap-2 sm:grid-cols-3">
            <Button type="button" variant={mode === 'artists' ? 'default' : 'outline'} onClick={() => setMode('artists')} className="justify-start">
              <User2 className="mr-2 h-4 w-4" />
              Shuffle Artist
            </Button>
            <Button type="button" variant={mode === 'all-songs' ? 'default' : 'outline'} onClick={() => setMode('all-songs')} className="justify-start">
              <Music2 className="mr-2 h-4 w-4" />
              Shuffle All Songs
            </Button>
            <Button type="button" variant={mode === 'catalogs' ? 'default' : 'outline'} onClick={() => setMode('catalogs')} className="justify-start">
              <Shuffle className="mr-2 h-4 w-4" />
              Shuffle Catalogs
            </Button>
          </div>

          {mode === 'artists' && (
            <div className="space-y-2">
              <p className="text-sm text-zinc-200">Pick one or more artists.</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 max-h-[320px] overflow-y-auto pr-1">
                {ARTISTS.map((artist) => (
                  <button
                    key={artist.id}
                    type="button"
                    onClick={() => toggleSelect(artist.id, selectedArtistIds, setSelectedArtistIds)}
                    className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                      selectedArtistIds.includes(artist.id)
                        ? 'border-emerald-300/50 bg-emerald-500/20 text-emerald-100'
                        : 'border-white/15 bg-black/40 text-zinc-100 hover:border-cyan-300/40'
                    }`}
                  >
                    {artist.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === 'catalogs' && (
            <div className="space-y-2">
              <p className="text-sm text-zinc-200">Pick one or more catalogs.</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 max-h-[320px] overflow-y-auto pr-1">
                {CATALOGS.map((catalog) => (
                  <button
                    key={catalog.id}
                    type="button"
                    onClick={() => toggleSelect(catalog.id, selectedCatalogIds, setSelectedCatalogIds)}
                    className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                      selectedCatalogIds.includes(catalog.id)
                        ? 'border-cyan-300/50 bg-cyan-500/20 text-cyan-100'
                        : 'border-white/15 bg-black/40 text-zinc-100 hover:border-cyan-300/40'
                    }`}
                  >
                    {catalog.title}
                    <span className="ml-1 text-xs text-zinc-400">Â· {catalog.artist}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
      <AudioPlayer />
    </div>
  );
}
