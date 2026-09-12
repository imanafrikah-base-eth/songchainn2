import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/battlezone/contexts/AuthContext';

/**
 * The door on a battle room.
 *
 * Watching a battle is open to anybody: the zone, the results, a battle's own
 * page and every count on them stay public, because that is how somebody finds
 * this place at all. The ROOM is different. It has people in it, it lists who
 * they are, and until now /wavewarz-africa/room/:roomId and
 * /wavewarz-africa/host/control/:roomId had no gate of any kind, so an
 * anonymous visitor could open a live room, read the audience by name, and open
 * the host console for a battle that was not theirs.
 *
 * The database no longer hands those rows to a signed out visitor, which is the
 * half that actually protects anybody. This is the other half: not making a
 * person walk into a room that will then refuse to show them anything.
 */
export function RequireSignIn({ children, what }: { children: ReactNode; what: string }) {
  const { user, loading } = useAuth();

  // Never flash the door at somebody who is already through it. The session
  // hydrates after the first paint, so rendering the wall while loading would
  // show "you are not signed in" to a member on every single reload.
  if (loading) return null;

  if (user) return <>{children}</>;

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card/80 p-6 text-center backdrop-blur">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Lock className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-bold text-foreground">Sign in to enter {what}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Anyone can watch a battle and see how many people are in it. The room itself is for the
          people in it, so you need an account to come in.
        </p>
        <a
          href="/?auth=signin"
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/90"
        >
          Sign in or join
        </a>
        <Link
          to="/wavewarz-africa/battles/live"
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-border px-4 text-sm font-medium text-foreground hover:bg-muted"
        >
          Back to the battles
        </Link>
      </div>
    </div>
  );
}

export default RequireSignIn;
