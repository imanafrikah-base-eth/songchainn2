import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Heart, MessageCircle, Share2, Play, Pause, Music2, BadgeCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import type { SocialPostWithProfile, PostComment } from '@/types/social';
import { usePlayerActions, useSafePlayerState } from '@/context/PlayerContext';
import { useShare } from '@/hooks/useShare';
import { SongCardMotion, normaliseSongCard } from '@/components/social/SongCardMotion';
import { resolvePostSong, type FeedCatalog } from '@/lib/feedPosts';
import { MOSHA_POST_USER_ID } from '@/components/social/FeedVisuals';
import { thumb } from '@/lib/img';
import { cn } from '@/lib/utils';

/**
 * A post in the Photos section, the way Instagram and Facebook lay one out:
 * who posted it, the picture edge to edge, the song it carries as a playable
 * strip, then the actions, the caption and the newest comments. Double tap the
 * picture to like it.
 */
export function FeedPostCard({
  post,
  catalog,
  previewComments,
  onLike,
  onComment,
  onFollow,
  isFollowing,
}: {
  post: SocialPostWithProfile;
  catalog: FeedCatalog;
  previewComments?: PostComment[];
  onLike: (postId: string) => void;
  onComment: () => void;
  onFollow: (userId: string) => void;
  isFollowing: boolean;
}) {
  const navigate = useNavigate();
  const player = useSafePlayerState();
  const { playSong, pause, play } = usePlayerActions();
  const { shareSong, sharePost } = useShare();
  const [burst, setBurst] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const song = resolvePostSong(post, catalog);
  const card = normaliseSongCard(post.songcard);
  const profile = post.profile as { display_name?: string | null; profile_name?: string | null; profile_picture_url?: string | null; avatar_url?: string | null; is_official?: boolean | null } | undefined;
  const name = post.user_id === MOSHA_POST_USER_ID ? 'Mo$ha' : profile?.display_name || profile?.profile_name || 'A listener';
  const avatar = profile?.profile_picture_url || profile?.avatar_url || null;
  const isThisPlaying = !!song && player?.currentSong?.id === song.id && player?.isPlaying;
  const caption = post.content?.trim() ?? '';

  const likeFromPicture = () => {
    if (!post.is_liked) onLike(post.id);
    setBurst(true);
    window.setTimeout(() => setBurst(false), 700);
  };

  const togglePlay = () => {
    if (!song) return;
    if (player?.currentSong?.id === song.id) (player.isPlaying ? pause : play)();
    else playSong(song);
  };

  return (
    <article className="border-b border-border/60 bg-background pb-3 sm:mb-4 sm:overflow-hidden sm:rounded-2xl sm:border">
      {/* Who */}
      <header className="flex items-center gap-3 px-3 py-2.5">
        <button type="button" onClick={() => navigate(`/audience/${post.user_id}`)} className="shrink-0" aria-label={`Open ${name}`}>
          {avatar ? (
            <img src={thumb(avatar, 40) ?? avatar} alt="" className="h-9 w-9 rounded-full object-cover ring-2 ring-primary/40" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">{name.charAt(0)}</span>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => navigate(`/audience/${post.user_id}`)} className="flex max-w-full items-center gap-1 text-left">
            <span className="truncate text-sm font-bold text-foreground">{name}</span>
            {profile?.is_official && <BadgeCheck className="h-4 w-4 shrink-0 fill-primary text-background" />}
          </button>
          {song && (
            <p className="truncate text-xs text-muted-foreground">
              <Music2 className="mr-1 inline h-3 w-3 align-[-1px]" />
              {song.title} · {song.artist}
            </p>
          )}
        </div>
        {!isFollowing && post.user_id !== MOSHA_POST_USER_ID && (
          <button
            type="button"
            onClick={() => onFollow(post.user_id)}
            className="inline-flex h-8 shrink-0 items-center rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground"
          >
            Follow
          </button>
        )}
      </header>

      {/* The picture, or the song card */}
      <div className="relative w-full select-none bg-black" onDoubleClick={likeFromPicture}>
        {post.media_url && post.media_kind !== 'video' ? (
          <img src={thumb(post.media_url, 720) ?? post.media_url} alt={caption || `A post by ${name}`} loading="lazy" className="max-h-[80vh] w-full object-cover" />
        ) : post.media_url && post.media_kind === 'video' ? (
          <video src={post.media_url} poster={post.media_poster_url ?? undefined} controls playsInline preload="metadata" className="max-h-[80vh] w-full bg-black object-contain" />
        ) : card ? (
          <div className="mx-auto max-w-sm px-6 py-8">
            <SongCardMotion card={card} large />
          </div>
        ) : song?.coverImage ? (
          <img src={thumb(song.coverImage, 720) ?? song.coverImage} alt={song.title} loading="lazy" className="aspect-square w-full object-cover" />
        ) : null}
        {burst && (
          <motion.span
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1.2, opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <Heart className="h-24 w-24 fill-white text-white drop-shadow-2xl" />
          </motion.span>
        )}
      </div>

      {/* The song this post carries */}
      {song && (
        <button
          type="button"
          onClick={togglePlay}
          className="mx-3 mt-2.5 flex w-[calc(100%-1.5rem)] items-center gap-3 rounded-xl border border-border bg-card p-2 text-left transition-colors hover:bg-muted/50"
        >
          {song.coverImage ? (
            <img src={thumb(song.coverImage, 48) ?? song.coverImage} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
          ) : (
            <span className="h-10 w-10 shrink-0 rounded-lg bg-muted" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-foreground">{song.title}</span>
            <span className="block truncate text-xs text-muted-foreground">{song.artist}</span>
          </span>
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', isThisPlaying ? 'bg-primary text-primary-foreground' : 'bg-foreground text-background')}>
            {isThisPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
          </span>
        </button>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 px-1.5 pt-1.5">
        <button type="button" onClick={() => onLike(post.id)} aria-label={post.is_liked ? 'Unlike' : 'Like'} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted/50">
          <Heart className={cn('h-6 w-6', post.is_liked ? 'fill-red-500 text-red-500' : 'text-foreground')} />
        </button>
        <button type="button" onClick={onComment} aria-label="Comments" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted/50">
          <MessageCircle className="h-6 w-6 text-foreground" />
        </button>
        <button
          type="button"
          onClick={() => (song ? shareSong(song.title, song.artist, song.id, song.coverImage) : sharePost(post.id, post.content ?? undefined))}
          aria-label="Share"
          className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted/50"
        >
          <Share2 className="h-6 w-6 text-foreground" />
        </button>
      </div>

      <div className="space-y-1 px-3">
        {post.likes_count > 0 && (
          <p className="text-sm font-bold text-foreground">
            {post.likes_count.toLocaleString()} {post.likes_count === 1 ? 'like' : 'likes'}
          </p>
        )}
        {caption && (
          <p className={cn('text-sm text-foreground', !expanded && 'line-clamp-2')} onClick={() => setExpanded(true)}>
            <span className="mr-1.5 font-bold">{name}</span>
            {caption}
          </p>
        )}
        {previewComments?.slice(0, 2).map((c) => (
          <p key={c.id} className="truncate text-sm text-foreground/90">
            <span className="mr-1.5 font-semibold">{c.profile?.display_name || c.profile?.profile_name || 'Someone'}</span>
            {c.content}
          </p>
        ))}
        {post.comments_count > 0 && (
          <button type="button" onClick={onComment} className="text-sm text-muted-foreground">
            View all {post.comments_count} comments
          </button>
        )}
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
          {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
        </p>
      </div>
    </article>
  );
}

export default FeedPostCard;
