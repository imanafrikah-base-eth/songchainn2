import { useCallback, useState } from 'react';
import { Globe, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAudienceInteractions } from '@/hooks/useAudienceInteractions';

/**
 * Pick one of your playlists, or make a new one, and drop a song into it.
 *
 * Lifted out of SongDetail so a song card's menu can offer the same thing.
 * The hook owns the playlists, so the dialog needs nothing but the song.
 */
export function AddToPlaylistDialog({
  open,
  onOpenChange,
  songId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  songId: string;
}) {
  const { playlists, addSongToPlaylist, createPlaylist } = useAudienceInteractions();
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDescription, setNewPlaylistDescription] = useState('');
  const [newPlaylistIsPublic, setNewPlaylistIsPublic] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddToExisting = useCallback(async (playlistId: string) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await addSongToPlaylist(playlistId, songId);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  }, [addSongToPlaylist, isSubmitting, onOpenChange, songId]);

  const handleCreateAndAdd = useCallback(async () => {
    if (!newPlaylistName.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const playlist = await createPlaylist(
        newPlaylistName.trim(),
        newPlaylistDescription.trim() || undefined,
        newPlaylistIsPublic,
      );
      if (playlist) {
        await addSongToPlaylist(playlist.id, songId);
        onOpenChange(false);
        setNewPlaylistName('');
        setNewPlaylistDescription('');
        setNewPlaylistIsPublic(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [addSongToPlaylist, createPlaylist, isSubmitting, newPlaylistDescription, newPlaylistIsPublic, newPlaylistName, onOpenChange, songId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm w-[95vw] sm:w-full">
        <DialogHeader>
          <DialogTitle>Add to playlist</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {playlists.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Choose one of your playlists</p>
              <ScrollArea className="max-h-48 pr-2">
                <div className="space-y-2">
                  {playlists.map((playlist) => (
                    <Button
                      key={playlist.id}
                      type="button"
                      variant="outline"
                      className="w-full justify-between"
                      onClick={() => void handleAddToExisting(playlist.id)}
                      disabled={isSubmitting}
                    >
                      <span className="truncate">{playlist.name}</span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        {playlist.is_public ? (
                          <>
                            <Globe className="w-3 h-3" />
                            Public
                          </>
                        ) : (
                          <>
                            <Lock className="w-3 h-3" />
                            Private
                          </>
                        )}
                      </span>
                    </Button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="new-playlist-name">
              {playlists.length > 0 ? 'Or create a new playlist' : 'Create a new playlist'}
            </Label>
            <Input
              id="new-playlist-name"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              maxLength={80}
              placeholder="Give your playlist a name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-playlist-description">Description</Label>
            <Textarea
              id="new-playlist-description"
              value={newPlaylistDescription}
              onChange={(e) => setNewPlaylistDescription(e.target.value)}
              rows={3}
              maxLength={200}
              placeholder="Add a short description (optional)"
            />
          </div>
          <div className="space-y-2">
            <Label>Visibility</Label>
            <div className="inline-flex items-center gap-2 rounded-lg bg-muted p-1">
              <Button
                type="button"
                size="sm"
                variant={newPlaylistIsPublic ? 'ghost' : 'default'}
                className="flex-1"
                onClick={() => setNewPlaylistIsPublic(false)}
              >
                <Lock className="w-4 h-4 mr-1" />
                Private
              </Button>
              <Button
                type="button"
                size="sm"
                variant={newPlaylistIsPublic ? 'default' : 'ghost'}
                className="flex-1"
                onClick={() => setNewPlaylistIsPublic(true)}
              >
                <Globe className="w-4 h-4 mr-1" />
                Public
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Private playlists are only visible to you. Public playlists can be shared.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleCreateAndAdd()}
            disabled={!newPlaylistName.trim() || isSubmitting}
          >
            Save to playlist
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AddToPlaylistDialog;
