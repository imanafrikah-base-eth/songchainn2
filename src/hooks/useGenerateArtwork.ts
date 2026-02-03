import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface GeneratedArtwork {
  imageUrl: string;
  isLoading: boolean;
  error: string | null;
}

// Cache for generated artwork to avoid regenerating
const artworkCache = new Map<string, string>();

export function useGenerateArtwork(songTitle: string, artistName: string) {
  const [artwork, setArtwork] = useState<GeneratedArtwork>({
    imageUrl: '',
    isLoading: false,
    error: null,
  });

  const generateArtwork = async () => {
    const cacheKey = `${songTitle}-${artistName}`;
    
    // Check cache first
    if (artworkCache.has(cacheKey)) {
      setArtwork({
        imageUrl: artworkCache.get(cacheKey)!,
        isLoading: false,
        error: null,
      });
      return;
    }

    setArtwork(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const { data, error } = await supabase.functions.invoke('generate-artwork', {
        body: { songTitle, artistName },
      });

      if (error) {
        throw new Error(error.message || 'Failed to generate artwork');
      }

      if (data?.imageUrl) {
        artworkCache.set(cacheKey, data.imageUrl);
        setArtwork({
          imageUrl: data.imageUrl,
          isLoading: false,
          error: null,
        });
      } else if (data?.error) {
        throw new Error(data.error);
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Artwork generation error:', err);
      }
      setArtwork({
        imageUrl: '',
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to generate artwork',
      });
    }
  };

  return {
    ...artwork,
    generateArtwork,
  };
}

// Hook for batch generation with rate limiting
export function useBatchGenerateArtwork() {
  const [artworks, setArtworks] = useState<Map<string, string>>(new Map());
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const generateBatch = async (songs: { id: string; title: string; artist: string }[]) => {
    setIsGenerating(true);
    setProgress({ current: 0, total: songs.length });

    for (let i = 0; i < songs.length; i++) {
      const song = songs[i];
      const cacheKey = `${song.title}-${song.artist}`;
      
      // Skip if already cached
      if (artworkCache.has(cacheKey)) {
        setArtworks(prev => new Map(prev).set(song.id, artworkCache.get(cacheKey)!));
        setProgress({ current: i + 1, total: songs.length });
        continue;
      }

      try {
        const { data, error } = await supabase.functions.invoke('generate-artwork', {
          body: { songTitle: song.title, artistName: song.artist },
        });

        if (!error && data?.imageUrl) {
          artworkCache.set(cacheKey, data.imageUrl);
          setArtworks(prev => new Map(prev).set(song.id, data.imageUrl));
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error(`Failed to generate artwork for ${song.title}:`, err);
        }
      }

      setProgress({ current: i + 1, total: songs.length });
      
      // Rate limiting: wait 1 second between requests
      if (i < songs.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    setIsGenerating(false);
  };

  return {
    artworks,
    isGenerating,
    progress,
    generateBatch,
    getArtwork: (songId: string) => artworks.get(songId),
  };
}
