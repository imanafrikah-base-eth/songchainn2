import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Headphones, ListMusic, Music, Pause, Play, Lock, Globe, Plus, GripVertical, X, Users, UserPlus } from 'lucide-react';
import { SONGS, type Song } from '@/data/musicData';
import { usePublishedCatalog } from '@/hooks/usePublishedCatalog';
import { Navigation } from '@/components/Navigation';
import { AudioPlayer } from '@/components/AudioPlayer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SongCard } from '@/components/SongCard';
import { usePlayerActions, usePlayerState } from '@/context/PlayerContext';
import { useAudienceInteractions } from '@/hooks/useAudienceInteractions';
import { useAuth } from '@/context/AuthContext';
import type { Playlist, PlaylistCollaboratorWithProfile } from '@/types/database';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { setPlaylistSongs } from '@/lib/localDb';
const logo = '/songchainn-logo.webp';

export default function PlaylistDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentSong, isPlaying } = usePlayerState();
  const { playQueue, togglePlay } = usePlayerActions();
  const {
    playlists,
    getPlaylistSongs,
    createPlaylist,
    reorderPlaylistSongs,
    addSongToPlaylist,
    removeSongFromPlaylist,
    getPlaylistCollaborators,
    addPlaylistCollaborator,
    removePlaylistCollaborator,
    updatePlaylistCollaborative,
    searchUsersByUsername,
  } = useAudienceInteractions();
  const { user } = useAuth();
  const { toast } = useToast();
  const { songs: publishedSongs } = usePublishedCatalog();

  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [collaborators, setCollaborators] = useState<PlaylistCollaboratorWithProfile[]>([]);
  const [isCollabDialogOpen, setIsCollabDialogOpen] = useState(false);
  const [collaboratorQuery, setCollaboratorQuery] = useState('');
  const [collaboratorResults, setCollaboratorResults] = useState<Awaited<ReturnType<typeof searchUsersByUsername>>>([]);
  const [isSearchingCollaborators, setIsSearchingCollaborators] = useState(false);
  const [isAddSongOpen, setIsAddSongOpen] = useState(false);
  const [addSongQuery, setAddSongQuery] = useState('');

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
      const allSongs = [...SONGS, ...publishedSongs];
      const resolvedSongs = songIds
        .map((songId) => allSongs.find((song) => song.id === songId))
        .filter(Boolean) as Song[];
      setSongs(resolvedSongs);
      setIsLoading(false);
    };

    loadSongs();

    return () => {
      cancelled = true;
    };
  }, [getPlaylistSongs, id, publishedSongs]);

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

  const canEdit = useMemo(() => {
    if (!playlist || !user) return false;
    if (isOwner) return true;
    return Boolean(
      playlist.is_collaborative &&
      collaborators.some((c) => c.user_id === user.id && c.can_edit),
    );
  }, [playlist, user, isOwner, collaborators]);

  useEffect(() => {
    if (!playlist?.id || !playlist.is_collaborative) {
      setCollaborators([]);
      return;
    }
    let cancelled = false;
    getPlaylistCollaborators(playlist.id).then((rows) => {
      if (!cancelled) setCollaborators(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [playlist?.id, playlist?.is_collaborative, getPlaylistCollaborators]);

  useEffect(() => {
    if (!isCollabDialogOpen) {
      setCollaboratorQuery('');
      setCollaboratorResults([]);
    }
  }, [isCollabDialogOpen]);

  useEffect(() => {
    const q = collaboratorQuery.trim();
    if (!q) {
      setCollaboratorResults([]);
      setIsSearchingCollaborators(false);
      return;
    }
    let cancelled = false;
    setIsSearchingCollaborators(true);
    const timer = setTimeout(() => {
      searchUsersByUsername(q).then((results) => {
        if (!cancelled) {
          setCollaboratorResults(results);
          setIsSearchingCollaborators(false);
        }
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [collaboratorQuery, searchUsersByUsername]);

  const handleAddCollaborator = async (userId: string) => {
    if (!playlist) return;
    const ok = await addPlaylistCollaborator(playlist.id, userId);
    if (ok) {
      const rows = await getPlaylistCollaborators(playlist.id);
      setCollaborators(rows);
      setCollaboratorQuery('');
      setCollaboratorResults([]);
    }
  };

  const handleRemoveCollaborator = async (userId: string) => {
    if (!playlist) return;
    await removePlaylistCollaborator(playlist.id, userId);
    setCollaborators((prev) => prev.filter((c) => c.user_id !== userId));
  };

  const handleToggleCollaborative = async () => {
    if (!playlist) return;
    const next = !playlist.is_collaborative;
    const ok = await updatePlaylistCollaborative(playlist.id, next);
    if (ok) {
      setPlaylist((prev) => (prev ? { ...prev, is_collaborative: next } : prev));
    }
  };

  const handleReorder = async (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const next = [...songs];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setSongs(next);
    if (playlist) {
      await reorderPlaylistSongs(playlist.id, next.map((s) => s.id));
    }
  };

  const handleRemoveSong = async (songId: string) => {
    if (!playlist) return;
    await removeSongFromPlaylist(playlist.id, songId);
    setSongs((prev) => prev.filter((s) => s.id !== songId));
  };

  const addableSongs = useMemo(() => {
    const q = addSongQuery.trim().toLowerCase();
    const existingIds = new Set(songs.map((s) => s.id));
    const pool = [...SONGS, ...publishedSongs].filter((s) => !existingIds.has(s.id));
    if (!q) return pool.slice(0, 20);
    return pool
      .filter((s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q))
      .slice(0, 20);
  }, [addSongQuery, songs, publishedSongs]);

  const handleAddSong = async (song: Song) => {
    if (!playlist) return;
    await addSongToPlaylist(playlist.id, song.id);
    setSongs((prev) => (prev.some((s) => s.id === song.id) ? prev : [...prev, song]));
  };

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
          <span>Loading playlistâ€¦</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 lg:pl-28 pt-4 sm:pt-6">
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
                {playlist.is_collaborative && (
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/10 border border-border text-sm font-medium">
                    <Users className="w-4 h-4" />
                    <span>Collaborative</span>
                  </div>
                )}
              </div>

              {playlist.is_collaborative && collaborators.length > 0 && (
                <div className="flex items-center gap-2 mb-6">
                  <div className="flex -space-x-2">
                    {collaborators.slice(0, 6).map((c) => (
                      <Avatar key={c.id} className="w-7 h-7 border-2 border-background">
                        <AvatarImage src={c.profile?.avatar_url || c.profile?.profile_picture_url || ''} />
                        <AvatarFallback className="text-[10px]">
                          {(c.profile?.display_name || c.profile?.username || '?').charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {collaborators.length} {collaborators.length === 1 ? 'collaborator' : 'collaborators'}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-4 flex-wrap">
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
                        Savingâ€¦
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        Save playlist
                      </>
                    )}
                  </Button>
                )}
                {canEdit && (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="gap-2"
                    onClick={() => setIsAddSongOpen(true)}
                  >
                    <Plus className="w-4 h-4" />
                    Add song
                  </Button>
                )}
                {isOwner && (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="gap-2"
                    onClick={() => setIsCollabDialogOpen(true)}
                  >
                    <UserPlus className="w-4 h-4" />
                    Collaborators
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
              <span>Loading tracksâ€¦</span>
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
              <div
                key={song.id}
                className="flex items-center gap-2"
                draggable={canEdit}
                onDragStart={(e) => {
                  if (!canEdit) return;
                  setDraggedIndex(index);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  if (!canEdit || draggedIndex === null) return;
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  if (!canEdit || draggedIndex === null) return;
                  e.preventDefault();
                  void handleReorder(draggedIndex, index);
                  setDraggedIndex(null);
                }}
                onDragEnd={() => setDraggedIndex(null)}
              >
                {canEdit && (
                  <GripVertical className="w-4 h-4 text-muted-foreground/50 flex-shrink-0 cursor-grab active:cursor-grabbing" />
                )}
                <div className="flex-1 min-w-0">
                  <SongCard song={song} index={index} variant="compact" />
                </div>
                {canEdit && (
                  <button
                    type="button"
                    aria-label="Remove from playlist"
                    onClick={() => void handleRemoveSong(song.id)}
                    className="p-1.5 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))
          )}
        </motion.section>
      </main>

      <AudioPlayer />

      <Dialog open={isAddSongOpen} onOpenChange={setIsAddSongOpen}>
        <DialogContent className="max-w-md w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle>Add a song</DialogTitle>
          </DialogHeader>
          <Input
            value={addSongQuery}
            onChange={(e) => setAddSongQuery(e.target.value)}
            placeholder="Search songs or artists"
            autoFocus
          />
          <ScrollArea className="max-h-[360px] pr-2">
            <div className="space-y-1">
              {addableSongs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No songs found.</p>
              ) : (
                addableSongs.map((song) => (
                  <button
                    key={song.id}
                    type="button"
                    onClick={() => void handleAddSong(song)}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/40 transition-colors text-left"
                  >
                    <div className="w-9 h-9 rounded-lg bg-secondary overflow-hidden flex-shrink-0 flex items-center justify-center">
                      {song.coverImage ? (
                        <img src={song.coverImage} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Music className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{song.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
                    </div>
                    <Plus className="w-4 h-4 text-primary flex-shrink-0" />
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {isOwner && (
        <Dialog open={isCollabDialogOpen} onOpenChange={setIsCollabDialogOpen}>
          <DialogContent className="max-w-md w-[95vw] sm:w-full">
            <DialogHeader>
              <DialogTitle>Collaborators</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Collaborative playlist</p>
                <div className="inline-flex items-center gap-2 rounded-lg bg-muted p-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={playlist.is_collaborative ? 'ghost' : 'default'}
                    className="flex-1"
                    onClick={() => playlist.is_collaborative && void handleToggleCollaborative()}
                  >
                    Off
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={playlist.is_collaborative ? 'default' : 'ghost'}
                    className="flex-1"
                    onClick={() => !playlist.is_collaborative && void handleToggleCollaborative()}
                  >
                    On
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  When on, collaborators you add below can add, remove and reorder songs.
                </p>
              </div>

              {playlist.is_collaborative && (
                <>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Add a collaborator</p>
                    <Input
                      value={collaboratorQuery}
                      onChange={(e) => setCollaboratorQuery(e.target.value)}
                      placeholder="Search by username or name"
                    />
                    {isSearchingCollaborators && (
                      <p className="text-xs text-muted-foreground">Searchingâ€¦</p>
                    )}
                    {collaboratorResults.length > 0 && (
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {collaboratorResults.map((res) => (
                          <button
                            key={res.user_id}
                            type="button"
                            onClick={() => void handleAddCollaborator(res.user_id)}
                            className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/40 transition-colors text-left"
                          >
                            <Avatar className="w-7 h-7">
                              <AvatarImage src={res.avatar_url || ''} />
                              <AvatarFallback className="text-[10px]">
                                {(res.display_name || res.username || '?').charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm text-foreground truncate flex-1">
                              {res.display_name || res.username}
                            </span>
                            <UserPlus className="w-4 h-4 text-primary flex-shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Current collaborators</p>
                    {collaborators.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No collaborators yet.</p>
                    ) : (
                      <div className="space-y-1">
                        {collaborators.map((c) => (
                          <div key={c.id} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/20">
                            <Avatar className="w-7 h-7">
                              <AvatarImage src={c.profile?.avatar_url || c.profile?.profile_picture_url || ''} />
                              <AvatarFallback className="text-[10px]">
                                {(c.profile?.display_name || c.profile?.username || '?').charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm text-foreground truncate flex-1">
                              {c.profile?.display_name || c.profile?.username || 'Listener'}
                            </span>
                            <button
                              type="button"
                              aria-label="Remove collaborator"
                              onClick={() => void handleRemoveCollaborator(c.user_id)}
                              className="p-1 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
