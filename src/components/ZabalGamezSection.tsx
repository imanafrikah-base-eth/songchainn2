import { useCallback, useEffect, useState } from 'react';
import { Loader2, Download, Send, Music, ExternalLink, Trophy, Mic, Flame, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { uploadZabalVerse } from '@/lib/storage';
import { TileBackdrop } from '@/components/AmbientBackground';
import { CARD_TILES } from '@/data/backgroundPools';
import { toast } from 'sonner';

const CYPHER_BEAT_URL = '/zabal-gamez-cypher-beat.mp3';
const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB, matches the zabal-gamez bucket limit

interface ZabalEntry {
  id: string;
  artist_name: string;
  verse_audio_url: string | null;
  tiktok_url: string | null;
  created_at: string;
}

const isAudioFile = (file: File) =>
  file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name);

export function ZabalGamezSection({ source = 'app' }: { source?: string }) {
  const { user } = useAuth();
  const [artistName, setArtistName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [verseFile, setVerseFile] = useState<File | null>(null);
  const [tiktokUrl, setTiktokUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState('');
  const [entries, setEntries] = useState<ZabalEntry[]>([]);
  const [downloadCount, setDownloadCount] = useState<number | null>(null);

  useEffect(() => {
    if (user?.email) setContactEmail((prev) => prev || user.email!);
  }, [user?.email]);

  const loadEntries = useCallback(async () => {
    const { data, error } = await supabase
      .from('zabal_gamez_entries')
      .select('id, artist_name, verse_audio_url, tiktok_url, created_at')
      .order('created_at', { ascending: false })
      .limit(60);
    if (!error && data) setEntries(data as ZabalEntry[]);
  }, []);

  const loadDownloadCount = useCallback(async () => {
    const { count, error } = await supabase
      .from('zabal_gamez_beat_downloads')
      .select('id', { count: 'exact', head: true });
    if (!error && typeof count === 'number') setDownloadCount(count);
  }, []);

  useEffect(() => {
    loadEntries();
    loadDownloadCount();
  }, [loadEntries, loadDownloadCount]);

  const handleBeatDownload = () => {
    // Fire and forget: record the download + notify the admin. The <a download>
    // itself keeps working even if this call fails.
    setDownloadCount((prev) => (typeof prev === 'number' ? prev + 1 : prev));
    supabase.functions
      .invoke('track-zabal-download', { body: { source } })
      .catch(() => void 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!artistName.trim()) {
      toast.error('Add your artist name so we know who dropped the verse.');
      return;
    }

    const hasTiktok = /^https?:\/\/\S+$/i.test(tiktokUrl.trim());
    if (!verseFile && !hasTiktok) {
      toast.error('Upload your verse or drop a TikTok video link.');
      return;
    }

    if (verseFile) {
      if (!isAudioFile(verseFile)) {
        toast.error("That verse file isn't a recognized audio file.");
        return;
      }
      if (verseFile.size > MAX_FILE_SIZE) {
        toast.error('Your verse audio is over 30MB.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      let verseAudioUrl: string | null = null;
      if (verseFile) {
        setProgress('Uploading your verse...');
        verseAudioUrl = await uploadZabalVerse({ file: verseFile });
      }

      setProgress('Sending your entry...');
      const { data, error } = await supabase.functions.invoke('submit-zabal-entry', {
        body: {
          artistName: artistName.trim(),
          contactEmail: contactEmail.trim() || null,
          verseAudioUrl,
          tiktokUrl: hasTiktok ? tiktokUrl.trim() : null,
        },
      });

      if (error || (data as { error?: string })?.error) {
        throw new Error(error?.message || (data as { error?: string })?.error || 'Something went wrong.');
      }

      toast.success('Your Zabal Gamez entry is live. Big up!');
      setArtistName('');
      setVerseFile(null);
      setTiktokUrl('');
      const fileInput = document.getElementById('zabal-verse-file') as HTMLInputElement | null;
      if (fileInput) fileInput.value = '';
      loadEntries();
    } catch (err) {
      toast.error('Could not send your entry', {
        description: err instanceof Error ? err.message : 'Please try again in a moment.',
      });
    } finally {
      setIsSubmitting(false);
      setProgress('');
    }
  };

  return (
    <div className="glass-card rounded-2xl overflow-hidden shine-overlay scroll-mt-24">
      {/* Hero header with cypher-circle backdrop */}
      <div className="relative isolate overflow-hidden p-5 sm:p-7 min-h-[11rem] flex flex-col justify-end">
        <TileBackdrop image={CARD_TILES.waveWarz} opacity={0.5} />
        <div className="flex items-center gap-2 mb-2">
          <div className="p-2 rounded-xl bg-orange-500/20 backdrop-blur-sm">
            <Trophy className="w-5 h-5 text-orange-400" />
          </div>
          <h2 className="font-heading text-lg sm:text-2xl font-bold text-foreground">
            Zabal Gamez, Musician Track
          </h2>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-2xl">
          A free build-a-thon by THE ZAO, the onchain community behind Surfboard Onchain and
          $ongChainn. Open to every artist, any skill level, no fees. Grab the cypher beat, lay
          your verse, and enter.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background/70 border border-orange-500/30 text-[11px] sm:text-xs text-orange-400 font-medium">
            <Flame className="w-3.5 h-3.5" />
            {downloadCount === null ? 'Beat downloads loading...' : `${downloadCount} beat download${downloadCount === 1 ? '' : 's'}`}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background/70 border border-primary/30 text-[11px] sm:text-xs text-primary font-medium">
            <Users className="w-3.5 h-3.5" />
            {`${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} on the wall`}
          </span>
          <a
            href="https://zabalgamez.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-background/70 border border-border/60 text-[11px] sm:text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            zabalgamez.com <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      <div className="p-5 sm:p-7 pt-4 sm:pt-5 space-y-5 sm:space-y-6">
        <p className="text-xs sm:text-sm text-muted-foreground">
          You do not need a $ongChainn account to enter.
        </p>

        {/* How to enter, studio-mic backdrop */}
        <div className="relative isolate overflow-hidden rounded-2xl border border-border/60 p-4 sm:p-5 space-y-3">
          <TileBackdrop image={CARD_TILES.makeMusic} opacity={0.3} />
          <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
            <Mic className="w-4 h-4 text-orange-400" />
            How to enter
          </p>
          <ol className="list-decimal pl-5 space-y-1.5 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            <li>Download the cypher beat below.</li>
            <li>Record your verse on it.</li>
            <li>
              Upload your verse audio here, or film a short video performing it and post that to TikTok.
            </li>
            <li>
              In the TikTok video, say "This is a Zabal Gamez entry" and shout out THE ZAO,
              Surfboard Onchain and $ongChainn, then drop the video link below.
            </li>
          </ol>
          <div className="pt-1">
            <a
              href={CYPHER_BEAT_URL}
              download="Zabal Gamez Cypher Beat.mp3"
              onClick={handleBeatDownload}
            >
              <Button
                type="button"
                className="gap-2 bg-orange-500/90 hover:bg-orange-500 text-white border-0 shadow-lg"
              >
                <Download className="w-4 h-4" />
                Download Cypher Beat
              </Button>
            </a>
          </div>
        </div>

        {/* Entry form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="zabal-artist">Artist name</Label>
              <Input
                id="zabal-artist"
                value={artistName}
                onChange={(e) => setArtistName(e.target.value)}
                placeholder="How you perform"
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="zabal-email">Contact email (optional)</Label>
              <Input
                id="zabal-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="you@email.com"
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="zabal-verse-file">Upload your verse (audio)</Label>
              <input
                id="zabal-verse-file"
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
                onChange={(e) => setVerseFile(e.target.files?.[0] || null)}
                disabled={isSubmitting}
                className="w-full text-xs text-muted-foreground file:mr-2 file:rounded-full file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary hover:file:bg-primary/20"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="zabal-tiktok">TikTok video link</Label>
              <Input
                id="zabal-tiktok"
                value={tiktokUrl}
                onChange={(e) => setTiktokUrl(e.target.value)}
                placeholder="https://www.tiktok.com/@you/video/..."
                disabled={isSubmitting}
              />
            </div>
          </div>

          <p className="text-[11px] sm:text-xs text-muted-foreground">
            Add your verse audio, a TikTok link, or both. At least one is required.
          </p>

          <Button
            type="submit"
            className="w-full sm:w-auto gradient-primary text-primary-foreground gap-2"
            disabled={isSubmitting}
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {isSubmitting ? (progress || 'Submitting...') : 'Enter the Cypher'}
          </Button>
        </form>

        {/* Live wall */}
        {entries.length > 0 && (
          <div className="relative isolate overflow-hidden rounded-2xl border border-border/60 p-4 sm:p-5 space-y-3">
            <TileBackdrop image={CARD_TILES.signupCrowd} opacity={0.22} />
            <div className="flex items-center gap-1.5">
              <Music className="w-4 h-4 text-primary" />
              <p className="text-sm font-medium text-foreground">Live entries</p>
              <span className="text-xs text-muted-foreground">({entries.length})</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl border border-border/60 bg-background/75 backdrop-blur-sm p-3 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground truncate">
                      {entry.artist_name}
                    </span>
                    {entry.tiktok_url && (
                      <a
                        href={entry.tiktok_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
                      >
                        TikTok <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  {entry.verse_audio_url && (
                    <audio controls preload="none" src={entry.verse_audio_url} className="w-full h-9">
                      Your browser does not support audio playback.
                    </audio>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
