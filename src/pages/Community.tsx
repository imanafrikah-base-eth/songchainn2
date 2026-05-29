import { useState, useEffect, useMemo, type SyntheticEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, 
  UserPlus, 
  Check, 
  Search, 
  Clock, 
  Heart,
  MessageCircle,
  Music,
  Sparkles,
  TrendingUp,
  Filter,
  Grid3X3,
  List,
  MapPin
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { getAllProfiles, upsertProfile } from '@/lib/localDb';
import { useAuth } from '@/context/AuthContext';
import { useSocial } from '@/hooks/useSocial';
import { useTopProfiles } from '@/hooks/usePopularity';
import { formatPresenceLabel, useOnlineUsers } from '@/hooks/useUserPresence';
import { Navigation } from '@/components/Navigation';
import { AudioPlayer } from '@/components/AudioPlayer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AnimatedBackground } from '@/components/ui/animated-background';
const logo = '/songchainn-logo.webp';

interface UserProfile {
  id: string;
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  cover_photo_url: string | null;
  bio: string | null;
  location: string | null;
  created_at: string;
  updated_at?: string | null;
  follower_count?: number;
  post_count?: number;
  play_count?: number;
  is_following?: boolean;
}

function normalizeProfile(raw: any): UserProfile | null {
  if (!raw) return null;
  const userId = raw.user_id ?? raw.id;
  if (!userId) return null;
  const displayName =
    raw.display_name ??
    raw.profile_name ??
    raw.username ??
    'Listener';
  const username = raw.username ?? null;
  const avatarUrl =
    raw.avatar_url ??
    raw.profile_picture_url ??
    null;
  const coverPhotoUrl = raw.cover_photo_url ?? null;
  const bio = raw.bio ?? null;
  const location = raw.location ?? null;
  const createdAt =
    typeof raw.created_at === 'string'
      ? raw.created_at
      : new Date().toISOString();
  const updatedAt =
    typeof raw.updated_at === 'string'
      ? raw.updated_at
      : null;

  return {
    id: String(raw.id ?? userId),
    user_id: String(userId),
    display_name: displayName,
    username,
    avatar_url: avatarUrl,
    cover_photo_url: coverPhotoUrl,
    bio,
    location,
    created_at: createdAt,
    updated_at: updatedAt,
    follower_count: typeof raw.follower_count === 'number' ? raw.follower_count : 0,
    post_count: typeof raw.post_count === 'number' ? raw.post_count : 0,
    play_count: typeof raw.play_count === 'number' ? raw.play_count : 0,
    is_following: Boolean(raw.is_following),
  };
}

function safeInitials(displayName: string | null | undefined, username: string | null | undefined, fallback: string): string {
  const source =
    (displayName && typeof displayName === 'string' && displayName.trim()) ||
    (username && typeof username === 'string' && username.trim()) ||
    fallback;
  const trimmed = String(source).trim();
  if (!trimmed) return fallback.toUpperCase();
  const first = trimmed[0];
  return typeof first === 'string' ? first.toUpperCase() : fallback.toUpperCase();
}

function safeDisplayName(displayName: string | null | undefined, username: string | null | undefined): string {
  if (displayName && typeof displayName === 'string' && displayName.trim()) {
    return displayName.trim();
  }
  if (username && typeof username === 'string' && username.trim()) {
    return username.trim();
  }
  return 'Listener';
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export default function Community() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { following, followUser, isFollowing } = useSocial();
  const { topProfiles } = useTopProfiles(100);
  
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'popular' | 'active'>('active');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [presenceRefreshAt, setPresenceRefreshAt] = useState(Date.now());
  const { onlineUserIds, lastSeenByUserId } = useOnlineUsers(users.map((profile) => profile.user_id), { includeLastSeen: true });
  const onlineUsers = users.filter((profile) => onlineUserIds.has(profile.user_id));
  const handleImageError = (event: SyntheticEvent<HTMLImageElement>) => {
    const target = event.currentTarget;
    if (target.dataset.fallbackApplied === 'true') return;
    target.dataset.fallbackApplied = 'true';
    target.src = '/placeholder.svg';
  };

  // Touch our own profile's updated_at so we appear near the top of "Recent" list
  useEffect(() => {
    if (!user?.id || user.id.startsWith('fc-')) return;
    void supabase
      .from('audience_profiles')
      .update({ updated_at: new Date().toISOString() } as any)
      .eq('user_id', user.id)
      .then(() => {});
  }, [user?.id]);

  useEffect(() => {
    const fetchUsers = async () => {
      setIsLoading(true);
      setLoadError(null);

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('fetch:timeout')), 12000)
      );

      // Try SECURITY DEFINER RPC first — bypasses any restrictive RLS on audience_profiles.
      // Falls back to direct table query if the RPC doesn't exist yet.
      let profiles: any[] | null = null;
      let fetchError: any = null;

      const rpcResult = await Promise.race([
        (supabase as any).rpc('get_community_profiles', { p_limit: 300, p_offset: 0 }).then((r: any) => r),
        timeout,
      ]).catch((err: any) => ({ data: null, error: err })) as any;

      if (!rpcResult.error && Array.isArray(rpcResult.data)) {
        profiles = rpcResult.data;
      } else {
        // RPC not available — fall back with updated_at ordering for recency
        const directResult = await Promise.race([
          supabase
            .from('audience_profiles')
            .select('*')
            .order('updated_at', { ascending: false })
            .limit(300)
            .then((r) => r),
          timeout,
        ]).catch((err: any) => ({ data: null, error: err })) as any;
        profiles = directResult.data;
        fetchError = directResult.error;
      }

      if (fetchError || !profiles) {
        if (import.meta.env.DEV) {
          console.error('Error fetching community profiles:', fetchError);
        }
        const cached = Object.values(getAllProfiles() || {}).filter((p) => p?.user_id);
        const normalizedCached: UserProfile[] = cached
          .map((p: any) => normalizeProfile(p))
          .filter((p): p is UserProfile => Boolean(p));
        if (normalizedCached.length) {
          setUsers(normalizedCached);
          setFilteredUsers(normalizedCached);
        } else {
          setLoadError('Unable to load community right now. Please try again later.');
        }
        setIsLoading(false);
        return;
      }

      const normalizedProfiles: UserProfile[] = ((profiles as any[]) || [])
        .map((p) => normalizeProfile(p))
        .filter((p): p is UserProfile => Boolean(p));

      const dedupedByUserId = new Map<string, UserProfile>();
      normalizedProfiles.forEach((p) => {
        if (!dedupedByUserId.has(p.user_id)) dedupedByUserId.set(p.user_id, p);
      });
      const uniqueProfiles = Array.from(dedupedByUserId.values());
      uniqueProfiles.forEach((profile) => upsertProfile(profile as any));

      // Show profiles immediately so UI is not empty while counts load
      setUsers(uniqueProfiles);
      setFilteredUsers(uniqueProfiles);
      setIsLoading(false);

      // Enrich with counts in the background — non-blocking
      const userIds = uniqueProfiles.map(p => p.user_id);
      if (!userIds.length) return;

      try {
        // Hard caps below match the per-page community size (300 profiles).
        // Without them, each tab open could pull every analytics/follow row
        // for the entire community → tens-of-MB payloads at scale.
        const playsQuery = supabase
          .from('song_analytics')
          .select('user_id')
          .eq('event_type', 'play')
          .in('user_id', userIds)
          .limit(5000);

        const [followersRes, postsRes, playsRes] = await Promise.all([
          supabase.from('user_follows').select('following_id').in('following_id', userIds).limit(5000),
          supabase.from('social_posts').select('user_id').in('user_id', userIds).limit(5000),
          playsQuery,
        ]);

        const followerCounts = new Map<string, number>();
        followersRes.data?.forEach(f => {
          followerCounts.set(f.following_id, (followerCounts.get(f.following_id) || 0) + 1);
        });

        const postCounts = new Map<string, number>();
        postsRes.data?.forEach(p => {
          postCounts.set(p.user_id, (postCounts.get(p.user_id) || 0) + 1);
        });

        const playCounts = new Map<string, number>();
        playsRes.data?.forEach(p => {
          if (!p.user_id) return;
          playCounts.set(p.user_id, (playCounts.get(p.user_id) || 0) + 1);
        });

        const enrichedUsers: UserProfile[] = uniqueProfiles.map(profile => ({
          ...profile,
          follower_count: followerCounts.get(profile.user_id) || 0,
          post_count: postCounts.get(profile.user_id) || 0,
          play_count: playCounts.get(profile.user_id) || 0,
        }));

        setUsers(enrichedUsers);
        setFilteredUsers(enrichedUsers);
      } catch {
        // Counts failed — profiles already shown without them, which is fine
      }
    };

    fetchUsers();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('community-presence')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'audience_profiles' },
        (payload) => {
          const updated = payload.new as UserProfile;
          const nextUserId = updated?.user_id ?? (updated as any)?.id;
          if (!nextUserId) return;
          setUsers((prev) =>
            prev.map((profile) =>
              profile.user_id === String(nextUserId)
                ? { ...profile, ...updated, user_id: String(nextUserId) }
                : profile
            )
          );
        }
      )
      // Live follower count: any INSERT/DELETE on user_follows updates the target profile's count
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'user_follows' },
        (payload) => {
          const followingId = String((payload.new as any)?.following_id || '');
          if (!followingId) return;
          setUsers((prev) =>
            prev.map((p) =>
              p.user_id === followingId
                ? { ...p, follower_count: (p.follower_count || 0) + 1 }
                : p
            )
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'user_follows' },
        (payload) => {
          const followingId = String((payload.old as any)?.following_id || '');
          if (!followingId) return;
          setUsers((prev) =>
            prev.map((p) =>
              p.user_id === followingId
                ? { ...p, follower_count: Math.max(0, (p.follower_count || 0) - 1) }
                : p
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const derivedUsers = useMemo(() => {
    const query = searchQuery.toLowerCase();
    const base = users.map((u) => ({
      ...u,
      display_name: safeDisplayName(u.display_name, u.username),
    }));

    let filtered = base.filter((u) => {
      const name = (u.display_name || u.username || '').toLowerCase();
      const bio = (u.bio || '').toLowerCase();
      return name.includes(query) || bio.includes(query);
    });

    switch (sortBy) {
      case 'newest':
        filtered = filtered.sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        break;
      case 'popular':
        filtered = filtered.sort((a, b) =>
          (b.follower_count || 0) + (b.post_count || 0) + (b.play_count || 0) -
          ((a.follower_count || 0) + (a.post_count || 0) + (a.play_count || 0))
        );
        break;
      case 'active':
        filtered = filtered.sort((a, b) => {
          // Current user always first
          if (a.user_id === user?.id) return -1;
          if (b.user_id === user?.id) return 1;
          const aTime = new Date(a.updated_at || a.created_at).getTime();
          const bTime = new Date(b.updated_at || b.created_at).getTime();
          return bTime - aTime;
        });
        break;
    }

    return filtered;
  }, [users, searchQuery, sortBy, user?.id]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setPresenceRefreshAt(Date.now());
    }, 60_000);
    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const handleFollow = async (userId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const wasFollowing = isFollowing(userId);
    const delta = wasFollowing ? -1 : 1;
    // Optimistic count update in local state before DB round-trip
    setUsers((prev) =>
      prev.map((p) =>
        p.user_id === userId
          ? { ...p, follower_count: Math.max(0, (p.follower_count || 0) + delta) }
          : p
      )
    );
    await followUser(userId);
  };

  const goToProfile = async (userId: string) => {
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

  const isNewUser = (createdAt: string) => {
    const hoursSinceCreation = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60);
    return hoursSinceCreation < 24;
  };

  return (
    <div className="min-h-screen bg-background relative">
      <AnimatedBackground variant="default" />
      <Navigation />

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 relative z-10">
        <motion.section
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="relative overflow-hidden rounded-2xl glass-card p-4 sm:p-6 md:p-7 shine-overlay">
            <div className="absolute -top-16 -right-10 w-40 h-40 opacity-40">
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    'radial-gradient(circle, hsl(var(--primary) / 0.8) 0%, transparent 70%)',
                  filter: 'blur(40px)',
                }}
                animate={{ scale: [1, 1.1, 1], x: [0, 10, 0], y: [0, -10, 0] }}
                transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>
            <div className="relative z-10 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground">
                  Community
                </h1>
                <Badge variant="secondary" className="ml-1">
                  {users.length} members
                </Badge>
              </div>
              <p className="text-sm sm:text-base text-muted-foreground">
                Discover and connect with music lovers in the $ongChainn community.
                Follow listeners, find town square regulars, and watch new profiles appear.
              </p>
            </div>
          </div>
        </motion.section>

        {onlineUsers.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="mb-6"
          >
            <div className="glass-card rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <h2 className="font-heading text-lg font-semibold text-foreground">
                    Online now
                  </h2>
                </div>
                <Badge variant="secondary">
                  {onlineUsers.length} online
                </Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {onlineUsers.slice(0, viewMode === 'grid' ? 8 : 10).map((profile) => {
                  const displayName = safeDisplayName(profile.display_name, profile.username);
                  const initial = safeInitials(profile.display_name, profile.username, 'L');
                  return (
                  <button
                    key={profile.user_id}
                    type="button"
                    className="flex items-center gap-3 rounded-xl bg-background/60 px-3 py-2 text-left hover:bg-background/80 transition-colors"
                    onClick={() => void goToProfile(profile.user_id)}
                  >
                    <Avatar className="w-10 h-10 border border-border">
                      <AvatarImage src={profile.avatar_url || ''} onError={handleImageError} />
                      <AvatarFallback className="bg-primary/20 text-primary text-sm font-bold">
                        {initial}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {displayName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatPresenceLabel(true, lastSeenByUserId[profile.user_id] ?? null)}
                      </p>
                    </div>
                  </button>
                );})}
              </div>
            </div>
          </motion.section>
        )}

        {/* Search and Filters */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6 space-y-4"
        >
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search members..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-2 bg-muted rounded-lg p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-md transition-colors ${
                  viewMode === 'grid' ? 'bg-background shadow-sm' : 'hover:bg-background/50'
                }`}
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-md transition-colors ${
                  viewMode === 'list' ? 'bg-background shadow-sm' : 'hover:bg-background/50'
                }`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Sort Tabs */}
          <Tabs value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="newest" className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Newest
              </TabsTrigger>
              <TabsTrigger value="popular" className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Popular
              </TabsTrigger>
              <TabsTrigger value="active" className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Recent
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </motion.div>

        {loadError && !isLoading && (
          <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {loadError}
          </div>
        )}

        {/* Users List */}
        {isLoading ? (
          <div className={`grid gap-4 ${viewMode === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1'}`}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="glass-card rounded-2xl p-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="w-16 h-16 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : derivedUsers.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16"
          >
            <Users className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No members found</h3>
            <p className="text-muted-foreground">
              {searchQuery ? 'Try a different search term' : 'Be the first to join!'}
            </p>
          </motion.div>
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className={`grid gap-4 ${viewMode === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}
          >
            {derivedUsers.map((profile, index) => (
              <motion.div
                key={profile.id}
                variants={itemVariants}
                whileHover={{ y: -4, scale: 1.01 }}
                className={`group relative glass-card rounded-2xl overflow-hidden cursor-pointer transition-all hover:shadow-float ${
                  viewMode === 'list' ? 'flex items-center' : ''
                }`}
                onClick={() => void goToProfile(profile.user_id)}
              >
                {/* Cover Photo / Background */}
                {viewMode === 'grid' && (
                  <div className="h-20 relative overflow-hidden">
                    {profile.cover_photo_url ? (
                      <img 
                        src={profile.cover_photo_url} 
                        alt="" 
                        className="w-full h-full object-cover"
                        onError={handleImageError}
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-primary/30 via-purple-500/20 to-cyan-500/20" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
                    
                    {/* New User Badge */}
                    {isNewUser(profile.created_at) && (
                      <div className="absolute top-2 right-2">
                        <Badge className="bg-green-500/90 text-white border-0 text-xs">
                          <Sparkles className="w-3 h-3 mr-1" />
                          New
                        </Badge>
                      </div>
                    )}
                  </div>
                )}

                <div className={`p-4 ${viewMode === 'grid' ? '-mt-8 relative z-10' : 'flex-1 flex items-center gap-4'}`}>
                  {/* Avatar */}
                  <div className={`${viewMode === 'grid' ? 'mb-3' : ''}`}>
                    <Avatar className={`${viewMode === 'grid' ? 'w-16 h-16' : 'w-14 h-14'} border-4 border-background shadow-lg`}>
                      <AvatarImage src={profile.avatar_url || ''} onError={handleImageError} />
                      <AvatarFallback className="bg-primary/20 text-primary text-xl font-bold">
                        {safeInitials(profile.display_name, profile.username, 'L')}
                      </AvatarFallback>
                    </Avatar>
                  </div>

                  {/* User Info */}
                  <div className={`${viewMode === 'list' ? 'flex-1 min-w-0' : ''}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full ${onlineUserIds.has(profile.user_id) ? 'bg-green-500' : 'bg-muted'}`} />
                      <h3 className="font-semibold text-foreground truncate">
                          {safeDisplayName(profile.display_name, profile.username)}
                      </h3>
                      {!onlineUserIds.has(profile.user_id) && (
                        <span className="text-xs text-muted-foreground">
                          {presenceRefreshAt >= 0 &&
                            formatPresenceLabel(
                              false,
                              lastSeenByUserId[profile.user_id] ??
                                (profile.updated_at ? new Date(profile.updated_at).getTime() : null)
                            )}
                        </span>
                      )}
                      {viewMode === 'list' && isNewUser(profile.created_at) && (
                        <Badge className="bg-green-500/90 text-white border-0 text-xs shrink-0">
                          New
                        </Badge>
                      )}
                    </div>
                    {/* Location */}
                    {profile.location && (
                      <p className="text-sm text-primary flex items-center gap-1 mb-2">
                        <MapPin className="w-3 h-3" />
                        {profile.location}
                      </p>
                    )}

                    {profile.bio && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                        {profile.bio}
                      </p>
                    )}

                    {/* Stats */}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {profile.follower_count || 0} followers
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle className="w-3 h-3" />
                        {profile.post_count || 0} posts
                      </span>
                    </div>

                    {/* Joined Date */}
                    {(() => {
                      const d = new Date(profile.created_at);
                      const valid = !isNaN(d.getTime());
                      return valid ? (
                        <p className="text-xs text-muted-foreground/60 mt-2 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Joined {formatDistanceToNow(d, { addSuffix: true })}
                        </p>
                      ) : null;
                    })()}
                  </div>

                  {/* Follow Button */}
                  {profile.user_id !== user?.id && (
                    <div className={`${viewMode === 'grid' ? 'mt-4' : 'shrink-0'}`}>
                      <Button
                        size="sm"
                        variant={isFollowing(profile.user_id) ? 'secondary' : 'default'}
                        className={`${viewMode === 'grid' ? 'w-full' : ''} gap-2`}
                        onClick={(e) => handleFollow(profile.user_id, e)}
                      >
                        {isFollowing(profile.user_id) ? (
                          <>
                            <Check className="w-4 h-4" />
                            Following
                          </>
                        ) : (
                          <>
                            <UserPlus className="w-4 h-4" />
                            Follow
                          </>
                        )}
                      </Button>
                    </div>
                  )}

                  {/* Own Profile Badge */}
                  {profile.user_id === user?.id && (
                    <div className={`${viewMode === 'grid' ? 'mt-4' : 'shrink-0'}`}>
                      <Badge variant="outline" className="w-full justify-center">
                        You
                      </Badge>
                    </div>
                  )}
                </div>

                {/* Hover overlay for grid view */}
                {viewMode === 'grid' && (
                  <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                )}
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Stats Footer */}
        {!isLoading && derivedUsers.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-8 text-center text-sm text-muted-foreground"
          >
            <p>
              Showing {derivedUsers.length} of {users.length} community members
            </p>
          </motion.div>
        )}
      </main>

      <AudioPlayer />
    </div>
  );
}
