import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Headphones, ListMusic, Music, Pause, Play, Lock, Globe, Plus } from 'lucide-react';
import { SONGS, type Song } from '@/data/musicData';
import { Navigation } from '@/components/Navigation';
import { AudioPlayer } from '@/components/AudioPlayer';
import { Button } from '@/components/ui/button';
import { SongCard } from '@/components/SongCard';
import { usePlayerActions, usePlayerState } from '@/context/PlayerContext';
import { useAudienceInteractions } from '@/hooks/useAudienceInteractions';
import { useAuth } from '@/context/AuthContext';
import type { Playlist } from '@/types/database';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { setPlaylistSongs } from '@/lib/localDb';
const logo = '/songchainn-logo.webp';

export default function PlaylistDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentSong, isPlaying } = usePlayerState();
  const { playQueue, togglePlay } = usePlayerActions();
  const { playlists, getPlaylistSongs, createPlaylist } = useAudienceInteractions();
  const { user } = useAuth();
  const { toast } = useToast();

  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!id) return;

    const resolvePlaylist = async () => {
      const local = playlists.find((p) => p.id === id);
      if (local) {
        setPlaylist(local);
      } else if (isSupabaseConfigured) {
        const { data } = await supabase
          .from('playlists')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        setPlaylist((data as any as Playlist) ?? null);
      } else {
        setPlaylist(null);
      }
    };

    resolvePlaylist();
  }, [id, playlists]);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    const loadSongs = async () => {
      setIsLoading(true);
      const songIds = await getPlaylistSongs(id);
      if (cancelled) return;
      const resolvedSongs = songIds
        .map((songId) => SONGS.find((song) => song.id === songId))
        .filter(Boolean) as Song[];
      setSongs(resolvedSongs);
      setIsLoading(false);
    };

    loadSongs();

    return () => {
      cancelled = true;
    };
  }, [getPlaylistSongs, id]);

  const isCurrentPlaylist = useMemo(
    () => Boolean(currentSong && songs.some((song) => song.id === currentSong.id)),
    [currentSong, songs]
  );

  const canView = useMemo(() => {
    if (!playlist) return true;
    if (playlist.is_public) return true;
    if (user && playlist.user_id === user.id) return true;
    return false;
  }, [playlist, user]);

  const isOwner = useMemo(() => {
    if (!playlist || !user) return false;
    return playlist.user_id === user.id;
  }, [playlist, user]);

  const hasOwnCopy = useMemo(() => {
    if (!playlist || !user) return false;
    if (isOwner) return true;
    return playlists.some((p) => p.user_id === user.id && p.name === playlist.name);
  }, [isOwner, playlist, playlists, user]);

  const handleSavePlaylist = async () => {
    if (!playlist || !user || hasOwnCopy || isSaving) return;
    setIsSaving(true);
    try {
      const cloned = await createPlaylist(
        playlist.name,
        playlist.description || undefined,
        false,
        playlist.mood || undefined,
        playlist.vibe || undefined,
      );
      if (!cloned) {
        return;
      }
      if (songs.length > 0) {
        if (isSupabaseConfigured) {
          const rows = songs.map((song, index) => ({
            playlist_id: cloned.id,
            song_id: song.id,
            position: index,
          }));
          await supabase.from('playlist_songs').insert(rows as any);
        } else {
          setPlaylistSongs(cloned.id, songs.map((song) => song.id));
        }
      }
      toast({ title: 'Playlist saved to your profile' });
    } finally {
      setIsSaving(false);
    }
  };

  if (!id) {
    return null;
  }

  if (!playlist && !isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md"
        >
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
            <Music className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-2xl font-heading font-bold text-foreground mb-3">Playlist Not Found</h1>
          <p className="text-muted-foreground mb-6">
            This playlist could not be found. It may have been removed or the link is incorrect.
          </p>
          <Button asChild>
            <Link to="/profile">Back to profile</Link>
          </Button>
        </motion.div>
      </div>
    );
  }

  if (playlist && !canView) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md"
        >
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-2xl font-heading font-bold text-foreground mb-3">This playlist is private</h1>
          <p className="text-muted-foreground mb-6">
            Only the owner of this playlist can view it.
          </p>
          <Button asChild>
            <Link to="/">Browse music</Link>
          </Button>
        </motion.div>
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span>Loading playlist…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="px-4 pt-4 sm:pt-6">
        <Link
          to="/profile"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back to profile</span>
        </Link>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <div className="flex flex-col lg:flex-row gap-8 items-start">
            <div className="w-64 h-64 md:w-72 md:h-72 rounded-2xl bg-secondary overflow-hidden flex-shrink-0 shadow-float flex items-center justify-center">
              <div className="relative w-32 h-32 rounded-2xl bg-gradient-to-br from-primary/40 via-primary/10 to-cyan-400/30 flex items-center justify-center">
                <ListMusic className="w-14 h-14 text-primary-foreground" />
                <div className="absolute inset-0 bg-gradient-to-tr from-primary/30 to-transparent mix-blend-screen" />
              </div>
            </div>

            <div className="flex-1">
              <p className="text-sm text-muted-foreground mb-2 uppercase tracking-wide">Playlist</p>
              <h1 className="font-heading text-4xl md:text-5xl font-bold text-foreground mb-3">
                {playlist.name}
              </h1>
              {playlist.description && (
                <p className="text-muted-foreground mb-5 max-w-xl">
                  {playlist.description}
                </p>
              )}

              {(playlist.mood || playlist.vibe) && (
                <div className="flex flex-wrap items-center gap-2 mb-5">
                  {playlist.mood && (
                    <span className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary">
                      Mood: {playlist.mood}
                    </span>
                  )}
                  {playlist.vibe && (
                    <span className="inline-flex items-center px-3 py-1 rounded-full bg-secondary/10 border border-border text-xs font-medium text-foreground">
                      Vibe: {playlist.vibe}
                    </span>
                  )}
                </div>
              )}

              <div className="flex items-center gap-4 mb-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-sm font-medium">
                  {playlist.is_public ? (
                    <>
                      <Globe className="w-4 h-4" />
                      <span>Public playlist</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>Private playlist</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Headphones className="w-4 h-4" />
                  <span>{songs.length} {songs.length === 1 ? 'track' : 'tracks'}</span>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <Button
                  onClick={() => {
                    if (!songs.length) return;
                    if (isCurrentPlaylist) {
                      togglePlay();
                    } else {
                      playQueue(songs, { startIndex: 0 });
                    }
                  }}
                  size="lg"
                  className="gap-2 gradient-primary shadow-glow"
                  disabled={songs.length === 0}
                >
                  {isCurrentPlaylist && isPlaying ? (
                    <>
                      <Pause className="w-5 h-5" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5 ml-0.5" />
                      Play
                    </>
                  )}
                </Button>
                {user && !isOwner && (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="gap-2"
                    onClick={() => void handleSavePlaylist()}
                    disabled={isSaving || hasOwnCopy}
                  >
                    {hasOwnCopy ? (
                      <>
                        <span className="w-2.5 h-2.5 rounded-full bg-primary" />
                        Saved
                      </>
                    ) : isSaving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        Saving…
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        Save playlist
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="space-y-3"
        >
          {isLoading ? (
            <div className="flex items-center gap-3 text-muted-foreground">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span>Loading tracks…</span>
            </div>
          ) : songs.length === 0 ? (
            <div className="border border-dashed border-border rounded-xl p-6 text-center">
              <p className="text-sm text-muted-foreground mb-2">
                There are no songs in this playlist yet.
              </p>
              <p className="text-xs text-muted-foreground/80">
                Add songs from their detail pages or from the catalog.
              </p>
            </div>
          ) : (
            songs.map((song, index) => (
              <SongCard key={song.id} song={song} index={index} variant="compact" />
            ))
          )}
        </motion.section>
      </main>

      <AudioPlayer />
    </div>
  );
}
