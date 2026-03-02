import { useState } from 'react';
import { motion } from 'framer-motion';
import { ListMusic, Plus, Globe, Lock, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Navigation } from '@/components/Navigation';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { useAudienceInteractions } from '@/hooks/useAudienceInteractions';

export default function Playlists() {
  const { playlists, createPlaylist, deletePlaylist, updatePlaylistVisibility } = useAudienceInteractions();
  const [isCreatePlaylistOpen, setIsCreatePlaylistOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  const [playlistDescription, setPlaylistDescription] = useState('');
  const [playlistIsPublic, setPlaylistIsPublic] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreatePlaylist = async () => {
    if (!playlistName.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const created = await createPlaylist(
        playlistName.trim(),
        playlistDescription.trim() || undefined,
        playlistIsPublic,
      );
      if (!created) return;
      setPlaylistName('');
      setPlaylistDescription('');
      setPlaylistIsPublic(false);
      setIsCreatePlaylistOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24 relative">
      <AnimatedBackground variant="default" />
      <Navigation />

      <main className="container mx-auto px-3 sm:px-4 py-6 sm:py-8 relative z-10">
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="glass-card rounded-2xl sm:rounded-3xl p-4 sm:p-6 shine-overlay flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/15 border border-primary/30">
                <ListMusic className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="font-heading text-xl sm:text-2xl font-bold text-foreground">
                  Your Playlists
                </h1>
                <p className="text-sm text-muted-foreground">
                  Collect songs into playlists and share them with the town square.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="hidden sm:inline-flex gradient-primary"
              onClick={() => setIsCreatePlaylistOpen(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              New playlist
            </Button>
          </div>
        </motion.section>

        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading text-lg font-semibold text-foreground">
              Playlists
            </h2>
            <Button
              size="sm"
              variant="outline"
              className="sm:hidden"
              onClick={() => setIsCreatePlaylistOpen(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              New playlist
            </Button>
          </div>

          {playlists.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-4 text-center">
              <p className="text-sm text-muted-foreground mb-3">
                You do not have any playlists yet. Create one to start collecting songs.
              </p>
              <Button
                size="sm"
                className="gradient-primary"
                onClick={() => setIsCreatePlaylistOpen(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Create playlist
              </Button>
            </div>
          ) : (
            <ScrollArea className="max-h-[480px] pr-2">
              <div className="space-y-3">
                {playlists.map((playlist) => (
                  <div
                    key={playlist.id}
                    className="flex items-center justify-between gap-3 p-3 bg-card border border-border rounded-xl hover:bg-card/70 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <ListMusic className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <Link
                          to={`/playlist/${playlist.id}`}
                          className="block"
                        >
                          <p className="font-medium text-foreground truncate">
                            {playlist.name}
                          </p>
                          {playlist.description && (
                            <p className="text-sm text-muted-foreground truncate">
                              {playlist.description}
                            </p>
                          )}
                        </Link>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border border-border">
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
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={() => updatePlaylistVisibility(playlist.id, !playlist.is_public)}
                      >
                        {playlist.is_public ? <Lock className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => deletePlaylist(playlist.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </section>
      </main>

      <Dialog open={isCreatePlaylistOpen} onOpenChange={setIsCreatePlaylistOpen}>
        <DialogContent className="max-w-sm w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle>Create playlist</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="playlist-name">Name</Label>
              <Input
                id="playlist-name"
                value={playlistName}
                onChange={(e) => setPlaylistName(e.target.value)}
                maxLength={80}
                placeholder="Give your playlist a name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="playlist-description">Description</Label>
              <Textarea
                id="playlist-description"
                value={playlistDescription}
                onChange={(e) => setPlaylistDescription(e.target.value)}
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
                  variant={playlistIsPublic ? 'ghost' : 'default'}
                  className="flex-1"
                  onClick={() => setPlaylistIsPublic(false)}
                >
                  <Lock className="w-4 h-4 mr-1" />
                  Private
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={playlistIsPublic ? 'default' : 'ghost'}
                  className="flex-1"
                  onClick={() => setPlaylistIsPublic(true)}
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
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsCreatePlaylistOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleCreatePlaylist()}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating...' : 'Create playlist'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

