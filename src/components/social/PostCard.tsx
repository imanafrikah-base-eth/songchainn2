import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Heart, MessageCircle, Share2, Play, Trash2, MoreHorizontal, Copy, Check, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

interface PostCardProps {
  post: SocialPostWithProfile;
  onLike: (postId: string) => void;
  onDelete: (postId: string) => void;
  onFollow: (userId: string) => void;
  isFollowing: boolean;
  onGetComments: (postId: string) => Promise<PostComment[]>;
  onAddComment: (postId: string, content: string) => void;
}

export function PostCard({ 
  post, 
  onLike, 
  onDelete, 
  onFollow, 
  isFollowing,
  onGetComments,
  onAddComment
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

  const song = post.song_id ? SONGS.find(s => s.id === post.song_id) : null;
  const artist = song ? ARTISTS.find(a => a.id === song.artistId) : null;
  const postArtist = post.artist_id ? ARTISTS.find(a => a.id === post.artist_id) : null;
  const displayName = postArtist?.name || post.profile?.profile_name || 'Anonymous';
  const avatarUrl = post.profile?.profile_picture_url || postArtist?.profileImage || '';
  const isArtistPost = !!post.artist_id;
  const isVerifiedArtist = !!post.artist_is_verified;
  const isFollowingArtist = post.artist_id ? isArtistLiked(post.artist_id) : false;
  const isOwnPost = user?.id === post.user_id;

  const goToProfile = () => {
    if (post.artist_id) {
      navigate(`/artist/${post.artist_id}`);
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
      ? `🎵 Listening to "${song.title}" by ${artist.name} on @SongChainn\n\n`
      : `Check out this post on @SongChainn\n\n`;
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
            <AvatarImage src={avatarUrl} />
            <AvatarFallback className="bg-primary/20 text-primary">
              {displayName.charAt(0) || '?'}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <button type="button" className="font-semibold text-foreground hover:underline" onClick={goToProfile}>
                {displayName}
              </button>
              {isArtistPost && isVerifiedArtist && (
                <CheckCircle2 className="w-4 h-4 text-yellow-400" />
              )}
              {!isOwnPost && (
                isArtistPost ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
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
                    className="h-6 px-2 text-xs"
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

        {isOwnPost && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onDelete(post.id)} className="text-destructive">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Post
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Content */}
      {post.content && (
        <p className="text-foreground/90">{post.content}</p>
      )}

      {/* Song Share */}
      {song && (
        <div 
          className="flex items-center gap-3 p-3 bg-background/50 rounded-lg border border-border/50 cursor-pointer hover:bg-background/80 transition-colors"
          onClick={handlePlaySong}
        >
          <div className="relative w-12 h-12 rounded-md overflow-hidden flex-shrink-0">
            <img src={song.coverImage} alt={song.title} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
              <Play className="w-5 h-5 text-white fill-white" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-foreground truncate">{song.title}</p>
            <p className="text-sm text-muted-foreground truncate">{artist?.name}</p>
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
                {comments.map(comment => (
                  <div key={comment.id} className="flex gap-2">
                    <Avatar className="w-7 h-7">
                      <AvatarImage src={comment.profile?.profile_picture_url || ''} />
                      <AvatarFallback className="text-xs bg-primary/20 text-primary">
                        {comment.profile?.profile_name?.charAt(0) || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 bg-background/50 rounded-lg p-2">
                      <span className="font-medium text-sm">{comment.profile?.profile_name}</span>
                      <p className="text-sm text-foreground/80">{comment.content}</p>
                    </div>
                  </div>
                ))}
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
