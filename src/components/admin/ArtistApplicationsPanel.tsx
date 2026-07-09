import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Music, ExternalLink, CheckCircle2, XCircle, Wallet, MapPin, Mail, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ARTISTS, GENRES, type Genre } from '@/data/musicData';
import { usePublishedCatalog } from '@/hooks/usePublishedCatalog';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

interface AppSong {
  title: string;
  audio_path: string;
  cover_path: string | null;
  status: 'pending' | 'published' | 'rejected';
  published_song_id?: string;
}

interface ArtistApplication {
  id: string;
  real_name: string;
  artist_name: string;
  location: string;
  reason: string;
  contact_email: string | null;
  wallet_address: string;
  songs: AppSong[];
  created_at: string;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'artist';
}

function useArtistApplications() {
  return useQuery({
    queryKey: ['artist-applications'],
    queryFn: async (): Promise<ArtistApplication[]> => {
      const { data, error } = await supabase
        .from('artist_applications')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ArtistApplication[];
    },
    staleTime: 10_000,
  });
}

function SongRow({
  app,
  song,
  index,
  onChanged,
}: {
  app: ArtistApplication;
  song: AppSong;
  index: number;
  onChanged: () => void;
}) {
  const { artists: publishedArtists } = usePublishedCatalog();
  const allArtists = useMemo(() => [...ARTISTS, ...publishedArtists], [publishedArtists]);

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [genre, setGenre] = useState<Genre>('Afro');
  const [artistChoice, setArtistChoice] = useState<string>('__new__');
  const [isPublishing, setIsPublishing] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  const loadPreview = async () => {
    if (audioUrl || isLoadingPreview) return;
    setIsLoadingPreview(true);
    try {
      const { data: audioSigned } = await supabase.storage
        .from('artist-uploads')
        .createSignedUrl(song.audio_path, 3600);
      if (audioSigned?.signedUrl) setAudioUrl(audioSigned.signedUrl);

      if (song.cover_path) {
        const { data: coverSigned } = await supabase.storage
          .from('artist-uploads')
          .createSignedUrl(song.cover_path, 3600);
        if (coverSigned?.signedUrl) setCoverUrl(coverSigned.signedUrl);
      }
    } catch {
      toast({ title: 'Could not load preview', variant: 'destructive' });
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const updateSongStatus = async (status: AppSong['status'], publishedSongId?: string) => {
    const nextSongs = [...app.songs];
    nextSongs[index] = { ...song, status, published_song_id: publishedSongId };
    const { error } = await supabase
      .from('artist_applications')
      .update({ songs: nextSongs as unknown as import('@/integrations/supabase/types').Json })
      .eq('id', app.id);
    if (error) throw error;
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      const ext = song.audio_path.includes('.') ? song.audio_path.split('.').pop() : 'mp3';
      const newSongId = crypto.randomUUID();

      const { data: audioBlob, error: downloadErr } = await supabase.storage
        .from('artist-uploads')
        .download(song.audio_path);
      if (downloadErr || !audioBlob) throw downloadErr ?? new Error('Failed to download audio');

      const audioDestPath = `${newSongId}.${ext}`;
      const { error: audioUploadErr } = await supabase.storage
        .from('songs-audio')
        .upload(audioDestPath, audioBlob, { contentType: audioBlob.type || 'audio/mpeg' });
      if (audioUploadErr) throw audioUploadErr;
      const { data: audioPublic } = supabase.storage.from('songs-audio').getPublicUrl(audioDestPath);

      let coverPublicUrl: string | null = null;
      let linkedArtist = artistChoice !== '__new__' ? allArtists.find((a) => a.id === artistChoice) : null;

      if (song.cover_path) {
        const coverExt = song.cover_path.includes('.') ? song.cover_path.split('.').pop() : 'jpg';
        const { data: coverBlob, error: coverDownloadErr } = await supabase.storage
          .from('artist-uploads')
          .download(song.cover_path);
        if (!coverDownloadErr && coverBlob) {
          const coverDestPath = `published/${newSongId}.${coverExt}`;
          const { error: coverUploadErr } = await supabase.storage
            .from('covers')
            .upload(coverDestPath, coverBlob, { contentType: coverBlob.type || 'image/jpeg' });
          if (!coverUploadErr) {
            const { data: coverPublic } = supabase.storage.from('covers').getPublicUrl(coverDestPath);
            coverPublicUrl = coverPublic?.publicUrl ?? null;
          }
        }
      }

      const artistId = linkedArtist ? linkedArtist.id : `app-${slugify(app.artist_name)}`;
      const townSquare = linkedArtist?.townSquare ?? 'Livingstone Town Square';

      const { error: insertErr } = await supabase.from('songs').insert({
        id: newSongId,
        title: song.title,
        artist_name: app.artist_name,
        audio_url: audioPublic.publicUrl,
        cover_art_url: coverPublicUrl ?? linkedArtist?.profileImage ?? null,
        artist_image_url: linkedArtist?.profileImage ?? null,
        is_published: true,
        genre,
        town_square: townSquare,
        artist_id: artistId,
      });
      if (insertErr) throw insertErr;

      await updateSongStatus('published', newSongId);
      toast({ title: `"${song.title}" is live`, description: 'It now appears in Discover, Search and the artist page.' });
      onChanged();
    } catch (err: any) {
      toast({ title: 'Publish failed', description: err?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleReject = async () => {
    setIsRejecting(true);
    try {
      await updateSongStatus('rejected');
      onChanged();
    } catch (err: any) {
      toast({ title: 'Could not update', description: err?.message, variant: 'destructive' });
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-primary shrink-0" />
          <span className="font-medium text-foreground">{song.title}</span>
        </div>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            song.status === 'published'
              ? 'bg-emerald-500/15 text-emerald-400'
              : song.status === 'rejected'
              ? 'bg-destructive/15 text-destructive'
              : 'bg-amber-500/15 text-amber-400'
          }`}
        >
          {song.status}
        </span>
      </div>

      {song.status === 'pending' && (
        <>
          {!audioUrl ? (
            <Button size="sm" variant="outline" onClick={loadPreview} disabled={isLoadingPreview} className="gap-1.5">
              {isLoadingPreview ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
              Load preview
            </Button>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
              <audio controls src={audioUrl} className="h-9 w-full sm:w-64" />
              {coverUrl && (
                <img src={coverUrl} alt="Cover art" className="w-12 h-12 rounded-md object-cover border border-border/60" />
              )}
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Genre</label>
              <select
                value={genre}
                onChange={(e) => setGenre(e.target.value as Genre)}
                className="w-full text-sm rounded-md border border-border bg-background px-2 py-1.5"
              >
                {GENRES.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Artist</label>
              <select
                value={artistChoice}
                onChange={(e) => setArtistChoice(e.target.value)}
                className="w-full text-sm rounded-md border border-border bg-background px-2 py-1.5"
              >
                <option value="__new__">+ New artist: {app.artist_name}</option>
                {allArtists.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={handlePublish} disabled={isPublishing || isRejecting} className="gap-1.5 gradient-primary text-primary-foreground">
              {isPublishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Publish
            </Button>
            <Button size="sm" variant="ghost" onClick={handleReject} disabled={isPublishing || isRejecting} className="gap-1.5 text-destructive hover:text-destructive">
              {isRejecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
              Reject
            </Button>
          </div>
        </>
      )}

      {song.status === 'published' && song.published_song_id && (
        <a href={`/song/${song.published_song_id}`} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
          View live song <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}

function ApplicationCard({ app, onChanged }: { app: ArtistApplication; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const pendingCount = app.songs.filter((s) => s.status === 'pending').length;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-secondary/20 transition-colors"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-heading font-semibold text-foreground truncate">{app.artist_name}</span>
            <span className="text-xs text-muted-foreground">({app.real_name})</span>
            {pendingCount > 0 && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
                {pendingCount} pending
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
            <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{app.location}</span>
            <span className="inline-flex items-center gap-1"><Music className="w-3 h-3" />{app.songs.length} song{app.songs.length === 1 ? '' : 's'}</span>
            {app.contact_email && <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" />{app.contact_email}</span>}
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/60 pt-3">
          <p className="text-sm text-muted-foreground italic">"{app.reason}"</p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Wallet className="w-3.5 h-3.5" />
            <span className="font-mono">{app.wallet_address}</span>
          </div>
          <div className="space-y-2">
            {app.songs.map((song, i) => (
              <SongRow key={`${app.id}-${i}`} app={app} song={song} index={i} onChanged={onChanged} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ArtistApplicationsPanel() {
  const { data: applications = [], isLoading, refetch } = useArtistApplications();
  const queryClient = useQueryClient();

  const handleChanged = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ['published-catalog'] });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading applications...
      </div>
    );
  }

  if (applications.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        No artist applications yet. New submissions from the About page will show up here.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {applications.map((app) => (
        <ApplicationCard key={app.id} app={app} onChanged={handleChanged} />
      ))}
    </div>
  );
}
