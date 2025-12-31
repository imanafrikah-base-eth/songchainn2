import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Camera, Edit3, ExternalLink, Gift, Heart, ListMusic, Loader2, Save, Star, Users, X as XIcon } from 'lucide-react';
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
import { Link, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

let resolvedProfileStorageBucket: Promise<string> | null = null;

async function resolveStorageBucket(preferredBucket: string) {
  if (!resolvedProfileStorageBucket) {
    resolvedProfileStorageBucket = (async () => {
      const listBuckets = (supabase.storage as any)?.listBuckets as undefined | (() => Promise<any>);
      if (!listBuckets) return preferredBucket;
      const { data, error } = await listBuckets();
      if (error || !Array.isArray(data)) return preferredBucket;
      const names = new Set<string>(data.map((b: any) => String(b?.name)));
      if (names.has(preferredBucket)) return preferredBucket;
      if (names.has('public')) return 'public';
      const first = data[0]?.name ? String(data[0].name) : preferredBucket;
      return first || preferredBucket;
    })();
  }

  return resolvedProfileStorageBucket;
}

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
  const { user, audienceProfile, refreshProfile, isArtist, artistId } = useAuth();
  const { likedSongs, playlists } = useAudienceInteractions();
  const { points, completedReferrals, shareInviteLink } = useReferrals();
  const { toast } = useToast();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const profilePictureInputRef = useRef<HTMLInputElement | null>(null);
  const coverPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploadingProfilePicture, setIsUploadingProfilePicture] = useState(false);
  const [isUploadingCoverPhoto, setIsUploadingCoverPhoto] = useState(false);
  
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

  const uploadAndUpdateProfileImage = useCallback(
    async (file: File, field: 'profile_picture_url' | 'cover_photo_url') => {
      if (!user) return;
      if (!isArtist) {
        toast({ title: 'Only artists can change images right now', variant: 'destructive' });
        return;
      }

      const extRaw = file.name.split('.').pop() || '';
      const ext = extRaw.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'jpg';
      const kind = field === 'profile_picture_url' ? 'profile' : 'cover';
      const path = `artists/${user.id}/${kind}-${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;

      const preferredBucket = (import.meta as any).env?.VITE_SUPABASE_STORAGE_BUCKET || 'artist-posts';
      const bucket = await resolveStorageBucket(preferredBucket);
      const uploadRes = await supabase.storage
        .from(bucket)
        .upload(path, file, { contentType: file.type, upsert: true });
      if (uploadRes.error) {
        const msg = String(uploadRes.error.message || '');
        if (msg.toLowerCase().includes('bucket') && msg.toLowerCase().includes('not found')) {
          resolvedProfileStorageBucket = null;
          const retryBucket = await resolveStorageBucket(preferredBucket);
          const retryRes = await supabase.storage
            .from(retryBucket)
            .upload(path, file, { contentType: file.type, upsert: true });
          if (retryRes.error) throw retryRes.error;
          const publicUrl = supabase.storage.from(retryBucket).getPublicUrl(path).data.publicUrl;
          const { error: updateError } = await supabase
            .from('audience_profiles')
            .update({ [field]: publicUrl } as any)
            .eq('user_id', user.id);
          if (updateError) throw updateError;
          await refreshProfile();
          toast({ title: field === 'profile_picture_url' ? 'Profile picture updated!' : 'Cover photo updated!' });
          return;
        }
        throw uploadRes.error;
      }

      const publicUrl = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;

      const { error: updateError } = await supabase
        .from('audience_profiles')
        .update({ [field]: publicUrl } as any)
        .eq('user_id', user.id);
      if (updateError) throw updateError;

      await refreshProfile();
      toast({ title: field === 'profile_picture_url' ? 'Profile picture updated!' : 'Cover photo updated!' });
    },
    [isArtist, refreshProfile, toast, user]
  );

  const handleProfilePictureChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        toast({ title: 'Image too large (max 10MB)', variant: 'destructive' });
        return;
      }
      if (!file.type.startsWith('image/')) {
        toast({ title: 'Please select an image file', variant: 'destructive' });
        return;
      }

      setIsUploadingProfilePicture(true);
      try {
        await uploadAndUpdateProfileImage(file, 'profile_picture_url');
      } catch (err: any) {
        toast({ title: 'Failed to update profile picture', variant: 'destructive' });
      } finally {
        setIsUploadingProfilePicture(false);
      }
    },
    [toast, uploadAndUpdateProfileImage]
  );

  const handleCoverPhotoChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        toast({ title: 'Image too large (max 10MB)', variant: 'destructive' });
        return;
      }
      if (!file.type.startsWith('image/')) {
        toast({ title: 'Please select an image file', variant: 'destructive' });
        return;
      }

      setIsUploadingCoverPhoto(true);
      try {
        await uploadAndUpdateProfileImage(file, 'cover_photo_url');
      } catch (err: any) {
        toast({ title: 'Failed to update cover photo', variant: 'destructive' });
      } finally {
        setIsUploadingCoverPhoto(false);
      }
    },
    [toast, uploadAndUpdateProfileImage]
  );

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
  const artistSongsData = isArtist && artistId ? SONGS.filter(s => s.artistId === artistId) : [];
  const { data: artistFollowerCount = 0 } = useQuery({
    queryKey: ['artist-followers', artistId],
    queryFn: async () => {
      if (!artistId) return 0;
      const { data, count, error } = await supabase
        .from('liked_artists')
        .select('artist_id', { count: 'exact' })
        .eq('artist_id', artistId);
      if (error) return 0;
      return count ?? data?.length ?? 0;
    },
    enabled: !!isArtist && !!artistId,
    staleTime: 1000 * 10,
    refetchInterval: 15000,
  });

  if (isArtist && artistId) {
    return <Navigate to={`/artist/${artistId}`} replace />;
  }

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
        <input
          ref={coverPhotoInputRef}
          type="file"
          accept="image/*"
          onChange={handleCoverPhotoChange}
          className="hidden"
        />
        {audienceProfile.cover_photo_url && (
          <img
            src={audienceProfile.cover_photo_url}
            alt="Cover"
            className="w-full h-full object-cover"
          />
        )}
        {isArtist && (
          <div className="absolute top-3 right-3">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              disabled={isUploadingCoverPhoto}
              onClick={() => coverPhotoInputRef.current?.click()}
              className="bg-background/80 backdrop-blur"
            >
              {isUploadingCoverPhoto ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            </Button>
          </div>
        )}
      </div>

      <div className="px-4 -mt-16 max-w-2xl mx-auto">
        {/* Profile Picture & Info */}
        <div className="flex items-end gap-4 mb-6">
          <div className="relative">
            <input
              ref={profilePictureInputRef}
              type="file"
              accept="image/*"
              onChange={handleProfilePictureChange}
              className="hidden"
            />
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
            {isArtist && (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                disabled={isUploadingProfilePicture}
                onClick={() => profilePictureInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 rounded-full bg-background/90 backdrop-blur"
              >
                {isUploadingProfilePicture ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              </Button>
            )}
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
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground">{isArtist ? 'Artist' : 'Audience Member'}</p>
              {isArtist && artistId && (
                <Link to={`/artist/${artistId}`} className="text-sm text-primary hover:underline">
                  View Artist Page
                </Link>
              )}
            </div>
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

        {isArtist && artistSongsData.length > 0 && (
          <div className="mb-8">
            <h2 className="font-heading text-lg font-semibold text-foreground mb-4">My Music</h2>
            <div className="space-y-2">
              {artistSongsData.map(song => (
                <Link
                  key={song.id}
                  to={`/song/${song.id}`}
                  className="flex items-center gap-3 p-3 bg-card border border-border rounded-xl hover:bg-card/70 transition-colors"
                >
                  <img
                    src={song.coverImage}
                    alt={song.title}
                    className="w-12 h-12 rounded-lg object-cover"
                    loading="lazy"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{song.title}</p>
                    <p className="text-sm text-muted-foreground truncate">{song.townSquare}</p>
                  </div>
                  <ListMusic className="w-4 h-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Activity Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-8">
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
          {isArtist && (
            <div className="bg-card border border-border rounded-xl p-4 text-center">
              <Users className="w-5 h-5 mx-auto text-primary mb-2" />
              <p className="text-2xl font-bold text-foreground">{artistFollowerCount.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">Followers</p>
            </div>
          )}
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
