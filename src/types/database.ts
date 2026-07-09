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
  // New schema fields
  display_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  cover_photo_url: string | null;
  location: string | null;
  bio: string | null;
  twitter_url?: string | null;
  wallet_address?: string | null;

  // Legacy / compatibility fields still used in some parts of the app
  profile_name?: string;
  profile_picture_url?: string | null;
  x_profile_link?: string | null;
  base_profile_link?: string | null;
  onboarding_completed?: boolean;
  created_at: string;
  updated_at: string;
}

export interface LikedSong {
  id: string;
  user_id: string;
  song_id: string;
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
  is_collaborative?: boolean;
  created_at: string;
  updated_at: string;
  mood: string | null;
  vibe: string | null;
}

export interface PlaylistSong {
  id: string;
  playlist_id: string;
  song_id: string;
  position: number;
  added_at: string;
}

export interface PlaylistCollaborator {
  id: string;
  playlist_id: string;
  user_id: string;
  can_edit: boolean;
  created_at: string;
}

export interface PlaylistCollaboratorWithProfile extends PlaylistCollaborator {
  profile?: AudienceProfile;
}
