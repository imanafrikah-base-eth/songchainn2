import { useCallback, useEffect, useState } from 'react';
import { Ban } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { blockUser } from '@/hooks/useDirectMessages';

/**
 * Block, and unblock, from a person's profile.
 *
 * Blocking does three things, all server-side: their messages stop reaching
 * you (the send and open-conversation functions refuse across a block), their
 * posts and comments disappear from your feed, and yours disappear from
 * theirs. Nothing is announced to them. Unblocking undoes all of it.
 *
 * The block itself lived only in the inbox before, so a person being
 * bothered from a profile had to open a chat with them to make it stop.
 */
export function BlockButton({
  userId,
  displayName,
  onChange,
  className = '',
}: {
  userId: string;
  displayName?: string | null;
  onChange?: (blocked: boolean) => void;
  className?: string;
}) {
  const { user } = useAuth();
  const [blocked, setBlocked] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    if (!user?.id || !isSupabaseConfigured || user.id === userId) {
      setBlocked(null);
      return;
    }
    void (async () => {
      const { data } = await supabase
        .from('user_blocks' as never)
        .select('blocked_id')
        .eq('blocker_id', user.id)
        .eq('blocked_id', userId)
        .maybeSingle();
      if (active) setBlocked(Boolean(data));
    })();
    return () => {
      active = false;
    };
  }, [user?.id, userId]);

  const toggle = useCallback(async () => {
    if (!user?.id) {
      toast('Sign in to block someone.');
      return;
    }
    const next = !blocked;
    setBusy(true);
    try {
      await blockUser(userId, next);
      setBlocked(next);
      onChange?.(next);
      toast(
        next ? `${displayName || 'They'} can no longer message you` : `${displayName || 'They'} unblocked`,
        {
          description: next
            ? 'Their posts and comments are hidden from you, and yours from them.'
            : 'Messages and posts flow again.',
        },
      );
    } catch {
      toast.error(next ? 'Could not block this person. Try again.' : 'Could not unblock. Try again.');
    } finally {
      setBusy(false);
    }
  }, [blocked, displayName, onChange, user?.id, userId]);

  if (!user?.id || user.id === userId || blocked === null) return null;

  return (
    <Button
      type="button"
      variant={blocked ? 'secondary' : 'ghost'}
      size="sm"
      disabled={busy}
      onClick={toggle}
      className={className}
      aria-label={blocked ? 'Unblock this person' : 'Block this person'}
    >
      <Ban className="mr-1.5 h-4 w-4" />
      {blocked ? 'Unblock' : 'Block'}
    </Button>
  );
}
