import { useState, useEffect } from 'react';
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
import { useAuth } from '@/context/AuthContext';
import { useSocial } from '@/hooks/useSocial';
import { useTopProfiles } from '@/hooks/usePopularity';
import { Navigation } from '@/components/Navigation';
import { AudioPlayer } from '@/components/AudioPlayer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface UserProfile {
  id: string;
  user_id: string;
  profile_name: string;
  profile_picture_url: string | null;
  cover_photo_url: string | null;
  bio: string | null;
  location: string | null;
  created_at: string;
  x_profile_link: string | null;
  base_profile_link: string | null;
  follower_count?: number;
  post_count?: number;
  is_following?: boolean;
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
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'popular' | 'active'>('newest');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Fetch all users
  useEffect(() => {
    const fetchUsers = async () => {
      setIsLoading(true);
      
      const { data: profiles, error } = await supabase
        .from('audience_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching users:', error);
        setIsLoading(false);
        return;
      }

      // Get follower counts and post counts
      const userIds = profiles.map(p => p.user_id);
      
      const [followersRes, postsRes] = await Promise.all([
        supabase
          .from('user_follows')
          .select('following_id')
          .in('following_id', userIds),
        supabase
          .from('social_posts')
          .select('user_id')
          .in('user_id', userIds)
      ]);

      const followerCounts = new Map<string, number>();
      followersRes.data?.forEach(f => {
        followerCounts.set(f.following_id, (followerCounts.get(f.following_id) || 0) + 1);
      });

      const postCounts = new Map<string, number>();
      postsRes.data?.forEach(p => {
        postCounts.set(p.user_id, (postCounts.get(p.user_id) || 0) + 1);
      });

      const enrichedUsers: UserProfile[] = profiles.map(profile => ({
        ...profile,
        follower_count: followerCounts.get(profile.user_id) || 0,
        post_count: postCounts.get(profile.user_id) || 0,
      }));

      setUsers(enrichedUsers);
      setFilteredUsers(enrichedUsers);
      setIsLoading(false);
    };

    fetchUsers();
  }, []);

  // Filter and sort users
  useEffect(() => {
    let filtered = users.filter(u => 
      u.profile_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.bio?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    switch (sortBy) {
      case 'newest':
        filtered = filtered.sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        break;
      case 'popular':
        filtered = filtered.sort((a, b) => 
          (b.follower_count || 0) - (a.follower_count || 0)
        );
        break;
      case 'active':
        filtered = filtered.sort((a, b) => 
          (b.post_count || 0) - (a.post_count || 0)
        );
        break;
    }

    setFilteredUsers(filtered);
  }, [users, searchQuery, sortBy]);

  const handleFollow = async (userId: string, e: React.MouseEvent) => {
    e.stopPropagation();
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
    <div className="min-h-screen bg-background pb-24">
      <Navigation />

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-primary/10">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground">
              Community
            </h1>
            <Badge variant="secondary" className="ml-2">
              {users.length} members
            </Badge>
          </div>
          <p className="text-muted-foreground">
            Discover and connect with music lovers in the $ongChainn community
          </p>
        </motion.div>

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
                Most Active
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </motion.div>

        {/* Users List */}
        {isLoading ? (
          <div className={`grid gap-4 ${viewMode === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}>
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
        ) : filteredUsers.length === 0 ? (
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
            {filteredUsers.map((profile, index) => (
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
                      <AvatarImage src={profile.profile_picture_url || ''} />
                      <AvatarFallback className="bg-primary/20 text-primary text-xl font-bold">
                        {profile.profile_name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </div>

                  {/* User Info */}
                  <div className={`${viewMode === 'list' ? 'flex-1 min-w-0' : ''}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-foreground truncate">
                        {profile.profile_name}
                      </h3>
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
                    <p className="text-xs text-muted-foreground/60 mt-2 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Joined {formatDistanceToNow(new Date(profile.created_at), { addSuffix: true })}
                    </p>
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
        {!isLoading && filteredUsers.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-8 text-center text-sm text-muted-foreground"
          >
            <p>
              Showing {filteredUsers.length} of {users.length} community members
            </p>
          </motion.div>
        )}
      </main>

      <AudioPlayer />
    </div>
  );
}
