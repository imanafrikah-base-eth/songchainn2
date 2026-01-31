import { useState, useRef, useEffect, useMemo, type SyntheticEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Heart, MoreHorizontal, Reply, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PostComment } from '@/types/social';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useCommentLikes } from '@/hooks/useCommentLikes';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { ARTISTS } from '@/data/musicData';
import { useOnlineUsers } from '@/hooks/useUserPresence';

interface CommentSheetProps {
  isOpen: boolean;
  onClose: () => void;
  comments: PostComment[];
  isLoading: boolean;
  onAddComment: (content: string) => void;
  commentsCount: number;
  onCommentsUpdate?: (comments: PostComment[]) => void;
}

interface ReplyingTo {
  userId: string;
  userName: string;
}

export function CommentSheet({ 
  isOpen, 
  onClose, 
  comments, 
  isLoading, 
  onAddComment,
  commentsCount,
  onCommentsUpdate
}: CommentSheetProps) {
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<ReplyingTo | null>(null);
  const [localComments, setLocalComments] = useState<PostComment[]>([]);
  const [likingCommentId, setLikingCommentId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { fetchCommentLikesData, toggleCommentLike } = useCommentLikes();
  const commentUserIds = useMemo(() => localComments.map(comment => comment.user_id), [localComments]);
  const { onlineUserIds } = useOnlineUsers(commentUserIds);
  const handleImageError = (event: SyntheticEvent<HTMLImageElement>) => {
    const target = event.currentTarget;
    if (target.dataset.fallbackApplied === 'true') return;
    target.dataset.fallbackApplied = 'true';
    target.src = '/placeholder.svg';
  };

  // Fetch likes data when comments change
  useEffect(() => {
    const loadLikesData = async () => {
      if (comments.length > 0) {
        const enrichedComments = await fetchCommentLikesData(comments);
        setLocalComments(enrichedComments);
      } else {
        setLocalComments([]);
      }
    };
    loadLikesData();
  }, [comments, fetchCommentLikesData]);

  // Focus input when replying
  useEffect(() => {
    if (replyingTo && inputRef.current) {
      inputRef.current.focus();
    }
  }, [replyingTo]);

  // Clear reply state when sheet closes
  useEffect(() => {
    if (!isOpen) {
      setReplyingTo(null);
      setNewComment('');
    }
  }, [isOpen]);

  const handleLikeComment = async (comment: PostComment) => {
    if (likingCommentId) return;
    
    setLikingCommentId(comment.id);
    
    const result = await toggleCommentLike(
      comment.id, 
      comment.user_id, 
      comment.is_liked || false
    );
    
    if (result.success) {
      const updatedComments = localComments.map(c => 
        c.id === comment.id 
          ? { ...c, likes_count: result.newLikesCount, is_liked: result.isLiked }
          : c
      );
      setLocalComments(updatedComments);
      onCommentsUpdate?.(updatedComments);
    }
    
    setLikingCommentId(null);
  };

  const handleReply = (userId: string, userName: string) => {
    setReplyingTo({ userId, userName });
    setNewComment(`@${userName} `);
    inputRef.current?.focus();
  };

  const cancelReply = () => {
    setReplyingTo(null);
    setNewComment('');
  };

  const handleSubmit = () => {
    if (!newComment.trim()) return;
    onAddComment(newComment);
    setNewComment('');
    setReplyingTo(null);
  };

  const goToProfile = async (userId: string, artistId?: string | null) => {
    onClose();
    if (artistId) {
      navigate(`/artist/${artistId}`);
      return;
    }
    const { data } = await (supabase as any)
      .from('artist_accounts')
      .select('artist_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (data?.artist_id) {
      navigate(`/artist/${data.artist_id}`);
      return;
    }
    navigate(`/audience/${userId}`);
  };

  // Parse and render comment content with clickable @mentions
  const renderCommentContent = (content: string) => {
    const mentionRegex = /@(\w+)/g;
    const parts = content.split(mentionRegex);
    
    return parts.map((part, index) => {
      if (index % 2 === 1) {
        return (
          <button
            key={index}
            className="text-primary font-semibold hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              const mentionedUser = localComments.find(
                c => c.profile?.profile_name?.toLowerCase() === part.toLowerCase()
              );
              if (mentionedUser) void goToProfile(mentionedUser.user_id, mentionedUser.artist_id);
            }}
          >
            @{part}
          </button>
        );
      }
      return part;
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 h-[70vh] bg-background rounded-t-3xl z-50 flex flex-col"
          >
            {/* Handle */}
            <div className="flex items-center justify-center py-3">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-3 border-b border-border">
              <h3 className="font-bold text-lg">{commentsCount} Comments</h3>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Comments List */}
            <ScrollArea className="flex-1 px-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : localComments.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">No comments yet</p>
                  <p className="text-sm text-muted-foreground/70 mt-1">Be the first to comment!</p>
                </div>
              ) : (
                <div className="py-4 space-y-4">
                  {localComments.map((comment) => {
                    const isArtistComment = !!comment.artist_id;
                    const artist = comment.artist_id ? ARTISTS.find(a => a.id === comment.artist_id) : null;
                    const displayName = artist?.name || comment.profile?.profile_name || 'Anonymous';
                    const isVerifiedArtist = !!comment.artist_is_verified;
                    const avatarSrc = isArtistComment ? (artist?.profileImage || comment.profile?.profile_picture_url || '') : (comment.profile?.profile_picture_url || '');

                    return (
                      <motion.div
                        key={comment.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex gap-3"
                      >
                        <button onClick={() => void goToProfile(comment.user_id, comment.artist_id)}>
                          <Avatar className="w-10 h-10">
                            <AvatarImage src={avatarSrc} onError={handleImageError} />
                            <AvatarFallback className="bg-primary/20 text-primary">
                              {displayName.charAt(0) || '?'}
                            </AvatarFallback>
                          </Avatar>
                        </button>

                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <div>
                              <button 
                                onClick={() => void goToProfile(comment.user_id, comment.artist_id)}
                                className="font-semibold text-sm hover:underline"
                              >
                                <span className="inline-flex items-center gap-1">
                                  <span className={`w-2 h-2 rounded-full ${onlineUserIds.has(comment.user_id) ? 'bg-green-500' : 'bg-muted'}`} />
                                  <span>{displayName}</span>
                                  {isArtistComment && isVerifiedArtist && (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-yellow-400" />
                                  )}
                                </span>
                              </button>
                              <span className="text-xs text-muted-foreground ml-2">
                                {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                              </span>
                            </div>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </div>
                          <p className="text-sm text-foreground/90 mt-1">
                            {renderCommentContent(comment.content)}
                          </p>
                          <div className="flex items-center gap-4 mt-2">
                            <button 
                              className={cn(
                                "flex items-center gap-1 transition-colors",
                                comment.is_liked 
                                  ? "text-red-500" 
                                  : "text-muted-foreground hover:text-red-500",
                                likingCommentId === comment.id && "opacity-50"
                              )}
                              onClick={() => handleLikeComment(comment)}
                              disabled={likingCommentId === comment.id}
                            >
                              <Heart className={cn("w-4 h-4", comment.is_liked && "fill-current")} />
                              <span className="text-xs">
                                {(comment.likes_count || 0) > 0 ? comment.likes_count : 'Like'}
                              </span>
                            </button>
                            <button 
                              className="flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
                              onClick={() => handleReply(comment.user_id, comment.profile?.profile_name || 'Anonymous')}
                            >
                              <Reply className="w-4 h-4" />
                              <span className="text-xs">Reply</span>
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>

            {/* Reply indicator */}
            <AnimatePresence>
              {replyingTo && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="px-4 py-2 bg-muted/50 border-t border-border flex items-center justify-between"
                >
                  <span className="text-sm text-muted-foreground">
                    Replying to <span className="text-primary font-medium">@{replyingTo.userName}</span>
                  </span>
                  <Button variant="ghost" size="sm" onClick={cancelReply} className="h-7 px-2">
                    <X className="w-4 h-4" />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input */}
            <div className="p-4 border-t border-border bg-background">
              <div className="flex items-center gap-3">
                <Input
                  ref={inputRef}
                  placeholder={replyingTo ? `Reply to @${replyingTo.userName}...` : "Add a comment..."}
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  className="flex-1 h-11 rounded-full bg-muted border-0"
                />
                <Button 
                  size="icon" 
                  className="h-11 w-11 rounded-full"
                  onClick={handleSubmit}
                  disabled={!newComment.trim()}
                >
                  <Send className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
