import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { AudienceProfile } from '@/types/database';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface Notification {
  id: string;
  user_id: string;
  type: 'follow' | 'like' | 'comment' | 'mention' | 'playlist';
  from_user_id: string;
  post_id: string | null;
  message: string | null;
  is_read: boolean;
  created_at: string;
  from_profile?: AudienceProfile;
}

const notificationChannelsByUser = new Map<string, RealtimeChannel>();
const notificationConsumersByUser = new Map<string, number>();
const notificationTeardownTimersByUser = new Map<string, ReturnType<typeof setTimeout>>();

function ensureNotificationsChannel(userId: string, onInsert: (payload: any) => Promise<void>) {
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
        void onInsert(payload);
      }
    )
    .subscribe();

  notificationChannelsByUser.set(userId, channel);
  return channel;
}

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    const { data: notificationsData } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (notificationsData && notificationsData.length > 0) {
      const fromUserIds = [...new Set(notificationsData.map(n => n.from_user_id))];
      
      const { data: profilesData } = await supabase
        .from('audience_profiles')
        .select('*')
        .in('id', fromUserIds);

      const normalizedProfiles = ((profilesData as any[]) || []).map((p) => ({
        ...p,
        user_id: p?.user_id ?? p?.id,
      })) as AudienceProfile[];

      const profilesMap = new Map(
        normalizedProfiles.map((p) => [p.user_id, p])
      );

      const enrichedNotifications: Notification[] = notificationsData.map(n => ({
        id: n.id,
        user_id: n.user_id,
        type: n.type as 'follow' | 'like' | 'comment' | 'mention' | 'playlist',
        from_user_id: n.from_user_id,
        post_id: n.post_id,
        message: n.message,
        is_read: n.is_read,
        created_at: n.created_at,
        from_profile: profilesMap.get(n.from_user_id),
      }));

      setNotifications(enrichedNotifications);
      setUnreadCount(enrichedNotifications.filter(n => !n.is_read).length);
    } else {
      setNotifications([]);
      setUnreadCount(0);
    }

    setIsLoading(false);
  }, [user]);

  const markAsRead = useCallback(async (notificationId: string) => {
    if (!user) return;

    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    setNotifications(prev =>
      prev.map(n => (n.id === notificationId ? { ...n, is_read: true } : n))
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
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
    type: 'follow' | 'like' | 'comment' | 'mention' | 'playlist',
    postId?: string,
    message?: string
  ) => {
    if (!user || toUserId === user.id) return; // Don't notify yourself

    await supabase
      .from('notifications')
      .insert({
        user_id: toUserId,
        type,
        from_user_id: user.id,
        post_id: postId || null,
        message: message || null,
      });
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

    notificationConsumersByUser.set(userId, (notificationConsumersByUser.get(userId) || 0) + 1);
    const channel = ensureNotificationsChannel(userId, async (payload) => {
      const newNotification = payload.new as Notification;

      // Fetch the from_user's profile
      const { data: profileData } = await supabase
        .from('audience_profiles')
        .select('*')
        .eq('id', newNotification.from_user_id)
        .single();

      const enrichedNotification: Notification = {
        ...newNotification,
        type: newNotification.type as 'follow' | 'like' | 'comment' | 'mention' | 'playlist',
        from_profile: profileData
          ? ({
              ...(profileData as any),
              user_id: (profileData as any)?.user_id ?? (profileData as any)?.id ?? newNotification.from_user_id,
            } as AudienceProfile)
          : undefined,
      };

      setNotifications(prev => [enrichedNotification, ...prev]);
      setUnreadCount(prev => prev + 1);
    });

    return () => {
      const current = Math.max(0, (notificationConsumersByUser.get(userId) || 0) - 1);
      notificationConsumersByUser.set(userId, current);
      if (current === 0) {
        // Delay cleanup to survive React StrictMode remount cycle in development.
        const timer = setTimeout(() => {
          if ((notificationConsumersByUser.get(userId) || 0) === 0) {
            const liveChannel = notificationChannelsByUser.get(userId);
            if (liveChannel) {
              supabase.removeChannel(liveChannel);
              notificationChannelsByUser.delete(userId);
            }
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
    isLoading,
    markAsRead,
    markAllAsRead,
    createNotification,
    deleteNotification,
    refetch: fetchNotifications,
  };
}
