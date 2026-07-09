import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { Playlist, PlaylistCollaboratorWithProfile } from '@/types/database';
import { useToast } from '@/hooks/use-toast';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { broadcastCountDelta } from '@/hooks/usePopularity';
import { getLikedArtists, getLikedSongs, getPlaylistSongs as getLocalPlaylistSongs, listPlaylists, savePlaylists, setPlaylistSongs, setLikedArtists as saveLocalLikedArtists, setLikedSongs as saveLocalLikedSongs } from '@/lib/localDb';

function isSyntheticId(id: string | null | undefined): boolean {
  return !!id && (id.startsWith('fc-') || id.startsWith('fb-'));
}

export function useAudienceInteractions() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [likedSongs, setLikedSongs] = useState<string[]>([]);
  const [likedArtists, setLikedArtists] = useState<string[]>([]);
  const [savedCatalogs, setSavedCatalogs] = useState<string[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [publicPlaylists, setPublicPlaylists] = useState<Playlist[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch initial data
  useEffect(() => {
    if (!user) {
      setLikedSongs([]);
      setLikedArtists([]);
      setPlaylists([]);
      setPublicPlaylists([]);
      const storageKey = 'songchainn:savedCatalogs:guest';
      const stored = localStorage.getItem(storageKey);
      try {
        const parsed = stored ? JSON.parse(stored) : [];
        setSavedCatalogs(Array.isArray(parsed) ? parsed : []);
      } catch {
        setSavedCatalogs([]);
      }
      setIsLoading(false);
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      if (!isSupabaseConfigured || isSyntheticId(user.id)) {
        // No Supabase session (offline or synthetic fc-/fb- user) — read from local storage
        setLikedSongs(getLikedSongs(user.id));
        setLikedArtists(getLikedArtists(user.id));
        const ownPlaylists = listPlaylists(user.id);
        setPlaylists(ownPlaylists);
        setPublicPlaylists(ownPlaylists.filter(p => p.is_public));
        const storageKey = user ? `songchainn:savedCatalogs:${user.id}` : 'songchainn:savedCatalogs:guest';
        const stored = localStorage.getItem(storageKey);
        try {
          const parsed = stored ? JSON.parse(stored) : [];
          setSavedCatalogs(Array.isArray(parsed) ? parsed : []);
        } catch {
          setSavedCatalogs([]);
        }
        setIsLoading(false);
        return;
      }
      try {
        const [songsRes, artistsRes, playlistsRes] = await Promise.all([
          supabase.from('liked_songs').select('song_id').eq('user_id', user.id),
          supabase.from('liked_artists').select('artist_id').eq('user_id', user.id),
          supabase
            .from('playlists')
            .select('*')
            .or(`is_public.eq.true,user_id.eq.${user.id}`)
            .order('created_at', { ascending: false }),
        ]);

        if (songsRes.error && import.meta.env.DEV) {
          console.error('Failed to load liked songs', songsRes.error);
        }
        if (artistsRes.error && import.meta.env.DEV) {
          const artistError = artistsRes.error as any;
          const message = String(artistError?.message || '').toLowerCase();
          if (!message.includes('abort')) {
            console.error('Failed to load liked artists', artistsRes.error);
          }
        }
        if (playlistsRes.error && import.meta.env.DEV) {
          console.error('Failed to load playlists', playlistsRes.error);
        }

        setLikedSongs(
          (songsRes.data || []).map((r: any) => r.song_id).filter(Boolean),
        );
        setLikedArtists(
          (artistsRes.data || []).map((r: any) => r.artist_id).filter(Boolean),
        );
        const loadedPlaylists = ((playlistsRes.data as any) || []) as Playlist[];
        const ownPlaylists = loadedPlaylists.filter((playlist) => playlist.user_id === user.id);
        const globallyPublicPlaylists = loadedPlaylists.filter((playlist) => playlist.is_public);
        setPlaylists(ownPlaylists);
        setPublicPlaylists(globallyPublicPlaylists);
        if (import.meta.env.DEV) {
          console.log('playlists fetch results', {
            total: loadedPlaylists.length,
            own: ownPlaylists.length,
            public: globallyPublicPlaylists.length,
            userId: user.id,
          });
        }
        const storageKey = user ? `songchainn:savedCatalogs:${user.id}` : 'songchainn:savedCatalogs:guest';
        const stored = localStorage.getItem(storageKey);
        try {
          const parsed = stored ? JSON.parse(stored) : [];
          setSavedCatalogs(Array.isArray(parsed) ? parsed : []);
        } catch {
          setSavedCatalogs([]);
        }
      } catch (err: any) {
        if (import.meta.env.DEV) {
          const message = String(err?.message || '').toLowerCase();
          if (!message.includes('abort')) {
            console.error('Failed to load audience interactions', err);
          }
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user]);

  useEffect(() => {
    const storageKey = user ? `songchainn:savedCatalogs:${user.id}` : 'songchainn:savedCatalogs:guest';
    localStorage.setItem(storageKey, JSON.stringify(savedCatalogs));
  }, [savedCatalogs, user]);

  // Like/Unlike Song
  const toggleLikeSong = useCallback(async (songId: string) => {
    if (!user) return;

    const isLiked = likedSongs.includes(songId);
    const delta = isLiked ? -1 : 1;
    const next = isLiked ? likedSongs.filter((id) => id !== songId) : [...likedSongs, songId];

    // Optimistic local state update
    setLikedSongs(next);

    // Optimistic cache update — like count changes instantly for this user
    queryClient.setQueryData(['song-popularity'], (old: any[] | undefined) => {
      if (!old) return old;
      return old.map((item: any) =>
        String(item.song_id) === String(songId)
          ? { ...item, like_count: Math.max(0, (item.like_count || 0) + delta) }
          : item,
      );
    });

    // Broadcast to all other connected clients for instant cross-app update
    broadcastCountDelta('like', { songId, delta });

    try {
      if (isLiked) {
        const { error } = await supabase.from('liked_songs').delete().eq('user_id', user.id).eq('song_id', songId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('liked_songs').insert({ user_id: user.id, song_id: songId } as any);
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ['song-popularity'] });
      toast({ title: isLiked ? 'Song removed from likes' : 'Song liked!' });
    } catch {
      // Revert optimistic updates on failure
      setLikedSongs(likedSongs);
      queryClient.setQueryData(['song-popularity'], (old: any[] | undefined) => {
        if (!old) return old;
        return old.map((item: any) =>
          String(item.song_id) === String(songId)
            ? { ...item, like_count: Math.max(0, (item.like_count || 0) - delta) }
            : item,
        );
      });
      toast({ title: 'Could not update likes', variant: 'destructive' });
    }
  }, [user, likedSongs, queryClient, toast]);

  // Like/Unlike Artist
  const toggleLikeArtist = useCallback(async (artistId: string) => {
    if (!user) return;

    const isLiked = likedArtists.includes(artistId);
    const delta = isLiked ? -1 : 1;
    const next = isLiked ? likedArtists.filter((id) => id !== artistId) : [...likedArtists, artistId];

    // Optimistic local state update
    setLikedArtists(next);

    // Optimistic cache update — follower count changes instantly for this user
    queryClient.setQueryData(['artist-follower-counts'], (old: any[] | undefined) => {
      if (!old) return old;
      return old.map((item: any) =>
        String(item.artist_id) === String(artistId)
          ? { ...item, follower_count: Math.max(0, (item.follower_count || 0) + delta) }
          : item,
      );
    });

    // Broadcast to all other connected clients for instant cross-app update
    broadcastCountDelta('follow', { artistId, delta });

    if (isSyntheticId(user.id)) {
      // No Supabase session — persist to local storage only
      saveLocalLikedArtists(user.id, next);
      toast({ title: isLiked ? 'Artist unfollowed' : 'Artist followed!' });
      return;
    }

    try {
      if (isLiked) {
        const { error } = await supabase.from('liked_artists').delete().eq('user_id', user.id).eq('artist_id', artistId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('liked_artists').insert({ user_id: user.id, artist_id: artistId } as any);
        if (error) throw error;
        // Create feed post for artist follow
        await supabase.from('social_posts').insert({
          user_id: user.id,
          post_type: 'artist_follow',
          artist_id: artistId,
          metadata: { artist_id: artistId, action: 'followed' },
          visibility: 'public',
        } as any);
      }
      // Trigger a fresh DB count for everyone via postgres_changes (already handled by usePopularity listener)
      queryClient.invalidateQueries({ queryKey: ['artist-follower-counts'] });
      toast({ title: isLiked ? 'Artist unfollowed' : 'Artist followed!' });
    } catch {
      // Revert optimistic updates on failure
      setLikedArtists(likedArtists);
      queryClient.setQueryData(['artist-follower-counts'], (old: any[] | undefined) => {
        if (!old) return old;
        return old.map((item: any) =>
          String(item.artist_id) === String(artistId)
            ? { ...item, follower_count: Math.max(0, (item.follower_count || 0) - delta) }
            : item,
        );
      });
      toast({ title: 'Could not update artist follow', variant: 'destructive' });
    }
  }, [user, likedArtists, queryClient, toast]);

  const toggleSaveCatalog = useCallback(async (catalogId: string) => {
    if (!catalogId) return;
    const isSaved = savedCatalogs.includes(catalogId);
    const next = isSaved ? savedCatalogs.filter((id) => id !== catalogId) : [...savedCatalogs, catalogId];
    setSavedCatalogs(next);
    toast({ title: isSaved ? 'Catalog removed from saved' : 'Catalog saved!' });
  }, [savedCatalogs, toast]);

  // Create Playlist
  const createPlaylist = useCallback(
    async (
      name: string,
      description?: string,
      isPublic: boolean = false,
      mood?: string,
      vibe?: string,
    ) => {
      if (!user) {
        toast({ title: 'Please sign in', variant: 'destructive' });
        return null;
      }
      if (!isSupabaseConfigured) {
        const now = new Date().toISOString();
        const playlist: Playlist = {
          id: crypto.randomUUID(),
          user_id: user.id,
          name,
          description: description || null,
          is_public: isPublic,
          is_collaborative: false,
          created_at: now,
          updated_at: now,
          mood: mood || null,
          vibe: vibe || null,
        };
        const next = [playlist, ...listPlaylists(user.id)];
        savePlaylists(user.id, next);
        setPlaylists(next);
        if (playlist.is_public) {
          setPublicPlaylists(prev => [playlist, ...prev]);
        }
        toast({ title: 'Playlist created!' });
        return playlist;
      }
      try {
        const {
          data: authData,
          error: authErr,
        } = await supabase.auth.getUser();
        if (authErr) throw authErr;

        const sessionUser = authData?.user;
        if (!sessionUser) {
          toast({ title: 'Please sign in', variant: 'destructive' });
          return null;
        }

        const cleanName = (name ?? '').trim();
        const cleanDescription = (description ?? '').trim();

        const payload: { user_id: string; name: string; description?: string | null; is_public: boolean; mood?: string | null; vibe?: string | null } = {
          user_id: sessionUser.id,
          name: cleanName || name,
          is_public: Boolean(isPublic),
        };

        if (cleanDescription) {
          payload.description = cleanDescription;
        } else {
          payload.description = null;
        }
        payload.mood = mood?.trim() || null;
        payload.vibe = vibe?.trim() || null;

        const { data, error } = await supabase
          .from('playlists')
          .insert(payload)
          .select('*')
          .maybeSingle();

        if (error || !data) {
          console.error('playlists insert failed', { error, payload });
          const messageParts = [
            error?.message,
            (error as any)?.details,
          ].filter(Boolean);
          toast({
            title: 'Failed to create playlist',
            description: messageParts.join(': ') || 'Please try again in a moment.',
            variant: 'destructive',
          });
          return null;
        }

        const playlist = data as any as Playlist;
        setPlaylists((prev) => [playlist, ...prev]);
        if (playlist.is_public) {
          setPublicPlaylists((prev) => [playlist, ...prev.filter((p) => p.id !== playlist.id)]);
        }
        toast({ title: 'Playlist created!' });
        return playlist;
      } catch (err: any) {
        console.error('playlists insert failed', err);
        toast({
          title: 'Failed to create playlist',
          description: String(err?.message || 'Please try again in a moment.'),
          variant: 'destructive',
        });
        return null;
      }
    },
    [user, toast],
  );

  // Delete Playlist
  const deletePlaylist = useCallback(async (playlistId: string) => {
    if (!user) return;
    if (!isSupabaseConfigured) {
      const next = listPlaylists(user.id).filter((p) => p.id !== playlistId);
      savePlaylists(user.id, next);
      setPlaylistSongs(playlistId, []);
      setPlaylists(next);
      toast({ title: 'Playlist deleted' });
      return;
    }
    await supabase.from('playlist_songs').delete().eq('playlist_id', playlistId);
    await supabase.from('playlists').delete().eq('id', playlistId).eq('user_id', user.id);
    const next = playlists.filter((p) => p.id !== playlistId);
    setPlaylists(next);
    setPublicPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
    toast({ title: 'Playlist deleted' });
  }, [user, toast, playlists]);

  const updatePlaylistVisibility = useCallback(
    async (playlistId: string, isPublic: boolean) => {
      if (!user) return false;
      if (!isSupabaseConfigured) {
        const existing = listPlaylists(user.id);
        const next = existing.map((p) =>
          p.id === playlistId ? { ...p, is_public: isPublic } : p,
        );
        savePlaylists(user.id, next);
        setPlaylists(next);
        setPublicPlaylists(next.filter((p) => p.is_public));
        toast({ title: isPublic ? 'Playlist published' : 'Playlist made private' });
        return true;
      }

      const { error } = await supabase
        .from('playlists')
        .update({ is_public: isPublic } as any)
        .eq('id', playlistId)
        .eq('user_id', user.id);

      if (error) {
        toast({
          title: 'Could not update playlist',
          description: error.message || 'Please try again in a moment.',
          variant: 'destructive',
        });
        return false;
      }

      setPlaylists((prev) =>
        prev.map((p) => (p.id === playlistId ? { ...p, is_public: isPublic } : p)),
      );
      setPublicPlaylists((prev) => {
        const withoutTarget = prev.filter((p) => p.id !== playlistId);
        if (!isPublic) return withoutTarget;
        const fromOwn = playlists.find((p) => p.id === playlistId);
        if (!fromOwn) return withoutTarget;
        return [{ ...fromOwn, is_public: true }, ...withoutTarget];
      });
      toast({ title: isPublic ? 'Playlist published' : 'Playlist made private' });
      return true;
    },
    [playlists, user, toast],
  );

  // Toggle collaborative mode on a playlist (owner only — enforced by RLS too)
  const updatePlaylistCollaborative = useCallback(
    async (playlistId: string, isCollaborative: boolean) => {
      if (!user) return false;
      if (!isSupabaseConfigured) {
        const existing = listPlaylists(user.id);
        const next = existing.map((p) =>
          p.id === playlistId ? { ...p, is_collaborative: isCollaborative } : p,
        );
        savePlaylists(user.id, next);
        setPlaylists(next);
        toast({ title: isCollaborative ? 'Playlist is now collaborative' : 'Playlist is no longer collaborative' });
        return true;
      }

      const { error } = await supabase
        .from('playlists')
        .update({ is_collaborative: isCollaborative } as any)
        .eq('id', playlistId)
        .eq('user_id', user.id);

      if (error) {
        toast({
          title: 'Could not update playlist',
          description: error.message || 'Please try again in a moment.',
          variant: 'destructive',
        });
        return false;
      }

      setPlaylists((prev) =>
        prev.map((p) => (p.id === playlistId ? { ...p, is_collaborative: isCollaborative } : p)),
      );
      toast({ title: isCollaborative ? 'Playlist is now collaborative' : 'Playlist is no longer collaborative' });
      return true;
    },
    [user, toast],
  );

  // Add Song to Playlist
  const addSongToPlaylist = useCallback(async (playlistId: string, songId: string) => {
    if (!user) return;
    if (!isSupabaseConfigured) {
      const songIds = getLocalPlaylistSongs(playlistId);
      if (songIds.includes(songId)) {
        toast({ title: 'Song already in playlist' });
        return;
      }
      setPlaylistSongs(playlistId, [...songIds, songId]);
      toast({ title: 'Song added to playlist!' });
      return;
    }
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
    const { error } = await supabase
      .from('playlist_songs')
      .insert({ playlist_id: playlistId, song_id: songId, position } as any);
    if (error) {
      toast({ title: 'Could not add song to playlist', variant: 'destructive' });
      return;
    }
    toast({ title: 'Song added to playlist!' });
  }, [user, toast]);

  // Remove Song from Playlist
  const removeSongFromPlaylist = useCallback(async (playlistId: string, songId: string) => {
    if (!user) return;
    if (!isSupabaseConfigured) {
      const songIds = getLocalPlaylistSongs(playlistId);
      setPlaylistSongs(playlistId, songIds.filter((id) => id !== songId));
      toast({ title: 'Song removed from playlist' });
      return;
    }
    await supabase.from('playlist_songs').delete().eq('playlist_id', playlistId).eq('song_id', songId);
    toast({ title: 'Song removed from playlist' });
  }, [user, toast]);

  // Get Playlist Songs
  const getPlaylistSongs = useCallback(async (playlistId: string): Promise<string[]> => {
    if (!isSupabaseConfigured) {
      return getLocalPlaylistSongs(playlistId);
    }
    const { data } = await supabase
      .from('playlist_songs')
      .select('song_id')
      .eq('playlist_id', playlistId)
      .order('position', { ascending: true });
    return (data || []).map((r: any) => r.song_id).filter(Boolean);
  }, []);

  // Reorder Playlist Songs — bulk-updates `position` to match orderedSongIds
  const reorderPlaylistSongs = useCallback(async (playlistId: string, orderedSongIds: string[]) => {
    if (!isSupabaseConfigured) {
      setPlaylistSongs(playlistId, orderedSongIds);
      return;
    }
    const results = await Promise.all(
      orderedSongIds.map((songId, index) =>
        supabase
          .from('playlist_songs')
          .update({ position: index } as any)
          .eq('playlist_id', playlistId)
          .eq('song_id', songId),
      ),
    );
    const failed = results.some((r) => r.error);
    if (failed) {
      toast({ title: 'Could not save track order', variant: 'destructive' });
    }
  }, [toast]);

  // Get Playlist Collaborators (joined with audience_profiles, same pattern as useSocial)
  const getPlaylistCollaborators = useCallback(async (playlistId: string): Promise<PlaylistCollaboratorWithProfile[]> => {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase
      .from('playlist_collaborators')
      .select('*')
      .eq('playlist_id', playlistId);
    if (error || !data || data.length === 0) return [];

    const userIds = Array.from(new Set((data as any[]).map((c) => c.user_id).filter(Boolean)));
    const { data: profileData } = await supabase
      .from('audience_profiles')
      .select('id,user_id,display_name,profile_name,username,avatar_url,profile_picture_url,bio')
      .or(`id.in.(${userIds.join(',')}),user_id.in.(${userIds.join(',')})`);

    const profilesMap = new Map<string, any>();
    ((profileData || []) as any[]).forEach((p: any) => {
      profilesMap.set(String(p.id), p);
      if (p?.user_id) profilesMap.set(String(p.user_id), p);
    });

    return (data as any[]).map((c) => ({
      id: c.id,
      playlist_id: c.playlist_id,
      user_id: c.user_id,
      can_edit: c.can_edit,
      created_at: c.created_at,
      profile: profilesMap.get(String(c.user_id)),
    }));
  }, []);

  // Add a collaborator to a playlist (owner only — enforced by RLS)
  const addPlaylistCollaborator = useCallback(async (playlistId: string, userId: string) => {
    if (!user || !isSupabaseConfigured) return false;
    const { error } = await supabase
      .from('playlist_collaborators')
      .insert({ playlist_id: playlistId, user_id: userId } as any);
    if (error) {
      toast({
        title: 'Could not add collaborator',
        description: error.message || 'Please try again in a moment.',
        variant: 'destructive',
      });
      return false;
    }
    toast({ title: 'Collaborator added!' });
    return true;
  }, [user, toast]);

  // Remove a collaborator (owner, or the collaborator removing themselves — enforced by RLS)
  const removePlaylistCollaborator = useCallback(async (playlistId: string, userId: string) => {
    if (!isSupabaseConfigured) return;
    const { error } = await supabase
      .from('playlist_collaborators')
      .delete()
      .eq('playlist_id', playlistId)
      .eq('user_id', userId);
    if (error) {
      toast({ title: 'Could not remove collaborator', variant: 'destructive' });
      return;
    }
    toast({ title: 'Collaborator removed' });
  }, [toast]);

  // Search users by display name / username to add as a playlist collaborator
  const searchUsersByUsername = useCallback(async (query: string) => {
    const q = query.trim();
    if (!q || !isSupabaseConfigured || !user) return [];
    const escaped = q.replace(/[\\%_]/g, '\\$&');
    const { data } = await supabase
      .from('audience_profiles')
      .select('id,user_id,display_name,profile_name,username,avatar_url,profile_picture_url')
      .or(`username.ilike.%${escaped}%,display_name.ilike.%${escaped}%`)
      .limit(8);
    return ((data || []) as any[])
      .filter((p) => p.user_id && p.user_id !== user.id)
      .map((p) => ({
        user_id: p.user_id as string,
        display_name: (p.display_name || p.profile_name || p.username || null) as string | null,
        username: (p.username || null) as string | null,
        avatar_url: (p.avatar_url || p.profile_picture_url || null) as string | null,
      }));
  }, [user]);

  // Check if song is liked
  const isSongLiked = useCallback((songId: string) => likedSongs.includes(songId), [likedSongs]);
  
  // Check if artist is liked
  const isArtistLiked = useCallback((artistId: string) => likedArtists.includes(artistId), [likedArtists]);
  const isCatalogSaved = useCallback((catalogId: string) => savedCatalogs.includes(catalogId), [savedCatalogs]);

  return {
    likedSongs,
    likedArtists,
    savedCatalogs,
    playlists,
    publicPlaylists,
    isLoading,
    toggleLikeSong,
    toggleLikeArtist,
    toggleSaveCatalog,
    isSongLiked,
    isArtistLiked,
    isCatalogSaved,
    createPlaylist,
    deletePlaylist,
    addSongToPlaylist,
    removeSongFromPlaylist,
    getPlaylistSongs,
    reorderPlaylistSongs,
    updatePlaylistVisibility,
    updatePlaylistCollaborative,
    getPlaylistCollaborators,
    addPlaylistCollaborator,
    removePlaylistCollaborator,
    searchUsersByUsername,
  };
}
