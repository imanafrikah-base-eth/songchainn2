import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Check, Heart, MessageCircle, UserPlus, X, ListMusic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useNotifications, Notification } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';

const notificationIcons = {
  follow: UserPlus,
  like: Heart,
  comment: MessageCircle,
  mention: MessageCircle,
  playlist: ListMusic,
};

const notificationMessages = {
  follow: 'started following you',
  like: 'liked your post',
  comment: 'commented on your post',
  mention: 'mentioned you in a post',
  playlist: 'shared a new playlist',
};

function NotificationItem({ 
  notification, 
  onRead, 
  onDelete,
  onNavigate,
}: { 
  notification: Notification; 
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
  onNavigate: (notification: Notification) => void | Promise<void>;
}) {
  const Icon = notificationIcons[notification.type];
  const message = notification.message || notificationMessages[notification.type];
  const profile = notification.from_profile;

  const handleClick = () => {
    if (!notification.is_read) {
      onRead(notification.id);
    }
    void onNavigate(notification);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg transition-colors cursor-pointer group",
        notification.is_read 
          ? "bg-transparent hover:bg-muted/50" 
          : "bg-primary/10 hover:bg-primary/15"
      )}
      onClick={handleClick}
    >
      <Avatar className="w-10 h-10 flex-shrink-0">
        <AvatarImage src={profile?.profile_picture_url || undefined} />
        <AvatarFallback className="bg-primary/20 text-primary">
          {profile?.profile_name?.[0]?.toUpperCase() || '?'}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm">
            <span className="font-semibold text-foreground">
              {profile?.profile_name || 'Someone'}
            </span>{' '}
            <span className="text-muted-foreground">{message}</span>
          </p>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(notification.id);
            }}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/20 rounded transition-all"
          >
            <X className="w-3 h-3 text-muted-foreground" />
          </button>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <Icon className="w-3 h-3 text-primary" />
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
          </span>
          {!notification.is_read && (
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'social' | 'playlists'>('all');
  const navigate = useNavigate();
  const { 
    notifications, 
    unreadCount, 
    isLoading, 
    markAsRead, 
    markAllAsRead,
    deleteNotification 
  } = useNotifications();

  const filteredNotifications = filter === 'all'
    ? notifications
    : notifications.filter((notification) => {
        if (filter === 'playlists') {
          return notification.type === 'playlist';
        }
        return notification.type !== 'playlist';
      });

  const handleNotificationNavigate = async (notification: Notification) => {
    setOpen(false);
    
    switch (notification.type) {
      case 'follow':
        // Navigate to the follower's profile
        if (notification.from_user_id) {
          const { data } = await (supabase as any)
            .from('artist_accounts')
            .select('artist_id')
            .eq('user_id', notification.from_user_id)
            .maybeSingle();
          if (data?.artist_id) {
            navigate(`/artist/${data.artist_id}`);
            return;
          }
          navigate(`/audience/${notification.from_user_id}`);
        }
        break;
      case 'like':
      case 'comment':
      case 'mention':
        // Navigate to the social feed (post context)
        if (notification.post_id) {
          navigate('/social');
        } else {
          navigate('/social');
        }
        break;
      default:
        navigate('/social');
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground text-xs font-bold rounded-full flex items-center justify-center"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </motion.span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-80 p-0 glass-surface border-border/50" 
        align="end"
        sideOffset={8}
      >
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <h3 className="font-heading font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllAsRead}
              className="text-xs text-primary hover:text-primary/80"
            >
              <Check className="w-3 h-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>

        <div className="px-3 pt-2 pb-1 border-b border-border/40 flex items-center gap-1 text-[11px]">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={cn(
              'px-2.5 py-1 rounded-full text-[11px] font-medium transition-all',
              filter === 'all'
                ? 'border border-primary/50 bg-primary/15 text-primary shadow-soft'
                : 'border border-border/40 bg-background/40 text-muted-foreground hover:bg-background/80 hover:text-foreground/90'
            )}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilter('social')}
            className={cn(
              'px-2.5 py-1 rounded-full text-[11px] font-medium transition-all',
              filter === 'social'
                ? 'bg-primary/10 text-primary border-primary/40'
                : 'border border-border/40 bg-background/40 text-muted-foreground hover:bg-background/80 hover:text-foreground/90'
            )}
          >
            Social
          </button>
          <button
            type="button"
            onClick={() => setFilter('playlists')}
            className={cn(
              'px-2.5 py-1 rounded-full text-[11px] font-medium transition-all',
              filter === 'playlists'
                ? 'border border-primary/50 bg-primary/15 text-primary shadow-soft'
                : 'border border-border/40 bg-background/40 text-muted-foreground hover:bg-background/80 hover:text-foreground/90'
            )}
          >
            Playlists
          </button>
        </div>

        <ScrollArea className="max-h-80">
          {isLoading ? (
            <div className="p-4 text-center text-muted-foreground">
              Loading...
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="p-8 text-center">
              <Bell className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {filter === 'all'
                  ? 'No notifications yet'
                  : filter === 'playlists'
                  ? 'No playlist notifications yet'
                  : 'No social notifications yet'}
              </p>
            </div>
          ) : (
            <div className="p-2">
              <AnimatePresence>
                {filteredNotifications.map(notification => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onRead={markAsRead}
                    onDelete={deleteNotification}
                    onNavigate={handleNotificationNavigate}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
