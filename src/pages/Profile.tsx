import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Camera, Edit3, ExternalLink, Gift, Heart, ListMusic, Loader2, Save, Star, Users, X as XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthContext';
import { useAudienceInteractions } from '@/hooks/useAudienceInteractions';
import { useReferrals } from '@/hooks/useReferrals';
import { useToast } from '@/hooks/use-toast';
import { Navigation } from '@/components/Navigation';
import { SONGS } from '@/data/musicData';
import { InviteFriends } from '@/components/InviteFriends';
import { NotificationSettings } from '@/components/NotificationSettings';
import { Link, Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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

let resolvedAudienceStorageBucket: Promise<string> | null = null;

async function resolveStorageBucket(preferredBucket: string) {
  if (!resolvedAudienceStorageBucket) {
    resolvedAudienceStorageBucket = (async () => {
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

  return resolvedAudienceStorageBucket;
}

export default function Profile() {
  const { user, audienceProfile, refreshProfile, isArtist, artistId, needsOnboarding } = useAuth();
  const { likedSongs, playlists } = useAudienceInteractions();
  const { points, completedReferrals, shareInviteLink } = useReferrals();
  const { toast } = useToast();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const profilePictureInputRef = useRef<HTMLInputElement | null>(null);
  const coverPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploadingProfilePicture, setIsUploadingProfilePicture] = useState(false);
  const [isUploadingCoverPhoto, setIsUploadingCoverPhoto] = useState(false);
  const [isCoverCropOpen, setIsCoverCropOpen] = useState(false);
  const [coverDraftFile, setCoverDraftFile] = useState<File | null>(null);
  const [coverDraftUrl, setCoverDraftUrl] = useState<string | null>(null);
  const [coverCropOffsetY, setCoverCropOffsetY] = useState(0);
  const [coverCropMaxOffset, setCoverCropMaxOffset] = useState(0);
  const [isSavingCroppedCover, setIsSavingCroppedCover] = useState(false);
  const coverPreviewRef = useRef<HTMLDivElement | null>(null);
  const coverPreviewImageRef = useRef<HTMLImageElement | null>(null);
  const coverDragStateRef = useRef<{ startY: number; startOffset: number } | null>(null);
  const [isAvatarCropOpen, setIsAvatarCropOpen] = useState(false);
  const [avatarDraftFile, setAvatarDraftFile] = useState<File | null>(null);
  const [avatarDraftUrl, setAvatarDraftUrl] = useState<string | null>(null);
  const [avatarOffsetX, setAvatarOffsetX] = useState(0);
  const [avatarOffsetY, setAvatarOffsetY] = useState(0);
  const [avatarMaxOffsetX, setAvatarMaxOffsetX] = useState(0);
  const [avatarMaxOffsetY, setAvatarMaxOffsetY] = useState(0);
  const [isSavingCroppedAvatar, setIsSavingCroppedAvatar] = useState(false);
  const avatarPreviewRef = useRef<HTMLDivElement | null>(null);
  const avatarDragStateRef = useRef<{
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);
  
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
      const extRaw = file.name.split('.').pop() || '';
      const ext = extRaw.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'jpg';
      const path = `audience/${user.id}/${field}-${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
      const preferredBucket = (import.meta as any).env?.VITE_SUPABASE_STORAGE_BUCKET || 'artist-posts';
      const bucket = await resolveStorageBucket(preferredBucket);

      const uploadRes = await supabase.storage
        .from(bucket)
        .upload(path, file, { contentType: file.type, upsert: true });
      if (uploadRes.error) throw uploadRes.error;

      const publicUrl = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;

      const { error: updateError } = await supabase
        .from('audience_profiles')
        .update({ [field]: publicUrl } as any)
        .or(`id.eq.${user.id},user_id.eq.${user.id}`);
      if (updateError) throw updateError;

      await refreshProfile();
      toast({ title: field === 'profile_picture_url' ? 'Profile picture updated!' : 'Cover photo updated!' });
    },
    [refreshProfile, toast, user]
  );

  const handleProfilePictureChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
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

      const url = URL.createObjectURL(file);
      setAvatarDraftFile(file);
      setAvatarDraftUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setAvatarOffsetX(0);
      setAvatarOffsetY(0);
      setAvatarMaxOffsetX(0);
      setAvatarMaxOffsetY(0);
      setIsAvatarCropOpen(true);
    },
    [toast]
  );

  const handleCoverPhotoChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
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

      const url = URL.createObjectURL(file);
      setCoverDraftFile(file);
      setCoverDraftUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setCoverCropOffsetY(0);
      setCoverCropMaxOffset(0);
      setIsCoverCropOpen(true);
    },
    [toast]
  );

  const closeCoverCrop = useCallback(() => {
    setIsCoverCropOpen(false);
    setCoverDraftFile(null);
    setCoverCropOffsetY(0);
    setCoverCropMaxOffset(0);
    if (coverDraftUrl) {
      URL.revokeObjectURL(coverDraftUrl);
    }
    setCoverDraftUrl(null);
  }, [coverDraftUrl]);

  const closeAvatarCrop = useCallback(() => {
    setIsAvatarCropOpen(false);
    setAvatarDraftFile(null);
    setAvatarOffsetX(0);
    setAvatarOffsetY(0);
    setAvatarMaxOffsetX(0);
    setAvatarMaxOffsetY(0);
    if (avatarDraftUrl) {
      URL.revokeObjectURL(avatarDraftUrl);
    }
    setAvatarDraftUrl(null);
  }, [avatarDraftUrl]);

  const cropAndUploadCover = useCallback(async () => {
    if (!coverDraftFile || !user) return;
    const imgUrl = URL.createObjectURL(coverDraftFile);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(err);
        img.src = imgUrl;
      });

      const container = coverPreviewRef.current;
      if (!container) throw new Error('missing-container');

      const rect = container.getBoundingClientRect();
      const containerWidth = rect.width || 800;
      const containerHeight = rect.height || 240;

      const scale = containerWidth / image.naturalWidth;
      const displayedHeight = image.naturalHeight * scale;
      const maxOffset = Math.max(0, (displayedHeight - containerHeight) / 2);
      const clampedOffset = Math.min(maxOffset, Math.max(-maxOffset, coverCropOffsetY));

      const centerDisplayedY = displayedHeight / 2 + clampedOffset;
      const topDisplayed = centerDisplayedY - containerHeight / 2;
      const topOriginal = topDisplayed / scale;
      const cropHeightOriginal = containerHeight / scale;

      const outputWidth = 1600;
      const outputHeight = Math.round((containerHeight / containerWidth) * outputWidth);

      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('missing-context');

      ctx.drawImage(
        image,
        0,
        topOriginal,
        image.naturalWidth,
        cropHeightOriginal,
        0,
        0,
        outputWidth,
        outputHeight
      );

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.9)
      );
      if (!blob) throw new Error('missing-blob');

      const croppedFile = new File([blob], coverDraftFile.name || 'cover.jpg', {
        type: 'image/jpeg',
      });

      setIsUploadingCoverPhoto(true);
      try {
        await uploadAndUpdateProfileImage(croppedFile, 'cover_photo_url');
      } finally {
        setIsUploadingCoverPhoto(false);
      }
    } finally {
      URL.revokeObjectURL(imgUrl);
    }
  }, [coverCropOffsetY, coverDraftFile, uploadAndUpdateProfileImage, user]);

  const cropAndUploadAvatar = useCallback(async () => {
    if (!avatarDraftFile || !user) return;
    const imgUrl = URL.createObjectURL(avatarDraftFile);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(err);
        img.src = imgUrl;
      });

      const container = avatarPreviewRef.current;
      if (!container) throw new Error('missing-container');

      const rect = container.getBoundingClientRect();
      const containerWidth = rect.width || 240;
      const containerHeight = rect.height || 240;

      const scale = containerWidth / image.naturalWidth;
      const displayedWidth = image.naturalWidth * scale;
      const displayedHeight = image.naturalHeight * scale;

      const maxOffsetX = Math.max(0, (displayedWidth - containerWidth) / 2);
      const maxOffsetY = Math.max(0, (displayedHeight - containerHeight) / 2);
      const clampedOffsetX = Math.min(
        maxOffsetX,
        Math.max(-maxOffsetX, avatarOffsetX)
      );
      const clampedOffsetY = Math.min(
        maxOffsetY,
        Math.max(-maxOffsetY, avatarOffsetY)
      );

      const centerDisplayedX = displayedWidth / 2 + clampedOffsetX;
      const centerDisplayedY = displayedHeight / 2 + clampedOffsetY;

      const leftDisplayed = centerDisplayedX - containerWidth / 2;
      const topDisplayed = centerDisplayedY - containerHeight / 2;

      const leftOriginal = leftDisplayed / scale;
      const topOriginal = topDisplayed / scale;
      const cropSizeOriginal = containerWidth / scale;

      const outputSize = 600;
      const canvas = document.createElement('canvas');
      canvas.width = outputSize;
      canvas.height = outputSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('missing-context');

      ctx.save();
      ctx.beginPath();
      ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      ctx.drawImage(
        image,
        leftOriginal,
        topOriginal,
        cropSizeOriginal,
        cropSizeOriginal,
        0,
        0,
        outputSize,
        outputSize
      );

      ctx.restore();

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png', 0.9)
      );
      if (!blob) throw new Error('missing-blob');

      const croppedFile = new File([blob], avatarDraftFile.name || 'avatar.png', {
        type: 'image/png',
      });

      setIsUploadingProfilePicture(true);
      try {
        await uploadAndUpdateProfileImage(croppedFile, 'profile_picture_url');
      } finally {
        setIsUploadingProfilePicture(false);
      }
    } finally {
      URL.revokeObjectURL(imgUrl);
    }
  }, [avatarDraftFile, avatarOffsetX, avatarOffsetY, uploadAndUpdateProfileImage, user]);

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
          base_profile_link: baseProfileLink.trim() || null,
        } as any)
        .or(`id.eq.${user.id},user_id.eq.${user.id}`);
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
  const artistFollowerCount = 0;

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
        {user && (
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

      <Dialog open={isCoverCropOpen} onOpenChange={(open) => !open && !isSavingCroppedCover && closeCoverCrop()}>
        <DialogContent className="max-w-lg w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle>Adjust cover photo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div
              ref={coverPreviewRef}
              className="relative w-full h-48 overflow-hidden rounded-xl bg-muted touch-pan-y"
              onPointerDown={(e) => {
                if (!coverDraftUrl) return;
                coverDragStateRef.current = { startY: e.clientY, startOffset: coverCropOffsetY };
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (!coverDragStateRef.current) return;
                const deltaY = e.clientY - coverDragStateRef.current.startY;
                const nextOffset = coverDragStateRef.current.startOffset + deltaY;
                const clamped = Math.min(
                  coverCropMaxOffset,
                  Math.max(-coverCropMaxOffset, nextOffset)
                );
                setCoverCropOffsetY(clamped);
              }}
              onPointerUp={(e) => {
                if (!coverDragStateRef.current) return;
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                coverDragStateRef.current = null;
              }}
              onPointerLeave={(e) => {
                if (!coverDragStateRef.current) return;
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                coverDragStateRef.current = null;
              }}
            >
              {coverDraftUrl && (
                <>
                  <img
                    ref={coverPreviewImageRef}
                    src={coverDraftUrl}
                    alt="Cover preview"
                    className="absolute left-1/2 top-1/2 -translate-x-1/2"
                    onLoad={(event) => {
                      const img = event.currentTarget;
                      const container = coverPreviewRef.current;
                      if (!container) return;
                      const rect = container.getBoundingClientRect();
                      const containerWidth = rect.width || 800;
                      const containerHeight = rect.height || 240;
                      const scale = containerWidth / img.naturalWidth;
                      const displayedHeight = img.naturalHeight * scale;
                      const maxOffset = Math.max(0, (displayedHeight - containerHeight) / 2);
                      setCoverCropMaxOffset(maxOffset);
                      setCoverCropOffsetY(0);
                    }}
                    style={{
                      transform: `translate(-50%, ${coverCropOffsetY}px)`,
                      width: '100%',
                      height: 'auto',
                    }}
                  />
                  <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-3">
                    <div className="px-3 py-1 rounded-full bg-background/70 text-[10px] font-medium tracking-wide text-foreground/80">
                      Drag to reposition
                    </div>
                  </div>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Drag the photo up or down to choose which part shows in your cover. You
              can change the photo before saving.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => coverPhotoInputRef.current?.click()}
              disabled={isSavingCroppedCover}
            >
              Change photo
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (isSavingCroppedCover) return;
                closeCoverCrop();
              }}
              disabled={isSavingCroppedCover}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={async () => {
                if (!coverDraftFile || isSavingCroppedCover) return;
                setIsSavingCroppedCover(true);
                try {
                  await cropAndUploadCover();
                  closeCoverCrop();
                } catch (err) {
                  toast({ title: 'Failed to update cover photo', variant: 'destructive' });
                } finally {
                  setIsSavingCroppedCover(false);
                }
              }}
              disabled={!coverDraftFile || isSavingCroppedCover}
            >
              {isSavingCroppedCover ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Save photo'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAvatarCropOpen} onOpenChange={(open) => !open && !isSavingCroppedAvatar && closeAvatarCrop()}>
        <DialogContent className="max-w-sm w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle>Adjust profile picture</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div
              ref={avatarPreviewRef}
              className="relative w-full max-w-xs mx-auto aspect-square overflow-hidden rounded-full bg-muted touch-pan-y"
              onPointerDown={(e) => {
                if (!avatarDraftUrl) return;
                avatarDragStateRef.current = {
                  startX: e.clientX,
                  startY: e.clientY,
                  startOffsetX: avatarOffsetX,
                  startOffsetY: avatarOffsetY,
                };
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (!avatarDragStateRef.current) return;
                const deltaX = e.clientX - avatarDragStateRef.current.startX;
                const deltaY = e.clientY - avatarDragStateRef.current.startY;
                const nextX = avatarDragStateRef.current.startOffsetX + deltaX;
                const nextY = avatarDragStateRef.current.startOffsetY + deltaY;
                const clampedX = Math.min(
                  avatarMaxOffsetX,
                  Math.max(-avatarMaxOffsetX, nextX)
                );
                const clampedY = Math.min(
                  avatarMaxOffsetY,
                  Math.max(-avatarMaxOffsetY, nextY)
                );
                setAvatarOffsetX(clampedX);
                setAvatarOffsetY(clampedY);
              }}
              onPointerUp={(e) => {
                if (!avatarDragStateRef.current) return;
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                avatarDragStateRef.current = null;
              }}
              onPointerLeave={(e) => {
                if (!avatarDragStateRef.current) return;
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                avatarDragStateRef.current = null;
              }}
            >
              {avatarDraftUrl && (
                <>
                  <img
                    src={avatarDraftUrl}
                    alt="Profile preview"
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                    onLoad={(event) => {
                      const img = event.currentTarget;
                      const container = avatarPreviewRef.current;
                      if (!container) return;
                      const rect = container.getBoundingClientRect();
                      const containerWidth = rect.width || 240;
                      const containerHeight = rect.height || 240;
                      const scale = containerWidth / img.naturalWidth;
                      const displayedHeight = img.naturalHeight * scale;
                      const displayedWidth = img.naturalWidth * scale;
                      const maxOffsetX = Math.max(0, (displayedWidth - containerWidth) / 2);
                      const maxOffsetY = Math.max(0, (displayedHeight - containerHeight) / 2);
                      setAvatarMaxOffsetX(maxOffsetX);
                      setAvatarMaxOffsetY(maxOffsetY);
                      setAvatarOffsetX(0);
                      setAvatarOffsetY(0);
                    }}
                    style={{
                      transform: `translate(-50%, -50%) translate(${avatarOffsetX}px, ${avatarOffsetY}px)`,
                      width: '100%',
                      height: 'auto',
                    }}
                  />
                  <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-3">
                    <div className="px-3 py-1 rounded-full bg-background/70 text-[10px] font-medium tracking-wide text-foreground/80">
                      Drag to reposition
                    </div>
                  </div>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Drag the photo to choose how it appears in your profile picture.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => profilePictureInputRef.current?.click()}
              disabled={isSavingCroppedAvatar}
            >
              Change photo
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (isSavingCroppedAvatar) return;
                closeAvatarCrop();
              }}
              disabled={isSavingCroppedAvatar}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={async () => {
                if (!avatarDraftFile || isSavingCroppedAvatar) return;
                setIsSavingCroppedAvatar(true);
                try {
                  await cropAndUploadAvatar();
                  closeAvatarCrop();
                } catch (err) {
                  toast({ title: 'Failed to update profile picture', variant: 'destructive' });
                } finally {
                  setIsSavingCroppedAvatar(false);
                }
              }}
              disabled={!avatarDraftFile || isSavingCroppedAvatar}
            >
              {isSavingCroppedAvatar ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Save photo'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-muted-foreground">
                  {audienceProfile.profile_name[0].toUpperCase()}
                </div>
              )}
            </div>
            {user && (
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
                    className="w-12 h-12 rounded-lg object-contain"
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
                    className="w-12 h-12 rounded-lg object-contain"
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
