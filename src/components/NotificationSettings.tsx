import { Bell, BellOff, BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { cn } from '@/lib/utils';

export function NotificationSettings() {
  const {
    isSupported,
    isSubscribed,
    permission,
    subscribe,
    unsubscribe
  } = usePushNotifications();

  /* Honest copy. In-app notifications are real and always on. Push has never
     reached a server (the subscription only ever lands in localStorage), so
     it must not be described as if it did. The toggle stays: it holds the
     browser permission for the day push is wired up. */
  const alwaysOn = 'In-app notifications for follows, likes, comments, tags and new releases are always on.';

  if (!isSupported) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/50">
        <BellOff className="w-5 h-5 text-muted-foreground" />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">Notifications</p>
          <p className="text-xs text-muted-foreground">
            {alwaysOn} Push alerts on this device are coming, and this browser cannot show them yet.
          </p>
        </div>
      </div>
    );
  }

  const handleToggle = async () => {
    if (isSubscribed) {
      await unsubscribe();
    } else {
      await subscribe();
    }
  };

  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/50">
      <div className={cn(
        "p-2 rounded-full",
        isSubscribed ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
      )}>
        {isSubscribed ? (
          <BellRing className="w-5 h-5" />
        ) : (
          <Bell className="w-5 h-5" />
        )}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">Notifications</p>
        <p className="text-xs text-muted-foreground">
          {alwaysOn}{' '}
          {isSubscribed
            ? 'Push alerts on this device are coming; this device is ready for them.'
            : permission === 'denied'
            ? 'Push alerts on this device are coming. They are blocked in your browser settings.'
            : 'Push alerts on this device are coming. Turn this on to be ready for them.'}
        </p>
      </div>
      <Button
        variant={isSubscribed ? 'secondary' : 'default'}
        size="sm"
        onClick={handleToggle}
        disabled={permission === 'denied'}
      >
        {isSubscribed ? 'Disable' : 'Enable'}
      </Button>
    </div>
  );
}