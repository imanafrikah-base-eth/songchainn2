import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Bell, Zap, Users, Trophy, Music, MessageCircle, X } from "lucide-react";
import { supabase } from "@/battlezone/integrations/supabase/client";
import { useAuth } from "@/battlezone/contexts/AuthContext";

interface NotificationRow {
  id: string;
  type: string | null;
  title: string | null;
  message: string | null;
  is_read: boolean;
  created_at: string;
}

function relativeTime(input: string) {
  const ts = new Date(input).getTime();
  if (!Number.isFinite(ts)) return "Just now";
  const diff = Date.now() - ts;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "Just now";
  if (diff < hour) return `${Math.floor(diff / minute)} min ago`;
  if (diff < day) return `${Math.floor(diff / hour)} hr ago`;
  return `${Math.floor(diff / day)} day ago`;
}

function iconForType(type: string | null) {
  const normalized = String(type || "").toLowerCase();
  if (normalized.includes("battle_live")) return { icon: Zap, accentClass: "text-primary" };
  if (normalized.includes("cohost")) return { icon: Users, accentClass: "text-secondary" };
  if (normalized.includes("battle_ended")) return { icon: Trophy, accentClass: "text-neon-gold" };
  if (normalized.includes("mention")) return { icon: MessageCircle, accentClass: "text-secondary" };
  if (normalized.includes("battle_invite")) return { icon: Music, accentClass: "text-primary" };
  if (normalized.includes("follow")) return { icon: Users, accentClass: "text-muted-foreground" };
  return { icon: Bell, accentClass: "text-muted-foreground" };
}

const NotificationsDropdown = () => {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) {
      setNotifications([]);
      return;
    }
    const { data } = await supabase
      .from("notifications")
      .select("id,type,title,message,is_read,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(40);
    setNotifications((data || []) as NotificationRow[]);
  }, [user?.id]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  const fetchNotificationsRef = useRef(fetchNotifications);
  fetchNotificationsRef.current = fetchNotifications;

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`battlezone-notifications-${user.id}-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => {
          void fetchNotificationsRef.current();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const markAllRead = useCallback(async () => {
    if (!user?.id) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }, [user?.id]);

  const markRead = useCallback(async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  }, []);

  const dismiss = useCallback(async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const mappedNotifications = useMemo(
    () =>
      notifications.map((n) => {
        const { icon, accentClass } = iconForType(n.type);
        return {
          ...n,
          icon,
          accentClass,
          safeTitle: n.title || "Notification",
          safeMessage: n.message || "",
          safeTime: relativeTime(n.created_at),
        };
      }),
    [notifications],
  );

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-muted transition-colors"
      >
        <Bell className="h-5 w-5 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-live text-[10px] font-bold text-foreground">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-[min(24rem,calc(100vw-1rem))] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
          <div className="border-b border-border px-4 py-3 flex items-center justify-between">
            <h3 className="font-bold text-foreground text-sm">Notifications</h3>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-primary hover:underline">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {mappedNotifications.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-muted-foreground">
                <Bell className="h-8 w-8 mb-2 opacity-40" />
                <span className="text-sm">No notifications yet</span>
              </div>
            ) : (
              mappedNotifications.map((n) => {
                const Icon = n.icon;
                return (
                  <div key={n.id}>
                    <div
                      onClick={() => void markRead(n.id)}
                      className={`group flex items-start gap-3 px-4 py-3 border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors ${!n.is_read ? "bg-primary/5" : ""}`}
                    >
                      <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${n.accentClass}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">{n.safeTitle}</span>
                          {!n.is_read && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.safeMessage}</p>
                        <span className="text-[10px] text-muted-foreground/60 mt-1 block">{n.safeTime}</span>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); void dismiss(n.id); }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-muted rounded transition-all shrink-0"
                      >
                        <X className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t border-border px-4 py-2.5 text-center">
            <button className="text-xs text-primary hover:underline">View all notifications</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationsDropdown;
