import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MessageCircle, Send, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { getAllProfiles, listSongComments, saveSongComments } from '@/lib/localDb';

interface SongCommentsProps {
  songId: string;
  songTitle: string;
  artistName: string;
}

interface CommentWithProfile {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  profile?: {
    profile_name: string;
    profile_picture_url: string | null;
  };
}

export function SongComments({ songId, songTitle, artistName }: SongCommentsProps) {
  const { user } = useAuth();
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();

  // Fetch comments
  const { data: comments = [], isLoading } = useQuery({
    queryKey: ['song-comments', songId],
    queryFn: async () => {
      const map = listSongComments();
      const rows = (map[songId] || []).slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const profiles = getAllProfiles();
      return rows.map((comment) => ({
        id: comment.id,
        content: comment.content,
        created_at: comment.created_at,
        user_id: comment.user_id,
        profile: profiles[comment.user_id]
          ? {
              profile_name: profiles[comment.user_id].profile_name,
              profile_picture_url: profiles[comment.user_id].profile_picture_url,
            }
          : undefined,
      })) as CommentWithProfile[];
    },
    enabled: !!songId,
  });

  // Add comment mutation
  const addComment = useMutation({
    mutationFn: async (content: string) => {
      if (!user) throw new Error('Must be logged in');
      const map = listSongComments();
      const now = new Date().toISOString();
      const next = {
        id: crypto.randomUUID(),
        song_id: songId,
        user_id: user.id,
        content,
        created_at: now,
        updated_at: now,
      };
      map[songId] = [next, ...(map[songId] || [])];
      saveSongComments(map);
    },
    onSuccess: () => {
      setNewComment('');
      queryClient.invalidateQueries({ queryKey: ['song-comments', songId] });
      toast.success('Comment posted!');
    },
    onError: (error: Error) => {
      toast.error('Failed to post comment', { description: error.message });
    },
  });

  // Delete comment mutation
  const deleteComment = useMutation({
    mutationFn: async (commentId: string) => {
      const map = listSongComments();
      map[songId] = (map[songId] || []).filter((c) => c.id !== commentId);
      saveSongComments(map);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['song-comments', songId] });
      toast.success('Comment deleted');
    },
    onError: () => {
      toast.error('Failed to delete comment');
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await addComment.mutateAsync(newComment.trim());
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="mt-12">
      <div className="flex items-center gap-2 mb-6">
        <MessageCircle className="w-5 h-5 text-primary" />
        <h2 className="font-heading text-xl font-semibold text-foreground">
          Comments ({comments.length})
        </h2>
      </div>

      {/* Comment Form */}
      {user ? (
        <form onSubmit={handleSubmit} className="mb-8">
          <div className="flex gap-3">
            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Share your thoughts on this track..."
              className="min-h-[80px] resize-none bg-secondary/50 border-border/50 focus:border-primary"
              maxLength={500}
            />
          </div>
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-muted-foreground">
              {newComment.length}/500 characters
            </span>
            <Button
              type="submit"
              disabled={!newComment.trim() || isSubmitting}
              className="gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Post
                </>
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Comments are moderated to ensure a positive community experience
          </p>
        </form>
      ) : (
        <div className="glass-card p-4 rounded-xl mb-8 text-center">
          <p className="text-muted-foreground">
            Sign in to join the conversation
          </p>
        </div>
      )}

      {/* Comments List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : comments.length === 0 ? (
        <div className="text-center py-8">
          <MessageCircle className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground">No comments yet</p>
          <p className="text-sm text-muted-foreground/70">Be the first to share your thoughts!</p>
        </div>
      ) : (
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {comments.map((comment) => (
              <motion.div
                key={comment.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="glass-card p-4 rounded-xl"
              >
                <div className="flex gap-3">
                  <Link to={`/audience/${comment.user_id}`}>
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={comment.profile?.profile_picture_url || undefined} />
                      <AvatarFallback className="bg-primary/20 text-primary">
                        {comment.profile?.profile_name?.charAt(0).toUpperCase() || '?'}
                      </AvatarFallback>
                    </Avatar>
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <Link 
                        to={`/audience/${comment.user_id}`}
                        className="font-medium text-foreground hover:text-primary transition-colors truncate"
                      >
                        {comment.profile?.profile_name || 'Anonymous'}
                      </Link>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                        </span>
                        {user?.id === comment.user_id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-6 h-6 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteComment.mutate(comment.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <p className="text-muted-foreground text-sm whitespace-pre-wrap break-words">
                      {comment.content}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}
