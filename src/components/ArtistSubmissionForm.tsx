import { useState } from 'react';
import { Loader2, Send, Plus, X, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { uploadArtistSubmissionFile } from '@/lib/storage';
import { toast } from 'sonner';

const MAX_SONGS = 7;
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB, matches the artist-uploads bucket limit
const WALLET_PATTERN = /^(0x[a-fA-F0-9]{40}|[a-zA-Z0-9_-]+\.eth)$/;

interface SongEntry {
  key: string;
  title: string;
  audioFile: File | null;
  coverFile: File | null;
}

const emptySong = (): SongEntry => ({
  key: crypto.randomUUID(),
  title: '',
  audioFile: null,
  coverFile: null,
});

const isAudioFile = (file: File) =>
  file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name);

const isImageFile = (file: File) =>
  file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(file.name);

export function ArtistSubmissionForm() {
  const { user } = useAuth();
  const [realName, setRealName] = useState('');
  const [artistName, setArtistName] = useState('');
  const [location, setLocation] = useState('');
  const [reason, setReason] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [songs, setSongs] = useState<SongEntry[]>([emptySong()]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState('');

  const updateSong = (key: string, patch: Partial<SongEntry>) => {
    setSongs((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  };

  const addSong = () => {
    if (songs.length >= MAX_SONGS) return;
    setSongs((prev) => [...prev, emptySong()]);
  };

  const removeSong = (key: string) => {
    setSongs((prev) => (prev.length > 1 ? prev.filter((s) => s.key !== key) : prev));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!realName.trim() || !artistName.trim() || !location.trim() || !reason.trim() || !walletAddress.trim()) {
      toast.error('Please fill in every field.');
      return;
    }

    if (!WALLET_PATTERN.test(walletAddress.trim())) {
      toast.error('Enter a valid wallet address (0x...) or .eth name.');
      return;
    }

    const readySongs = songs.filter((s) => s.title.trim() || s.audioFile);
    if (readySongs.length === 0) {
      toast.error('Add at least one song.');
      return;
    }
    for (const song of readySongs) {
      if (!song.title.trim() || !song.audioFile) {
        toast.error('Every song needs a title and an audio file.');
        return;
      }
      if (!isAudioFile(song.audioFile)) {
        toast.error(`"${song.title || song.audioFile.name}" isn't a recognized audio file.`);
        return;
      }
      if (song.audioFile.size > MAX_FILE_SIZE) {
        toast.error(`"${song.title}" audio file is over 25MB.`);
        return;
      }
      if (song.coverFile && (!isImageFile(song.coverFile) || song.coverFile.size > MAX_FILE_SIZE)) {
        toast.error(`"${song.title}" cover art must be an image under 25MB.`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const submissionId = crypto.randomUUID();
      const uploadedSongs = [];

      for (let i = 0; i < readySongs.length; i++) {
        const song = readySongs[i];
        setProgress(`Uploading song ${i + 1} of ${readySongs.length}...`);

        const audioPath = await uploadArtistSubmissionFile({
          submissionId,
          label: `song-${i + 1}-audio`,
          file: song.audioFile!,
        });

        let coverPath: string | null = null;
        if (song.coverFile) {
          coverPath = await uploadArtistSubmissionFile({
            submissionId,
            label: `song-${i + 1}-cover`,
            file: song.coverFile,
          });
        }

        uploadedSongs.push({ title: song.title.trim(), audioPath, coverPath });
      }

      setProgress('Sending your submission...');
      const { data, error } = await supabase.functions.invoke('submit-artist-application', {
        body: {
          realName: realName.trim(),
          artistName: artistName.trim(),
          location: location.trim(),
          reason: reason.trim(),
          contactEmail: user?.email || null,
          walletAddress: walletAddress.trim(),
          songs: uploadedSongs,
        },
      });

      if (error || (data as any)?.error) {
        throw new Error(error?.message || (data as any)?.error || 'Something went wrong.');
      }

      toast.success("Sent! We'll be in touch soon.");
      setRealName('');
      setArtistName('');
      setLocation('');
      setReason('');
      setWalletAddress('');
      setSongs([emptySong()]);
    } catch (err: any) {
      toast.error('Could not send your submission', {
        description: err?.message || 'Please try again in a moment.',
      });
    } finally {
      setIsSubmitting(false);
      setProgress('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="artist-real-name">Your real name</Label>
          <Input
            id="artist-real-name"
            value={realName}
            onChange={(e) => setRealName(e.target.value)}
            placeholder="Jane Doe"
            disabled={isSubmitting}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="artist-name">Artist name</Label>
          <Input
            id="artist-name"
            value={artistName}
            onChange={(e) => setArtistName(e.target.value)}
            placeholder="How you perform"
            disabled={isSubmitting}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="artist-location">Location</Label>
          <Input
            id="artist-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="City, Country"
            disabled={isSubmitting}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="artist-wallet">Preferred wallet address</Label>
          <Input
            id="artist-wallet"
            value={walletAddress}
            onChange={(e) => setWalletAddress(e.target.value)}
            placeholder="0x... or you.eth"
            disabled={isSubmitting}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="artist-reason">Why do you want to be on $ongChainn?</Label>
        <Textarea
          id="artist-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Tell us about your music and why $ongChainn is the right home for it."
          className="min-h-28"
          disabled={isSubmitting}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Songs (up to {MAX_SONGS})</Label>
          <span className="text-xs text-muted-foreground">{songs.length}/{MAX_SONGS}</span>
        </div>

        {songs.map((song, i) => (
          <div key={song.key} className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Music className="w-3.5 h-3.5" />
                Song {i + 1}
              </div>
              {songs.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeSong(song.key)}
                  disabled={isSubmitting}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  aria-label="Remove song"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <Input
              value={song.title}
              onChange={(e) => updateSong(song.key, { title: e.target.value })}
              placeholder="Song title"
              disabled={isSubmitting}
            />

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Audio file</Label>
                <input
                  type="file"
                  accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
                  onChange={(e) => updateSong(song.key, { audioFile: e.target.files?.[0] || null })}
                  disabled={isSubmitting}
                  className="w-full text-xs text-muted-foreground file:mr-2 file:rounded-full file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary hover:file:bg-primary/20"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Cover art (optional)</Label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => updateSong(song.key, { coverFile: e.target.files?.[0] || null })}
                  disabled={isSubmitting}
                  className="w-full text-xs text-muted-foreground file:mr-2 file:rounded-full file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary hover:file:bg-primary/20"
                />
              </div>
            </div>
          </div>
        ))}

        {songs.length < MAX_SONGS && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addSong}
            disabled={isSubmitting}
            className="gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Add another song
          </Button>
        )}
      </div>

      <Button type="submit" className="w-full sm:w-auto gradient-primary text-primary-foreground gap-2" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {isSubmitting ? (progress || 'Submitting...') : 'Submit Your Music'}
      </Button>
    </form>
  );
}
