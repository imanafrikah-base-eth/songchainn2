import { artistPath } from '@/lib/slugRoutes';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListMusic, ListPlus, MoreHorizontal, Share2, User } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AddToPlaylistDialog } from '@/components/song/AddToPlaylistDialog';
import { usePlayerActions } from '@/context/PlayerContext';
import { useAuth } from '@/context/AuthContext';
import { useShare } from '@/hooks/useShare';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Song } from '@/data/musicData';

/**
 * The overflow menu on a song card: the things you want to do to a song from
 * a list without opening it. Every click inside is stopped so the card
 * underneath never starts playback. The menu and the dialog both render in
 * portals, and React still bubbles their synthetic events to this wrapper,
 * which is exactly why the wrapper is the thing that stops them.
 */
export function SongMenu({
  song,
  className,
  align = 'end',
}: {
  song: Song;
  className?: string;
  align?: 'start' | 'end';
}) {
  const navigate = useNavigate();
  const { addToQueue } = usePlayerActions();
  const { user } = useAuth();
  const { shareSong } = useShare();
  const [playlistOpen, setPlaylistOpen] = useState(false);

  const stop = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
  }, []);

  const handleAddToQueue = useCallback(() => {
    addToQueue(song);
    toast({ title: 'Added to queue', description: `${song.title} will play after the current queue.` });
  }, [addToQueue, song]);

  const handleAddToPlaylist = useCallback(() => {
    if (!user) {
      toast({ title: 'Sign in to save playlists', variant: 'destructive' });
      return;
    }
    setPlaylistOpen(true);
  }, [user]);

  const handleShare = useCallback(() => {
    void shareSong(song.title, song.artist, song.id, song.coverImage);
  }, [shareSong, song]);

  const handleGoToArtist = useCallback(() => {
    navigate(artistPath(song.artistId));
  }, [navigate, song.artistId]);

  return (
    <span className="inline-flex" onClick={stop}>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="More options"
            className={cn(
              'p-1.5 sm:p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors min-h-11 min-w-11 inline-flex items-center justify-center',
              className,
            )}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-48" onClick={stop}>
          <DropdownMenuItem onSelect={handleAddToQueue}>
            <ListPlus className="w-4 h-4 mr-2" />
            Add to queue
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleAddToPlaylist}>
            <ListMusic className="w-4 h-4 mr-2" />
            Add to playlist
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleShare}>
            <Share2 className="w-4 h-4 mr-2" />
            Share
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleGoToArtist}>
            <User className="w-4 h-4 mr-2" />
            Go to artist
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {playlistOpen && (
        <AddToPlaylistDialog open={playlistOpen} onOpenChange={setPlaylistOpen} songId={song.id} />
      )}
    </span>
  );
}

export default SongMenu;
