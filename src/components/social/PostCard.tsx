import { artistPath } from '@/lib/slugRoutes';
import { useState, type SyntheticEvent } from 'react';
import { ArtistName, VerifiedMark } from '@/components/ArtistName';
import { formatDistanceToNow } from 'date-fns';
import { Heart, MessageCircle, Share2, Play, Trash2, MoreHorizontal, Copy, Check, CheckCircle2, Flag, UserMinus, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SocialPostWithProfile, PostComment } from '@/types/social';
import { SONGS, ARTISTS } from '@/data/musicData';
import { usePlayer } from '@/context/PlayerContext';
import { useAuth } from '@/context/AuthContext';
import { Input } from '@/components/ui/input';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { motion, AnimatePresence } from 'framer-motion';
import { useShare } from '@/hooks/useShare';
import { useAudienceInteractions } from '@/hooks/useAudienceInteractions';
import { useUserPresence } from '@/hooks/useUserPresence';
import { ReportDialog } from '@/components/ReportDialog';
import { OfficialBadge } from '@/components/OfficialBadge';
import { InlineEdit, EditedMark } from '@/components/social/InlineEdit';

interface PostCardProps {
  post: SocialPostWithProfile;
  onLike: (postId: string) => void;
  onDelete: (postId: string) => void;
  /** Optional so existing callers keep working; without it Edit stays hidden. */
  onEdit?: (postId: string, content: string) => Promise<boolean>;
  onEditComment?: (commentId: string, content: string) => Promise<boolean>;
  onFollow: (userId: string) => void;
  isFollowing: boolean;
  onGetComments: (postId: string) => Promise<PostComment[]>;
  onAddComment: (postId: string, content: string) => void;
  /** Optional so existing callers keep working; without it the option hides. */
  onUntagSelf?: (postId: string) => Promise<boolean> | void;
}

export function PostCard({ 
  post, 
  onLike, 
  onDelete,
  onEdit,
  onEditComment,
  onFollow, 
  isFollowing,
  onGetComments,
  onAddComment,
  onUntagSelf
}: PostCardProps) {
  const { user } = useAuth();
  const { playSong } = usePlayer();
  const navigate = useNavigate();
  const { sharePost, shareSong, copied, getShareUrl, getSongShareUrl, copyToClipboard, shareToX } = useShare();
  const { isArtistLiked, toggleLikeArtist } = useAudienceInteractions();
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [reporting, setReporting] = useState(false);
  /* Fixing one word should not cost a post its likes and its comments. */
  const [editingPost, setEditingPost] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const { isOnline } = useUserPresence(post.user_id, { includeLastSeen: false, includeNowPlayingFallback: false });

  const song = post.song_id ? SONGS.find(s => s.id === post.song_id) : null;
  const artist = song ? ARTISTS.find(a => a.id === song.artistId) : null;
  const postArtist = post.artist_id ? ARTISTS.find(a => a.id === post.artist_id) : null;
  const displayName = postArtist?.name || post.profile?.profile_name || 'Anonymous';
  const avatarUrl = post.profile?.profile_picture_url || postArtist?.profileImage || '';
  const isArtistPost = !!post.artist_id;
  const isVerifiedArtist = !!post.artist_is_verified;
  const isFollowingArtist = post.artist_id ? isArtistLiked(post.artist_id) : false;
  const isOwnPost = user?.id === post.user_id;
  const isTaggedHere = !!user?.id && (post.tagged ?? []).some((t) => t.user_id === user.id);
  // Set by hand in the database on one row only. Never self-declared.
  const isOfficial = Boolean((post.profile as { is_official?: boolean } | null)?.is_official);
  const handleImageError = (event: SyntheticEvent<HTMLImageElement>) => {
    const target = event.currentTarget;
    if (target.dataset.fallbackApplied === 'true') return;
    target.dataset.fallbackApplied = 'true';
    target.src = '/placeholder.svg';
  };

  const goToProfile = () => {
    if (post.artist_id) {
      navigate(artistPath(post.artist_id));
      return;
    }
    navigate(`/audience/${post.user_id}`);
  };

  const handleShare = () => {
    if (song && artist) {
      shareSong(song.title, artist.name, song.id, song.coverImage);
    } else {
      sharePost(post.id, post.content || undefined);
    }
  };

  const handleCopyLink = () => {
    const url = song
      ? getSongShareUrl({ id: song.id, title: song.title, artist: artist?.name || song.artist, coverImage: song.coverImage })
      : getShareUrl('post', post.id);
    copyToClipboard(url);
  };

  const handleShareToX = () => {
    const url = song
      ? getSongShareUrl({ id: song.id, title: song.title, artist: artist?.name || song.artist, coverImage: song.coverImage })
      : getShareUrl('post', post.id);
    const text = song && artist 
      ? `🎵 Listening to "${song.title}" by ${artist.name} on @$ongChainn\n\n`
      : `Check out this post on @$ongChainn\n\n`;
    shareToX(text, url);
  };

  const handleToggleComments = async () => {
    if (!showComments) {
      setLoadingComments(true);
      const fetchedComments = await onGetComments(post.id);
      setComments(fetchedComments);
      setLoadingComments(false);
    }
    setShowComments(!showComments);
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    await onAddComment(post.id, newComment);
    setNewComment('');
    const fetchedComments = await onGetComments(post.id);
    setComments(fetchedComments);
  };

  const handlePlaySong = () => {
    if (song) {
      playSong(song);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-xl p-4 space-y-4"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Avatar className="w-10 h-10 cursor-pointer" onClick={goToProfile}>
            <AvatarImage src={avatarUrl} onError={handleImageError} />
            <AvatarFallback className="bg-primary/20 text-primary">
              {displayName.charAt(0) || '?'}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <button type="button" className="font-semibold text-foreground hover:underline inline-flex items-center gap-2" onClick={goToProfile}>
                <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-muted'}`} />
                {displayName}
              </button>
              {/* The official mark wins over the artist tick. An account can be
                  both, but "this is SONGCHAINN" is the more important claim and
                  showing two badges reads as noise. */}
              {isOfficial ? (
                <OfficialBadge size={17} />
              ) : (
                <VerifiedMark verified={isArtistPost && isVerifiedArtist} userId={post.user_id} artistId={post.artist_id} size={17} />
              )}
              {!isOwnPost && (
                isArtistPost ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-10 px-2 text-xs"
                    onClick={() => {
                      if (!post.artist_id) return;
                      void toggleLikeArtist(post.artist_id);
                    }}
                  >
                    {isFollowingArtist ? 'Following' : 'Follow'}
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-10 px-2 text-xs"
                    onClick={() => onFollow(post.user_id)}
                  >
                    {isFollowing ? 'Following' : 'Follow'}
                  </Button>
                )
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
            </span>
          </div>
        </div>

        {/* The menu used to render only on your OWN post, which is the one post
            nobody needs to report. Everyone else's had no menu at all, so the
            Terms promised a way to report something that could not be reached
            from anywhere in the app. Delete stays yours alone; report is for
            everyone else's. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-11 w-11">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isOwnPost ? (
              <>
                {onEdit && (
                  <DropdownMenuItem onClick={() => setEditingPost(true)}>
                    <Pencil className="w-4 h-4 mr-2" />
                    Edit post
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => onDelete(post.id)} className="text-destructive">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Post
                </DropdownMenuItem>
              </>
            ) : (
              <>
                {/* Being tagged is not consent to stay tagged. TagPeople has
                    always told people they could take their own name off; until
                    now there was no way to actually do it. */}
                {isTaggedHere && onUntagSelf && (
                  <DropdownMenuItem onClick={() => void onUntagSelf(post.id)}>
                    <UserMinus className="w-4 h-4 mr-2" />
                    Take my name off this
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setReporting(true)}>
                  <Flag className="w-4 h-4 mr-2" />
                  Report this post
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {reporting && (
        <ReportDialog
          targetType="post"
          targetId={post.id}
          targetUser={post.user_id}
          onClose={() => setReporting(false)}
        />
      )}

      {/* Content */}
      {editingPost && onEdit ? (
        <InlineEdit
          value={post.content || ''}
          placeholder="Say something"
          onSave={(next) => onEdit(post.id, next)}
          onCancel={() => setEditingPost(false)}
        />
      ) : (
        post.content && (
          <p className="text-foreground/90">
            {post.content}
            {post.edited_at ? <EditedMark at={post.edited_at} className="ml-2" /> : null}
          </p>
        )
      )}

      {/* Song Share */}
      {song && (
        <div 
          className="flex items-center gap-3 p-3 bg-background/50 rounded-lg border border-border/50 cursor-pointer hover:bg-background/80 transition-colors"
          onClick={handlePlaySong}
        >
          <div className="relative w-12 h-12 rounded-md overflow-hidden flex-shrink-0">
            <img src={song.coverImage} alt={song.title} className="w-full h-full object-contain" />
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
              <Play className="w-5 h-5 text-white fill-white" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-foreground truncate">{song.title}</p>
            <p className="text-sm text-muted-foreground truncate"><ArtistName name={artist?.name} artistId={artist?.id} size={12} /></p>
          </div>
          <Button size="icon" variant="secondary" className="flex-shrink-0">
            <Play className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-4 pt-2 border-t border-border/30">
        <Button
          variant="ghost"
          size="sm"
          className={`gap-1 ${post.is_liked ? 'text-red-500' : ''}`}
          onClick={() => onLike(post.id)}
        >
          <Heart className={`w-4 h-4 ${post.is_liked ? 'fill-current' : ''}`} />
          {post.likes_count > 0 && post.likes_count}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1"
          onClick={handleToggleComments}
        >
          <MessageCircle className="w-4 h-4" />
          {post.comments_count > 0 && post.comments_count}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1">
              <Share2 className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={handleShare} className="gap-2">
              <Share2 className="w-4 h-4" />
              Share
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleCopyLink} className="gap-2">
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              Copy Link
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleShareToX} className="gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              Share on X
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Comments Section */}
      <AnimatePresence>
        {showComments && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="space-y-3 pt-3 border-t border-border/30"
          >
            {loadingComments ? (
              <p className="text-sm text-muted-foreground">Loading comments...</p>
            ) : (
              <>
                {comments.map(comment => {
                  const isMine = !!user?.id && comment.user_id === user.id;
                  const isEditing = editingCommentId === comment.id;
                  return (
                  <div key={comment.id} className="flex gap-2">
                    <Avatar className="w-7 h-7">
                      <AvatarImage src={comment.profile?.profile_picture_url || ''} />
                      <AvatarFallback className="text-xs bg-primary/20 text-primary">
                        {comment.profile?.profile_name?.charAt(0) || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 bg-background/50 rounded-lg p-2">
                      <span className="font-medium text-sm">{comment.profile?.profile_name}</span>
                      {isEditing && onEditComment ? (
                        <InlineEdit
                          value={comment.content}
                          rows={2}
                          maxLength={2000}
                          placeholder="Your comment"
                          onSave={async (next) => {
                            const ok = await onEditComment(comment.id, next);
                            if (ok) {
                              setComments((prev) => prev.map((c) => (c.id === comment.id ? { ...c, content: next, edited_at: new Date().toISOString() } : c)));
                            }
                            return ok;
                          }}
                          onCancel={() => setEditingCommentId(null)}
                        />
                      ) : (
                        <>
                          <p className="text-sm text-foreground/80">
                            {comment.content}
                            {comment.edited_at ? <EditedMark at={comment.edited_at} className="ml-2" /> : null}
                          </p>
                          {isMine && onEditComment && (
                            <button
                              type="button"
                              onClick={() => setEditingCommentId(comment.id)}
                              className="mt-1 inline-flex min-h-8 items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                            >
                              <Pencil className="h-3 w-3" /> Edit
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  );
                })}
                <div className="flex gap-2">
                  <Input
                    placeholder="Write a comment..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                    className="flex-1 h-9 text-sm"
                  />
                  <Button size="sm" onClick={handleAddComment}>Post</Button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
