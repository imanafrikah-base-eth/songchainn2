import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Playlist } from '@/types/database';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export function useAudienceInteractions() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [likedSongs, setLikedSongs] = useState<string[]>([]);
  const [likedArtists, setLikedArtists] = useState<string[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch initial data
  useEffect(() => {
    if (!user) {
      setLikedSongs([]);
      setLikedArtists([]);
      setPlaylists([]);
      setIsLoading(false);
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      const [songsRes, artistsRes, playlistsRes] = await Promise.all([
        supabase.from('liked_songs').select('song_id').eq('user_id', user.id),
        supabase.from('liked_artists').select('artist_id').eq('user_id', user.id),
        supabase.from('playlists').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      ]);

      setLikedSongs((songsRes.data || []).map((r: any) => r.song_id).filter(Boolean));
      setLikedArtists((artistsRes.data || []).map((r: any) => r.artist_id).filter(Boolean));
      setPlaylists((playlistsRes.data as any) || []);
      setIsLoading(false);
    };

    fetchData();
  }, [user]);

  // Like/Unlike Song
  const toggleLikeSong = useCallback(async (songId: string) => {
    if (!user) return;

    const isLiked = likedSongs.includes(songId);
    const next = isLiked ? likedSongs.filter((id) => id !== songId) : [...likedSongs, songId];

    if (isLiked) {
      await supabase.from('liked_songs').delete().eq('user_id', user.id).eq('song_id', songId);
    } else {
      await supabase.from('liked_songs').insert({ user_id: user.id, song_id: songId } as any);
    }

    setLikedSongs(next);
    toast({ title: isLiked ? 'Song removed from likes' : 'Song liked!' });
  }, [user, likedSongs, toast]);

  // Like/Unlike Artist
  const toggleLikeArtist = useCallback(async (artistId: string) => {
    if (!user) return;

    const isLiked = likedArtists.includes(artistId);
    const next = isLiked ? likedArtists.filter((id) => id !== artistId) : [...likedArtists, artistId];

    if (isLiked) {
      await supabase.from('liked_artists').delete().eq('user_id', user.id).eq('artist_id', artistId);
    } else {
      await supabase.from('liked_artists').insert({ user_id: user.id, artist_id: artistId } as any);
    }

    setLikedArtists(next);
    toast({ title: isLiked ? 'Artist unfollowed' : 'Artist followed!' });
  }, [user, likedArtists, toast]);

  // Create Playlist
  const createPlaylist = useCallback(async (name: string, description?: string) => {
    if (!user) return null;
    const { data, error } = await supabase
      .from('playlists')
      .insert({
        user_id: user.id,
        name,
        description: description || null,
        is_public: false,
        is_collaborative: false,
      } as any)
      .select('*')
      .maybeSingle();

    if (error || !data) {
      toast({ title: 'Failed to create playlist', variant: 'destructive' });
      return null;
    }

    const playlist = data as any as Playlist;
    setPlaylists((prev) => [playlist, ...prev]);
    toast({ title: 'Playlist created!' });
    return playlist;
  }, [user, toast]);

  // Delete Playlist
  const deletePlaylist = useCallback(async (playlistId: string) => {
    if (!user) return;
    await supabase.from('playlist_songs').delete().eq('playlist_id', playlistId);
    await supabase.from('playlists').delete().eq('id', playlistId).eq('user_id', user.id);
    const next = playlists.filter((p) => p.id !== playlistId);
    setPlaylists(next);
    toast({ title: 'Playlist deleted' });
  }, [user, toast, playlists]);

  // Add Song to Playlist
  const addSongToPlaylist = useCallback(async (playlistId: string, songId: string) => {
    if (!user) return;
    const { data: existing } = await supabase
      .from('playlist_songs')
      .select('song_id')
      .eq('playlist_id', playlistId);

    const songIds = (existing || []).map((r: any) => r.song_id).filter(Boolean);
    if (songIds.includes(songId)) {
      toast({ title: 'Song already in playlist' });
      return;
    }

    const position = songIds.length;
    await supabase
      .from('playlist_songs')
      .insert({ playlist_id: playlistId, song_id: songId, position } as any);
    toast({ title: 'Song added to playlist!' });
  }, [user, toast]);

  // Remove Song from Playlist
  const removeSongFromPlaylist = useCallback(async (playlistId: string, songId: string) => {
    if (!user) return;
    await supabase.from('playlist_songs').delete().eq('playlist_id', playlistId).eq('song_id', songId);
    toast({ title: 'Song removed from playlist' });
  }, [user, toast]);

  // Get Playlist Songs
  const getPlaylistSongs = useCallback(async (playlistId: string): Promise<string[]> => {
    const { data } = await supabase
      .from('playlist_songs')
      .select('song_id')
      .eq('playlist_id', playlistId)
      .order('position', { ascending: true });
    return (data || []).map((r: any) => r.song_id).filter(Boolean);
  }, []);

  // Check if song is liked
  const isSongLiked = useCallback((songId: string) => likedSongs.includes(songId), [likedSongs]);
  
  // Check if artist is liked
  const isArtistLiked = useCallback((artistId: string) => likedArtists.includes(artistId), [likedArtists]);

  return {
    likedSongs,
    likedArtists,
    playlists,
    isLoading,
    toggleLikeSong,
    toggleLikeArtist,
    isSongLiked,
    isArtistLiked,
    createPlaylist,
    deletePlaylist,
    addSongToPlaylist,
    removeSongFromPlaylist,
    getPlaylistSongs,
  };
}
