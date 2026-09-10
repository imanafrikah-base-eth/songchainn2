import { useState, type ComponentType } from 'react';
import { ArtistName } from '@/components/ArtistName';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, Check, Flame, Heart, MessageCircle, UserPlus, X, ListMusic, Sparkles,
  AtSign, Tag, Music, BadgeCheck,
} from 'lucide-react';
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

type IconComponent = ComponentType<{ className?: string }>;

/**
 * Every type the tray can receive, with a fallback for the ones it cannot.
 *
 * This used to be indexed straight by type with no default, so a 'post_tag'
 * or 'comment_like' row (both written by the client for months) resolved to
 * undefined and React threw on rendering <undefined />. One tag notification
 * took the whole tray down.
 */
const notificationIcons: Record<string, IconComponent> = {
  follow: UserPlus,
  like: Heart,
  comment: MessageCircle,
  mention: AtSign,
  playlist: ListMusic,
  announcement: Sparkles,
  post_tag: Tag,
  comment_like: Heart,
  new_release: Music,
  artist_claim: BadgeCheck,
};

const iconFor = (type: string): IconComponent => notificationIcons[type] ?? Bell;

function defaultMessage(notification: Notification): string {
  const meta = notification.metadata ?? {};
  switch (notification.type) {
    case 'follow': return 'started following you';
    case 'like': return 'liked your post';
    case 'comment': return 'commented on your post';
    case 'mention': return 'mentioned you in a post';
    case 'playlist': return 'shared a new playlist';
    case 'post_tag': return 'tagged you in a post';
    case 'comment_like': return 'liked your comment';
    case 'new_release': {
      const who = typeof meta.artist_name === 'string' && meta.artist_name ? meta.artist_name : 'An artist you follow';
      const what = typeof meta.title === 'string' && meta.title ? ` "${meta.title}"` : ' something new';
      return `${who} just released${what}`;
    }
    case 'artist_claim':
      return meta.status === 'approved'
        ? 'Your artist page is yours. Open the Studio to get started.'
        : 'Your artist claim was not approved this time.';
    default: return '';
  }
}

function extractBattleRoute(message?: string | null) {
  if (!message) return null;
  const markerMatch = message.match(/BATTLE_LIVE::([a-zA-Z0-9-]+)/);
  if (markerMatch?.[1]) return `/wavewarz-africa/room/${markerMatch[1]}`;
  const pathMatch = message.match(/\/wavewarz-africa\/room\/([a-zA-Z0-9-]+)/);
  if (pathMatch?.[1]) return `/wavewarz-africa/room/${pathMatch[1]}`;
  return null;
}

/**
 * The BATTLE_LIVE marker is an internal address used to build the link. It is
 * not something anyone should have to read, so it never reaches the screen.
 */
function readableMessage(message?: string | null) {
  if (!message) return message;
  return message.replace(/BATTLE_LIVE::[a-zA-Z0-9-]+::/g, '').replace(/\bis now LIVE\b/g, 'is now live').trim();
}

/** Where a tap on this notification should land. */
function routeFor(notification: Notification): string {
  const battleRoute = extractBattleRoute(notification.message);
  if (battleRoute) return battleRoute;

  const meta = notification.metadata ?? {};
  const postId = notification.post_id || (typeof meta.post_id === 'string' ? meta.post_id : null);

  switch (notification.type) {
    case 'announcement':
      return typeof meta.cta_path === 'string' && meta.cta_path ? meta.cta_path : '/marketplace';
    case 'follow':
      return notification.from_user_id ? `/audience/${notification.from_user_id}` : '/social';
    case 'like':
    case 'comment':
    case 'mention':
    case 'post_tag':
    case 'comment_like':
      return postId ? `/post/${postId}` : '/social';
    case 'new_release':
      if (typeof meta.song_id === 'string' && meta.song_id) return `/song/${meta.song_id}`;
      if (typeof meta.artist_id === 'string' && meta.artist_id) return `/artist/${meta.artist_id}`;
      return '/';
    case 'artist_claim':
      return meta.status === 'approved' ? '/studio' : '/claim';
    case 'playlist':
      return typeof meta.playlist_id === 'string' && meta.playlist_id ? `/playlist/${meta.playlist_id}` : '/playlists';
    default:
      return postId ? `/post/${postId}` : '/social';
  }
}

function senderName(profile: Notification['from_profile']): string | null {
  if (!profile) return null;
  const p = profile as { display_name?: string | null; profile_name?: string; username?: string | null };
  return p.display_name || p.profile_name || p.username || null;
}

function NotificationItem({
  notification,
  onRead,
  onDelete,
  onNavigate,
}: {
  notification: Notification;
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
  onNavigate: (notification: Notification) => void;
}) {
  const battleRoute = extractBattleRoute(notification.message);
  const Icon = battleRoute ? Flame : iconFor(notification.type);
  const message = readableMessage(notification.message) || defaultMessage(notification);
  const profile = notification.from_profile;
  const name = senderName(profile);
  const avatarSrc = (profile as { profile_picture_url?: string | null; avatar_url?: string | null } | undefined);

  const handleClick = () => {
    // One tap marks ONE notification read. Opening the tray used to mark all
    // of them, which threw the unread badge away before anything was seen.
    if (!notification.is_read) {
      onRead(notification.id);
    }
    onNavigate(notification);
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
      {!profile ? (
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-primary" />
        </div>
      ) : (
        <Avatar className="w-10 h-10 flex-shrink-0">
          <AvatarImage src={avatarSrc?.profile_picture_url || avatarSrc?.avatar_url || undefined} />
          <AvatarFallback className="bg-primary/20 text-primary">
            {name?.[0]?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          {/* A notification with no sender is from us, not from a person. Falling
              through to the sender branch used to print the literal word "Someone"
              and throw the title away, which is how a moderation notice reached
              people reading "Someone" above a message with no heading. */}
          {!profile ? (
            <p className="text-sm">
              {notification.title && (
                <span className="font-semibold text-foreground block">{notification.title}</span>
              )}
              <span className="text-muted-foreground">{message}</span>
            </p>
          ) : (
            <p className="text-sm">
              <span className="font-semibold text-foreground">
                <ArtistName name={name || 'Someone'} userId={notification.from_user_id} size={13} />
              </span>{' '}
              <span className="text-muted-foreground">{message}</span>
            </p>
          )}
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(notification.id);
            }}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/20 rounded transition-all min-h-11 min-w-11 inline-flex items-center justify-center"
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

  const handleNotificationNavigate = (notification: Notification) => {
    setOpen(false);
    const route = routeFor(notification);
    if (/^https?:\/\//i.test(route)) {
      window.open(route, '_blank', 'noopener,noreferrer');
      return;
    }
    navigate(route);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
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
              onClick={() => void markAllAsRead()}
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
                ? 'border border-primary/50 bg-primary/15 text-primary shadow-soft'
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
