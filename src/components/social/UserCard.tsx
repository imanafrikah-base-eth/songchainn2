import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AudienceProfile } from '@/types/database';
import { motion } from 'framer-motion';
import { formatPresenceLabel, useUserPresence } from '@/hooks/useUserPresence.ts';

interface UserCardProps {
  profile: AudienceProfile;
  isFollowing: boolean;
  onFollow: (userId: string) => void;
  mutualCount?: number;
}

export function UserCard({ profile, isFollowing, onFollow, mutualCount }: UserCardProps) {
  const { isOnline, lastSeenAt } = useUserPresence(profile.user_id, { includeLastSeen: true, includeNowPlayingFallback: false });
  const presenceLabel = formatPresenceLabel(isOnline, lastSeenAt);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center justify-between p-3 bg-card border border-border rounded-xl hover:bg-card/80 transition-colors"
    >
      <div className="flex items-center gap-3">
        <Avatar className="w-12 h-12">
          <AvatarImage src={profile.profile_picture_url || ''} />
          <AvatarFallback className="bg-primary/20 text-primary">
            {profile.profile_name?.charAt(0) || '?'}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="font-semibold text-foreground inline-flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-muted'}`} />
            <span>{profile.profile_name}</span>
          </p>
          <p className="text-xs text-muted-foreground">{presenceLabel}</p>
          {profile.bio && (
            <p className="text-sm text-muted-foreground line-clamp-1">{profile.bio}</p>
          )}
          {mutualCount !== undefined && mutualCount > 0 && (
            <p className="text-xs text-primary">{mutualCount} mutual followers</p>
          )}
        </div>
      </div>
      <Button
        variant={isFollowing ? 'secondary' : 'default'}
        size="sm"
        onClick={() => onFollow(profile.user_id)}
      >
        {isFollowing ? 'Following' : 'Follow'}
      </Button>
    </motion.div>
  );
}
