import { useRef, useState, type SyntheticEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Music, ListMusic, Send, ImagePlus, UserPlus, X, Loader2, Sparkles } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { SONGS, ARTISTS } from '@/data/musicData';
import { toast } from 'sonner';
import { useMediaUpload } from '@/hooks/useArtistMedia';
import { TagPeople, type TaggablePerson } from '@/components/social/TagPeople';
import { SongCardMaker } from '@/components/social/SongCardMaker';
import type { SongCardData } from '@/types/social';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export const POST_MAX_LENGTH = 1000;
const POST_COUNTER_FROM = 800;

export interface PostExtras {
  mediaUrl?: string | null;
  mediaKind?: 'image' | 'video' | null;
  mediaId?: string | null;
  mediaSource?: 'upload' | 'songcard' | null;
  songcard?: SongCardData | null;
  tagUserIds?: string[];
}

interface PostComposerProps {
  onPost: (
    content: string,
    type: 'text' | 'song_share',
    songId?: string,
    extras?: PostExtras
  ) => void;
  initialType?: 'text' | 'song_share';
  initialSongId?: string;
}

export function PostComposer({ onPost, initialType = 'text', initialSongId }: PostComposerProps) {
  const { audienceProfile, isArtist, user } = useAuth();
  const [content, setContent] = useState('');
  const [postType, setPostType] = useState<'text' | 'song_share'>(initialType);
  const [selectedSong, setSelectedSong] = useState<string>(initialSongId ?? '');
  const [isPosting, setIsPosting] = useState(false);

  /* A picture or a clip, and the people in it.
     Uploading belongs to artists. Everybody makes song cards. */
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ url: string; kind: 'image' | 'video' } | null>(null);
  const [attached, setAttached] = useState<{ url: string; kind: 'image' | 'video'; id: string } | null>(null);
  const [tagged, setTagged] = useState<TaggablePerson[]>([]);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [songcard, setSongcard] = useState<SongCardData | null>(null);
  const [showCardMaker, setShowCardMaker] = useState(false);
  const media = useMediaUpload();

  const clearAttachment = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setAttached(null);
    media.reset();
    if (fileRef.current) fileRef.current.value = '';
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    const kind: 'image' | 'video' = file.type.startsWith('video/') ? 'video' : 'image';
    // Show it straight away from the local file. Waiting on the round trip to
    // storage before anything appears makes the app feel broken on a slow line.
    setPreview({ url: URL.createObjectURL(file), kind });
    const item = await media.upload(file, {});
    if (item) setAttached({ url: item.public_url, kind: item.kind, id: item.id });
  };
  const handleImageError = (event: SyntheticEvent<HTMLImageElement>) => {
    const target = event.currentTarget;
    if (target.dataset.fallbackApplied === 'true') return;
    target.dataset.fallbackApplied = 'true';
    target.src = '/placeholder.svg';
  };

  const handlePost = async () => {
    if (!user) {
      toast.error('Please sign in to post');
      return;
    }
    // A photograph or a song card on its own is a post, so words are only
    // required when there is nothing else in it.
    if (!content.trim() && postType === 'text' && !attached && !songcard) return;
    if (postType === 'song_share' && !selectedSong) return;
    if (preview && !attached) {
      toast.error('Give the upload a moment to finish');
      return;
    }

    setIsPosting(true);
    try {
      await onPost(
        content,
        postType,
        postType === 'song_share' ? selectedSong : undefined,
        {
          mediaUrl: attached?.url ?? null,
          mediaKind: attached?.kind ?? null,
          mediaId: attached?.id ?? null,
          mediaSource: attached ? 'upload' : songcard ? 'songcard' : null,
          songcard,
          tagUserIds: tagged.map((p) => p.user_id),
        }
      );
      setContent('');
      setSelectedSong('');
      setPostType('text');
      setTagged([]);
      setShowTagPicker(false);
      setSongcard(null);
      setShowCardMaker(false);
      clearAttachment();
    } catch (err: any) {
      toast.error('Could not post that', { description: 'Your words are still here. Try again in a moment.' });
    } finally {
      setIsPosting(false);
    }
  };

  const getArtistName = (artistId: string) => {
    return ARTISTS.find(a => a.id === artistId)?.name || 'Unknown Artist';
  };

  const songs = Array.from(
    new Map(SONGS.map((song) => [song.id, song])).values(),
  );

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden flex-shrink-0">
          {audienceProfile?.profile_picture_url ? (
            <img 
              src={audienceProfile.profile_picture_url} 
              alt="Profile" 
              className="w-full h-full object-contain"
              onError={handleImageError}
            />
          ) : (
            <span className="text-primary font-bold">
              {audienceProfile?.profile_name?.charAt(0) || '?'}
            </span>
          )}
        </div>
        <div className="flex-1 space-y-3">
          <Textarea
            placeholder="Share what you're listening to..."
            value={content}
            maxLength={POST_MAX_LENGTH}
            onChange={(e) => setContent(e.target.value.slice(0, POST_MAX_LENGTH))}
            className="min-h-[80px] resize-none bg-background/50 border-border/50"
          />
          {/* The count only appears once it matters. A counter from the first
              character reads as a limit before anyone has hit one. */}
          {content.length > POST_COUNTER_FROM && (
            <p
              className={`text-right text-xs tabular-nums ${
                content.length >= POST_MAX_LENGTH ? 'text-destructive' : 'text-muted-foreground'
              }`}
              aria-live="polite"
            >
              {content.length}/{POST_MAX_LENGTH}
            </p>
          )}
          
          {postType === 'song_share' && (
            <Select value={selectedSong} onValueChange={setSelectedSong}>
              <SelectTrigger className="bg-background/50">
                <SelectValue placeholder="Select a song to share" />
              </SelectTrigger>
              <SelectContent>
                {songs.map(song => (
                  <SelectItem key={song.id} value={song.id}>
                    {song.title} - {getArtistName(song.artistId)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {preview && (
            <div className="relative overflow-hidden rounded-xl border border-border">
              {preview.kind === 'video' ? (
                <video src={preview.url} className="max-h-72 w-full bg-black object-contain" controls playsInline />
              ) : (
                <img src={preview.url} alt="" className="max-h-72 w-full bg-black object-contain" />
              )}
              <button
                type="button"
                onClick={clearAttachment}
                aria-label="Remove this attachment"
                className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white"
              >
                <X className="h-4 w-4" />
              </button>
              {media.phase === 'uploading' && (
                <div className="absolute inset-x-0 bottom-0 bg-black/70 px-3 py-1.5 text-[11px] text-white">
                  Uploading {media.progress}%
                </div>
              )}
              {media.phase === 'error' && (
                <div className="absolute inset-x-0 bottom-0 bg-destructive px-3 py-1.5 text-[11px] text-destructive-foreground">
                  {media.error}
                </div>
              )}
            </div>
          )}

          {showCardMaker && <SongCardMaker value={songcard} onChange={setSongcard} />}

          {tagged.length > 0 && !showTagPicker && (
            <p className="text-xs text-muted-foreground">
              With{' '}
              <span className="font-medium text-foreground">
                {tagged.map((p) => p.display_name).join(', ')}
              </span>
            </p>
          )}

          {showTagPicker && (
            <TagPeople selected={tagged} onChange={setTagged} onClose={() => setShowTagPicker(false)} />
          )}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm"
        className="hidden"
        onChange={(e) => void pickFile(e.target.files?.[0])}
      />

      <div className="flex items-center justify-between pt-2 border-t border-border/30">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={postType === 'text' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setPostType('text')}
            className="gap-1"
          >
            <ListMusic className="w-4 h-4" />
            Text
          </Button>
          <Button
            variant={postType === 'song_share' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setPostType('song_share')}
            className="gap-1"
          >
            <Music className="w-4 h-4" />
            Share Song
          </Button>
          {/* Uploading photos and video is for artist pages. Rather than show
              the audience a button that refuses them, they get the song card,
              which is a thing they can actually make. */}
          {isArtist ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={media.phase === 'uploading' || media.phase === 'preparing'}
              className="gap-1"
            >
              {media.phase === 'uploading' || media.phase === 'preparing' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ImagePlus className="w-4 h-4" />
              )}
              Photo or video
            </Button>
          ) : (
            <Button
              variant={songcard ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setShowCardMaker((v) => !v)}
              className="gap-1"
            >
              <Sparkles className="w-4 h-4" />
              {songcard ? 'Card ready' : 'Make a song card'}
            </Button>
          )}
          <Button
            variant={tagged.length > 0 ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setShowTagPicker((v) => !v)}
            className="gap-1"
          >
            <UserPlus className="w-4 h-4" />
            {tagged.length > 0 ? `${tagged.length} tagged` : 'Tag people'}
          </Button>
        </div>
        <Button
          onClick={handlePost}
          disabled={
            isPosting ||
            (!content.trim() && postType === 'text' && !attached && !songcard) ||
            (postType === 'song_share' && !selectedSong)
          }
          size="sm"
          className="gap-1"
        >
          <Send className="w-4 h-4" />
          Post
        </Button>
      </div>
    </div>
  );
}
