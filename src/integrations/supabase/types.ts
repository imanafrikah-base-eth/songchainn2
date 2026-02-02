export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audience_profiles: {
        Row: {
          base_profile_link: string | null
          bio: string | null
          cover_photo_url: string | null
          created_at: string
          id: string
          is_public: boolean
          location: string | null
          onboarding_completed: boolean
          profile_name: string
          profile_picture_url: string | null
          updated_at: string
          user_id: string
          x_profile_link: string | null
        }
        Insert: {
          base_profile_link?: string | null
          bio?: string | null
          cover_photo_url?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          location?: string | null
          onboarding_completed?: boolean
          profile_name: string
          profile_picture_url?: string | null
          updated_at?: string
          user_id: string
          x_profile_link?: string | null
        }
        Update: {
          base_profile_link?: string | null
          bio?: string | null
          cover_photo_url?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          location?: string | null
          onboarding_completed?: boolean
          profile_name?: string
          profile_picture_url?: string | null
          updated_at?: string
          user_id?: string
          x_profile_link?: string | null
        }
        Relationships: []
      }
      comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      liked_artists: {
        Row: {
          artist_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          artist_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          artist_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      liked_songs: {
        Row: {
          created_at: string
          id: string
          song_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          song_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          song_id?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          from_user_id: string
          id: string
          is_read: boolean
          message: string | null
          post_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          from_user_id: string
          id?: string
          is_read?: boolean
          message?: string | null
          post_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          from_user_id?: string
          id?: string
          is_read?: boolean
          message?: string | null
          post_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      playlist_collaborators: {
        Row: {
          can_edit: boolean
          created_at: string
          id: string
          playlist_id: string
          user_id: string
        }
        Insert: {
          can_edit?: boolean
          created_at?: string
          id?: string
          playlist_id: string
          user_id: string
        }
        Update: {
          can_edit?: boolean
          created_at?: string
          id?: string
          playlist_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlist_collaborators_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      playlist_songs: {
        Row: {
          added_at: string
          id: string
          playlist_id: string
          position: number
          song_id: string
        }
        Insert: {
          added_at?: string
          id?: string
          playlist_id: string
          position?: number
          song_id: string
        }
        Update: {
          added_at?: string
          id?: string
          playlist_id?: string
          position?: number
          song_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlist_songs_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      playlists: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_collaborative: boolean
          is_public: boolean
          name: string
          updated_at: string
          user_id: string
          mood: string | null
          vibe: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_collaborative?: boolean
          is_public?: boolean
          name: string
          updated_at?: string
          user_id: string
          mood?: string | null
          vibe?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_collaborative?: boolean
          is_public?: boolean
          name?: string
          updated_at?: string
          user_id?: string
          mood?: string | null
          vibe?: string | null
        }
        Relationships: []
      }
      post_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_views: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          viewer_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          viewer_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          viewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_views_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "audience_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_views_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile_popularity"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      referrals: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          points_earned: number
          referral_code: string
          referred_user_id: string | null
          referrer_id: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          points_earned?: number
          referral_code: string
          referred_user_id?: string | null
          referrer_id: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          points_earned?: number
          referral_code?: string
          referred_user_id?: string | null
          referrer_id?: string
          status?: string
        }
        Relationships: []
      }
      social_posts: {
        Row: {
          content: string | null
          created_at: string
          id: string
          playlist_id: string | null
          post_type: string
          song_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          playlist_id?: string | null
          post_type?: string
          song_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          playlist_id?: string | null
          post_type?: string
          song_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      song_analytics: {
        Row: {
          created_at: string
          event_type: string
          id: string
          song_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          song_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          song_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      song_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          song_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          song_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          song_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      used_nonces: {
        Row: {
          expires_at: string
          nonce: string
          used_at: string
        }
        Insert: {
          expires_at?: string
          nonce: string
          used_at?: string
        }
        Update: {
          expires_at?: string
          nonce?: string
          used_at?: string
        }
        Relationships: []
      }
      user_follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: []
      }
      user_points: {
        Row: {
          created_at: string
          id: string
          total_points: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          total_points?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          total_points?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      profile_popularity: {
        Row: {
          bio: string | null
          follower_count: number | null
          popularity_score: number | null
          post_count: number | null
          profile_id: string | null
          profile_name: string | null
          profile_picture_url: string | null
          total_post_likes: number | null
          user_id: string | null
          view_count: number | null
        }
        Insert: {
          bio?: string | null
          follower_count?: never
          popularity_score?: never
          post_count?: never
          profile_id?: string | null
          profile_name?: string | null
          profile_picture_url?: string | null
          total_post_likes?: never
          user_id?: string | null
          view_count?: never
        }
        Update: {
          bio?: string | null
          follower_count?: never
          popularity_score?: never
          post_count?: never
          profile_id?: string | null
          profile_name?: string | null
          profile_picture_url?: string | null
          total_post_likes?: never
          user_id?: string | null
          view_count?: never
        }
        Relationships: []
      }
      song_popularity: {
        Row: {
          comment_count: number | null
          like_count: number | null
          play_count: number | null
          popularity_score: number | null
          share_count: number | null
          song_id: string | null
          view_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      complete_referral: {
        Args: { p_new_user_id: string; p_referral_code: string }
        Returns: boolean
      }
      get_artist_follow_counts: {
        Args: { artist_ids: string[] }
        Returns: {
          artist_id: string
          follower_count: number
        }[]
      }
      get_artist_follower_count: { Args: { p_artist_id: string }; Returns: number }
      get_song_popularity: {
        Args: never
        Returns: {
          comment_count: number
          like_count: number
          play_count: number
          popularity_score: number
          share_count: number
          song_id: string
          view_count: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      validate_referral_code: { Args: { code: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "audience"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "audience"],
    },
  },
} as const
