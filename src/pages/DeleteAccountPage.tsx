import { Link } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { DeleteAccount } from '@/components/DeleteAccount';
import { useAuth } from '@/context/AuthContext';

/**
 * The public page that explains how to delete a SONGCHAINN account.
 *
 * Google Play requires a deletion path reachable from a plain web URL as well
 * as inside the app, and this is that URL. Signed in, the same control the
 * Profile page carries is right here; signed out, it says exactly where to go
 * and what to write if you cannot get in.
 */
export default function DeleteAccountPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto max-w-2xl px-4 pb-24 pt-6 sm:px-6">
        <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <header className="mb-8 border-b border-border pb-6">
          <Trash2 className="mb-3 h-7 w-7 text-primary" />
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">Delete your account</h1>
          <p className="mt-3 max-w-prose text-muted-foreground">
            You can remove your SONGCHAINN account and the data in it yourself, in a minute, without
            asking anyone.
          </p>
        </header>

        <div className="space-y-8">
          <section>
            <h2 className="font-heading text-lg font-semibold text-foreground">What is removed</h2>
            <p className="mt-2 max-w-prose text-sm text-muted-foreground">
              Your profile and photo, posts, comments, likes, follows, blocks, playlists, room chat,
              battle votes, notifications, points and streaks, world citizenship, feature requests,
              bug reports and referral codes. Then the sign-in record itself, so the email is free
              to start again from nothing.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-semibold text-foreground">What stays</h2>
            <p className="mt-2 max-w-prose text-sm text-muted-foreground">
              Receipts: purchases, trades, bookings and coin launches, kept without a live account
              behind them. Consent records, which are our proof of what was agreed. Reports you filed
              about other people. And anything on Base: nothing on a blockchain can be deleted, by us
              or by anyone, which is worth knowing before you connect a wallet. Released records,
              published worlds and the claim on an artist page stay as public work, unlinked from
              the deleted account.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-semibold text-foreground">How</h2>
            {user?.id ? (
              <div className="mt-3">
                <DeleteAccount compact />
              </div>
            ) : (
              <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                <li>
                  <Link to="/?auth=signin" className="text-foreground underline underline-offset-4">Sign in</Link>, then
                  open <span className="text-foreground">Profile</span>, scroll to <span className="text-foreground">Settings</span> and
                  choose <span className="text-foreground">Delete account</span>. Type DELETE to confirm.
                </li>
                <li>
                  In the Android app the same control is in Profile, under Settings.
                </li>
                <li>
                  Cannot sign in? Email <a href="mailto:songchaindao@gmail.com" className="text-foreground underline underline-offset-4">songchaindao@gmail.com</a> from
                  the address on the account and we will do it for you within seven days.
                </li>
              </ol>
            )}
          </section>

          <p className="text-xs text-muted-foreground">
            Read the <Link to="/privacy" className="underline underline-offset-4">Privacy Notice</Link> for
            everything else we hold and how to ask for a copy.
          </p>
        </div>
      </main>
    </div>
  );
}
