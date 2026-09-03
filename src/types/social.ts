import { AudienceProfile } from './database';

export type PostType =
  | 'text' | 'song_share' | 'playlist_share' | 'listening'
  | 'welcome' | 'song_like' | 'song_pulse' | 'artist_follow' | 'song_comment'
  | 'activity' | 'system';

export type ActivityType = 'playlist_created' | 'room_entered' | null;

export interface SocialPostMetadata {
  song_id?: string | null;
  artist_id?: string | null;
  playlist_id?: string | null;
  room_id?: string | null;
  action?: string | null;
  position_seconds?: number | null;
}

export interface SocialPost {
  id: string;
  user_id: string;
  content: string | null;
  song_id: string | null;
  artist_id?: string | null;
  playlist_id: string | null;
  image_url?: string | null;
  image_path?: string | null;
  /** A picture or a clip attached to the post. */
  media_url?: string | null;
  media_kind?: 'image' | 'video' | null;
  media_poster_url?: string | null;
  media_id?: string | null;
  /** Where the media came from. A song card carries no file at all. */
  media_source?: 'upload' | 'songcard' | null;
  /** The song card definition, when this post is one. */
  songcard?: SongCardData | null;
  post_type: PostType;
  activity_type?: ActivityType;
  metadata?: SocialPostMetadata | null;
  created_at: string;
  updated_at: string;
}

export interface SocialPostWithProfile extends SocialPost {
  profile?: AudienceProfile;
  artist_id?: string | null;
  artist_is_verified?: boolean | null;
  likes_count: number;
  comments_count: number;
  is_liked: boolean;
  playlist_name?: string | null;
  /** The people tagged in it, resolved to names the feed can render. */
  tagged?: TaggedPerson[];
}

export interface TaggedPerson {
  user_id: string;
  display_name: string;
  username?: string | null;
  avatar_url?: string | null;
}

export interface UserFollow {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: string;
}

export interface PostLike {
  id: string;
  user_id: string;
  post_id: string;
  created_at: string;
}

export interface PostComment {
  id: string;
  user_id: string;
  post_id: string;
  content: string;
  created_at: string;
  profile?: AudienceProfile;
  artist_id?: string | null;
  artist_is_verified?: boolean | null;
  likes_count?: number;
  is_liked?: boolean;
}

export interface CommentLike {
  id: string;
  comment_id: string;
  user_id: string;
  created_at: string;
}


/**
 * A song card: the audience's way of making something.
 *
 * It lives here rather than beside the component that draws it because the data
 * layer writes it and the feed reads it, so the shape is shared, not a
 * rendering detail.
 */
export type SongCardStyleId = 'pulse' | 'spin' | 'drift' | 'still';

export interface SongCardData {
  songId: string;
  title: string;
  artist: string;
  coverImage: string | null;
  style: SongCardStyleId;
  caption: string;
}
