import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { AudienceProfile } from '@/types/database';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Every kind of notification the app knows how to draw.
 *
 * 'follow', 'like', 'comment', 'new_release' and 'artist_claim' are written by
 * database triggers; 'post_tag' and 'comment_like' by the client;
 * 'payment_sent' and 'payment_received' by the money triggers and the
 * payment-receipt edge function. The open string at the end is deliberate: a
 * type the database learns before the app does must fall through to a
 * sensible default, never crash the tray.
 */
export type KnownNotificationType =
  | 'follow'
  | 'like'
  | 'comment'
  | 'mention'
  | 'playlist'
  | 'announcement'
  | 'post_tag'
  | 'comment_like'
  | 'new_release'
  | 'artist_claim'
  | 'payment_sent'
  | 'payment_received';

export type NotificationType = KnownNotificationType | (string & {});

export interface NotificationMetadata {
  cta_path?: string;
  post_id?: string;
  comment_id?: string;
  song_id?: string;
  artist_id?: string;
  artist_name?: string;
  title?: string;
  status?: 'approved' | 'rejected' | string;
  playlist_id?: string;
  tx_hash?: string;
  amount?: string | null;
  [key: string]: unknown;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  from_user_id: string | null;
  post_id: string | null;
  message: string | null;
  title?: string | null;
  metadata?: NotificationMetadata | null;
  is_read: boolean;
  /** Set when the tray was opened with this row in it. Drives the badge only. */
  seen_at?: string | null;
  created_at: string;
  from_profile?: AudienceProfile;
}

const PROFILE_COLUMNS = 'id,user_id,display_name,profile_name,username,avatar_url,profile_picture_url,is_official';

type InsertListener = (payload: any) => Promise<void>;

/*
 * One realtime channel per user, shared by every mounted consumer. It used to
 * keep only the FIRST consumer's callback, so when Home mounted the hook before
 * the bell did, the bell never heard a new notification arrive.
 */
const notificationChannelsByUser = new Map<string, RealtimeChannel>();
const notificationListenersByUser = new Map<string, Set<InsertListener>>();
const notificationTeardownTimersByUser = new Map<string, ReturnType<typeof setTimeout>>();

function ensureNotificationsChannel(userId: string) {
  const existing = notificationChannelsByUser.get(userId);
  if (existing) return existing;

  const channel = supabase
    .channel(`notifications-realtime:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const listeners = notificationListenersByUser.get(userId);
        listeners?.forEach((listener) => {
          void listener(payload);
        });
      }
    )
    .subscribe();

  notificationChannelsByUser.set(userId, channel);
  return channel;
}

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  /** Rows in the list still highlighted as unread. */
  const [unreadCount, setUnreadCount] = useState(0);
  /** The badge: every row never shown in an opened tray, not capped at the list. */
  const [unseenCount, setUnseenCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUnseenCount = useCallback(async () => {
    if (!user) return;
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('seen_at' as never, null);
    if (!error) setUnseenCount(count ?? 0);
  }, [user]);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    void fetchUnseenCount();

    const { data: notificationsData } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (notificationsData && notificationsData.length > 0) {
      const fromUserIds = [...new Set(notificationsData.map(n => n.from_user_id).filter((id): id is string => !!id))];

      // from_user_id is an auth user id. Profiles key it as user_id, with id
      // usually equal, so look up by both the way the feed does.
      const { data: profilesData } = fromUserIds.length > 0
        ? await supabase
            .from('audience_profiles')
            .select(PROFILE_COLUMNS)
            .or(`id.in.(${fromUserIds.join(',')}),user_id.in.(${fromUserIds.join(',')})`)
        : { data: [] as AudienceProfile[] };

      const normalizedProfiles = ((profilesData as any[]) || []).map((p) => ({
        ...p,
        user_id: p?.user_id ?? p?.id,
      })) as AudienceProfile[];

      const profilesMap = new Map<string, AudienceProfile>();
      normalizedProfiles.forEach((p) => {
        profilesMap.set(String(p.id), p);
        if (p.user_id) profilesMap.set(String(p.user_id), p);
      });

      const enrichedNotifications: Notification[] = notificationsData.map(n => ({
        id: n.id,
        user_id: n.user_id,
        type: n.type as NotificationType,
        from_user_id: n.from_user_id,
        post_id: n.post_id,
        message: n.message,
        title: (n as any).title ?? null,
        metadata: (n as any).metadata ?? null,
        is_read: n.is_read,
        seen_at: (n as any).seen_at ?? null,
        created_at: n.created_at,
        from_profile: n.from_user_id ? profilesMap.get(String(n.from_user_id)) : undefined,
      }));

      setNotifications(enrichedNotifications);
      setUnreadCount(enrichedNotifications.filter(n => !n.is_read).length);
    } else {
      setNotifications([]);
      setUnreadCount(0);
    }

    setIsLoading(false);
  }, [user, fetchUnseenCount]);

  /**
   * Opening the tray. The badge goes to zero at once and the server is told
   * afterwards; nothing is marked read, so every row keeps its highlight until
   * it is tapped.
   */
  const markAllSeen = useCallback(async () => {
    if (!user) return;
    setUnseenCount(0);
    const now = new Date().toISOString();
    setNotifications(prev => prev.map(n => (n.seen_at ? n : { ...n, seen_at: now })));
    try {
      await supabase.rpc('mark_notifications_seen' as never);
    } catch {
      /* the badge already cleared; the next fetch will reconcile */
    }
  }, [user]);

  const markAsRead = useCallback(async (notificationId: string) => {
    if (!user) return;

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('user_id', user.id);

    if (!error) {
      setNotifications(prev =>
        prev.map(n => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
  }, [user]);

  const markAllAsRead = useCallback(async () => {
    if (!user) return;

    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, [user]);

  const createNotification = useCallback(async (
    toUserId: string,
    type: 'follow' | 'like' | 'comment' | 'mention' | 'playlist' | 'post_tag' | 'comment_like',
    postId?: string,
    message?: string
  ) => {
    if (!user || toUserId === user.id) return;

    const { error } = await supabase
      .from('notifications')
      .insert({
        user_id: toUserId,
        type,
        from_user_id: user.id,
        post_id: postId || null,
        message: message || null,
      });

    if (error && import.meta.env.DEV) {
      console.error('Failed to create notification', error);
    }
  }, [user]);

  const deleteNotification = useCallback(async (notificationId: string) => {
    if (!user) return;

    const notification = notifications.find(n => n.id === notificationId);

    await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId);

    setNotifications(prev => prev.filter(n => n.id !== notificationId));
    if (notification && !notification.is_read) {
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
    if (notification && !notification.seen_at) {
      setUnseenCount(prev => Math.max(0, prev - 1));
    }
  }, [user, notifications]);

  // Initial fetch
  useEffect(() => {
    if (user) {
      fetchNotifications();
    }
  }, [user, fetchNotifications]);

  // Real-time subscription
  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;

    const pendingTimer = notificationTeardownTimersByUser.get(userId);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      notificationTeardownTimersByUser.delete(userId);
    }

    const listener: InsertListener = async (payload) => {
      const newNotification = payload.new as Notification;

      // Fetch the from_user's profile. A trigger-written release or claim
      // notice has no sender at all, so there is nothing to look up.
      const { data: profileData } = newNotification.from_user_id
        ? await supabase
            .from('audience_profiles')
            .select(PROFILE_COLUMNS)
            .or(`id.eq.${newNotification.from_user_id},user_id.eq.${newNotification.from_user_id}`)
            .limit(1)
            .maybeSingle()
        : { data: null };

      const enrichedNotification: Notification = {
        ...newNotification,
        type: newNotification.type as NotificationType,
        from_profile: profileData
          ? ({
              ...(profileData as any),
              user_id: (profileData as any)?.user_id ?? (profileData as any)?.id ?? newNotification.from_user_id,
            } as AudienceProfile)
          : undefined,
      };

      setNotifications(prev => [enrichedNotification, ...prev]);
      setUnreadCount(prev => prev + 1);
      setUnseenCount(prev => prev + 1);
    };

    const listeners = notificationListenersByUser.get(userId) ?? new Set<InsertListener>();
    listeners.add(listener);
    notificationListenersByUser.set(userId, listeners);
    ensureNotificationsChannel(userId);

    return () => {
      const current = notificationListenersByUser.get(userId);
      current?.delete(listener);
      if (!current || current.size === 0) {
        // Delay cleanup to survive React StrictMode remount cycle in development.
        const timer = setTimeout(() => {
          const live = notificationListenersByUser.get(userId);
          if (!live || live.size === 0) {
            const liveChannel = notificationChannelsByUser.get(userId);
            if (liveChannel) {
              supabase.removeChannel(liveChannel);
              notificationChannelsByUser.delete(userId);
            }
            notificationListenersByUser.delete(userId);
          }
          notificationTeardownTimersByUser.delete(userId);
        }, 1500);
        notificationTeardownTimersByUser.set(userId, timer);
      }
    };
  }, [user]);

  return {
    notifications,
    unreadCount,
    unseenCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    markAllSeen,
    createNotification,
    deleteNotification,
    refetch: fetchNotifications,
  };
}
