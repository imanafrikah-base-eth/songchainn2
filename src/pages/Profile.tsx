import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Edit3, Save, X as XIcon, ExternalLink, Heart, ListMusic, Loader2, Gift, Star, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthContext';
import { useAudienceInteractions } from '@/hooks/useAudienceInteractions';
import { useReferrals } from '@/hooks/useReferrals';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Navigation } from '@/components/Navigation';
import { SONGS } from '@/data/musicData';
import { InviteFriends } from '@/components/InviteFriends';
import { NotificationSettings } from '@/components/NotificationSettings';

// X (Twitter) and Base icons
const XTwitterIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const BaseIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
    <circle cx="12" cy="12" r="10" fill="currentColor" />
    <path d="M12 6a6 6 0 100 12 6 6 0 000-12z" fill="hsl(var(--background))" />
  </svg>
);

export default function Profile() {
  const { user, audienceProfile, refreshProfile } = useAuth();
  const { likedSongs, playlists } = useAudienceInteractions();
  const { points, completedReferrals, shareInviteLink } = useReferrals();
  const { toast } = useToast();
  const [showInviteModal, setShowInviteModal] = useState(false);
  
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [profileName, setProfileName] = useState(audienceProfile?.profile_name || '');
  const [bio, setBio] = useState(audienceProfile?.bio || '');
  const [xProfileLink, setXProfileLink] = useState(audienceProfile?.x_profile_link || '');
  const [baseProfileLink, setBaseProfileLink] = useState(audienceProfile?.base_profile_link || '');

  useEffect(() => {
    if (audienceProfile) {
      setProfileName(audienceProfile.profile_name);
      setBio(audienceProfile.bio || '');
      setXProfileLink(audienceProfile.x_profile_link || '');
      setBaseProfileLink(audienceProfile.base_profile_link || '');
    }
  }, [audienceProfile]);

  const handleSave = async () => {
    if (!user || !profileName.trim()) {
      toast({ title: 'Profile name is required', variant: 'destructive' });
      return;
    }
    
    setIsSaving(true);
    
    try {
      const { error } = await supabase
        .from('audience_profiles')
        .update({
          profile_name: profileName.trim(),
          bio: bio.trim() || null,
          x_profile_link: xProfileLink.trim() || null,
          base_profile_link: baseProfileLink.trim() || null
        })
        .eq('user_id', user.id);
      
      if (error) throw error;
      
      await refreshProfile();
      setIsEditing(false);
      toast({ title: 'Profile updated!' });
    } catch (err) {
      toast({ title: 'Error updating profile', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const likedSongsData = SONGS.filter(s => likedSongs.includes(s.id));

  if (!audienceProfile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Cover Photo */}
      <div className="relative h-48 bg-gradient-to-br from-primary/30 to-primary/10">
        {audienceProfile.cover_photo_url && (
          <img
            src={audienceProfile.cover_photo_url}
            alt="Cover"
            className="w-full h-full object-cover"
          />
        )}
      </div>

      <div className="px-4 -mt-16 max-w-2xl mx-auto">
        {/* Profile Picture & Info */}
        <div className="flex items-end gap-4 mb-6">
          <div className="relative">
            <div className="w-28 h-28 rounded-full border-4 border-background overflow-hidden bg-secondary">
              {audienceProfile.profile_picture_url ? (
                <img
                  src={audienceProfile.profile_picture_url}
                  alt={audienceProfile.profile_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-muted-foreground">
                  {audienceProfile.profile_name[0].toUpperCase()}
                </div>
              )}
            </div>
          </div>

          <div className="flex-1">
            {isEditing ? (
              <Input
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                className="font-heading text-xl font-bold"
                maxLength={50}
              />
            ) : (
              <h1 className="font-heading text-2xl font-bold text-foreground">
                {audienceProfile.profile_name}
              </h1>
            )}
            <p className="text-sm text-muted-foreground">Audience Member</p>
          </div>

          <div>
            {isEditing ? (
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setIsEditing(false);
                    setProfileName(audienceProfile.profile_name);
                    setBio(audienceProfile.bio || '');
                    setXProfileLink(audienceProfile.x_profile_link || '');
                    setBaseProfileLink(audienceProfile.base_profile_link || '');
                  }}
                  disabled={isSaving}
                >
                  <XIcon className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
              >
                <Edit3 className="w-4 h-4 mr-2" />
                Edit
              </Button>
            )}
          </div>
        </div>

        {/* Bio */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-6"
        >
          {isEditing ? (
            <div className="space-y-2">
              <Textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell us about yourself..."
                maxLength={500}
                rows={3}
              />
              <p className="text-xs text-muted-foreground text-right">{bio.length}/500</p>
            </div>
          ) : (
            <p className="text-muted-foreground">
              {audienceProfile.bio || 'No bio yet'}
            </p>
          )}
        </motion.div>

        {/* Social Links */}
        {isEditing ? (
          <div className="space-y-3 mb-6">
            <Input
              value={xProfileLink}
              onChange={(e) => setXProfileLink(e.target.value)}
              placeholder="X (Twitter) profile URL"
            />
            <Input
              value={baseProfileLink}
              onChange={(e) => setBaseProfileLink(e.target.value)}
              placeholder="Base profile or wallet address"
            />
          </div>
        ) : (
          <div className="flex gap-3 mb-6">
            {audienceProfile.x_profile_link && (
              <a
                href={audienceProfile.x_profile_link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 bg-secondary rounded-lg hover:bg-secondary/80 transition-colors"
              >
                <XTwitterIcon />
                <span className="text-sm">X</span>
                <ExternalLink className="w-3 h-3 text-muted-foreground" />
              </a>
            )}
            {audienceProfile.base_profile_link && (
              <a
                href={audienceProfile.base_profile_link.startsWith('0x') 
                  ? `https://basescan.org/address/${audienceProfile.base_profile_link}` 
                  : audienceProfile.base_profile_link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 bg-secondary rounded-lg hover:bg-secondary/80 transition-colors"
              >
                <BaseIcon />
                <span className="text-sm">Base</span>
                <ExternalLink className="w-3 h-3 text-muted-foreground" />
              </a>
            )}
          </div>
        )}

        {/* Activity Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <Heart className="w-5 h-5 mx-auto text-primary mb-2" />
            <p className="text-2xl font-bold text-foreground">{likedSongs.length}</p>
            <p className="text-sm text-muted-foreground">Liked Songs</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <ListMusic className="w-5 h-5 mx-auto text-primary mb-2" />
            <p className="text-2xl font-bold text-foreground">{playlists.length}</p>
            <p className="text-sm text-muted-foreground">Playlists</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <Star className="w-5 h-5 mx-auto text-primary mb-2" />
            <p className="text-2xl font-bold text-foreground">{points?.total_points || 0}</p>
            <p className="text-sm text-muted-foreground">Points</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <Users className="w-5 h-5 mx-auto text-primary mb-2" />
            <p className="text-2xl font-bold text-foreground">{completedReferrals}</p>
            <p className="text-sm text-muted-foreground">Referrals</p>
          </div>
        </div>

        {/* Invite Friends Section */}
        <motion.div 
          className="bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 rounded-xl p-5 mb-8"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-xl bg-primary/20">
              <Gift className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-heading font-semibold text-foreground">Invite Friends</h3>
              <p className="text-sm text-muted-foreground">Earn 100 points for each friend who joins!</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button 
              onClick={() => setShowInviteModal(true)}
              variant="outline"
              className="flex-1"
            >
              View Details
            </Button>
            <Button 
              onClick={shareInviteLink}
              className="flex-1 gradient-primary"
            >
              Share Invite
            </Button>
          </div>
        </motion.div>

        {/* Notification Settings */}
        <div className="mb-8">
          <h2 className="font-heading text-lg font-semibold text-foreground mb-4">
            Settings
          </h2>
          <NotificationSettings />
        </div>

        {/* Liked Songs Preview */}
        {likedSongsData.length > 0 && (
          <div className="mb-8">
            <h2 className="font-heading text-lg font-semibold text-foreground mb-4">
              Liked Songs
            </h2>
            <div className="space-y-2">
              {likedSongsData.slice(0, 5).map((song) => (
                <div
                  key={song.id}
                  className="flex items-center gap-3 p-3 bg-card border border-border rounded-xl"
                >
                  <img
                    src={song.coverImage}
                    alt={song.title}
                    className="w-12 h-12 rounded-lg object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{song.title}</p>
                    <p className="text-sm text-muted-foreground truncate">{song.artist}</p>
                  </div>
                  <Heart className="w-4 h-4 text-primary fill-primary" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Early Access Note */}
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 text-center">
          <p className="text-sm text-muted-foreground">
            Your Audience activity here unlocks future access and ownership.
          </p>
        </div>
      </div>

      <Navigation />
      <InviteFriends isOpen={showInviteModal} onClose={() => setShowInviteModal(false)} />
    </div>
  );
}
