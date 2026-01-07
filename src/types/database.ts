// Custom type definitions for database tables until types.ts is regenerated

export type AppRole = 'admin' | 'audience';

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

export interface AudienceProfile {
  id: string;
  user_id: string;
  username?: string | null;
  profile_name: string;
  bio: string | null;
  profile_picture_url: string | null;
  cover_photo_url: string | null;
  x_profile_link: string | null;
  base_profile_link: string | null;
  location: string | null;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface LikedSong {
  id: string;
  user_id: string;
  song_id: string;
  created_at: string;
}

export interface LikedArtist {
  id: string;
  user_id: string;
  artist_id: string;
  created_at: string;
}

export interface SongComment {
  id: string;
  user_id: string;
  song_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface Playlist {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlaylistSong {
  id: string;
  playlist_id: string;
  song_id: string;
  position: number;
  added_at: string;
}
