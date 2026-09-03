import { Link } from 'react-router-dom';
import {
  Radio, Coins, Swords, Trophy, Users, UploadCloud, BadgeCheck, Wallet, Globe2, ArrowRight,
} from 'lucide-react';
import { useArtistOwnership } from '@/hooks/useArtistOwnership';

/**
 * What is actually here, said plainly.
 *
 * Replaces the "Phase Two Beta" panel. Nothing on SONGCHAINN is in beta any
 * more, and telling people it is makes a finished product feel unfinished.
 *
 * The list an artist needs to see is not the list a listener needs to see, so
 * this renders two different things depending on who is reading it.
 */

type Item = { icon: typeof Radio; title: string; body: string; to?: string; cta?: string; soon?: boolean };

const FOR_LISTENERS: Item[] = [
  {
    icon: Radio,
    title: 'The whole catalog, streaming',
    body: 'Every record on here was mastered before it was published. Play it anywhere, and it keeps working offline.',
    to: '/discover',
    cta: 'Start listening',
  },
  {
    icon: Coins,
    title: 'Songs you can actually own',
    body: 'Tracks are real coins on Base. Back an artist you believe in early, and hold a piece of the record.',
    to: '/marketplace',
    cta: 'Open the marketplace',
  },
  {
    icon: Users,
    title: 'Rooms',
    body: 'Listen at the same time as everybody else, talk while it plays, and find people with your taste.',
    to: '/room',
    cta: 'Find a room',
  },
  {
    icon: Swords,
    title: 'WaveWarz Africa',
    body: 'Live battles between African artists, with $HIKULU and NAKULU judging. You vote, and your vote counts.',
    to: '/wavewarz-africa',
    cta: 'Watch a battle',
  },
  {
    icon: Trophy,
    title: 'Points that mean something',
    body: 'Listening, liking and voting all earn points. They are counted on our side, so they cannot be faked, and they decide the leaderboard.',
    to: '/leaderboard',
    cta: 'See the top fans',
  },
];

const FOR_ARTISTS: Item[] = [
  {
    icon: UploadCloud,
    title: 'Release today, free',
    body: 'Send a finished record from the Studio. If it meets the standard it is live to listeners the same minute. Nobody sits between you and your release.',
    to: '/studio',
    cta: 'Open the Studio',
  },
  {
    icon: BadgeCheck,
    title: 'Your page, run by you',
    body: 'Already have songs on here? Claim your artist page and your name, bio, picture and cover become the page. The verified tick comes with it.',
    to: '/artists',
    cta: 'Find your page',
  },
  {
    icon: Wallet,
    title: 'Paid to your own wallet',
    body: 'Coin a track and earnings go straight to a wallet you control. We never hold your money, so there is nothing for anyone to freeze.',
  },
  {
    icon: Trophy,
    title: 'See who is really listening',
    body: 'Points come from real listening, not follows. You can see which fans actually show up for you.',
    to: '/leaderboard',
    cta: 'See the leaderboard',
  },
  {
    icon: Globe2,
    title: 'Build your own World',
    body: 'A space that is yours alone, with rooms only your people can walk into. Six screens, no code, and free for the first 50 artists.',
    to: '/world-builder',
    cta: 'Start building',
  },
];

function Row({ item }: { item: Item }) {
  const { icon: Icon, title, body, to, cta, soon } = item;
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
          {title}
          {soon && (
            <span className="rounded-full border border-border bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
              Coming soon
            </span>
          )}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
        {to && cta && (
          <Link
            to={to}
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            {cta}
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
    </div>
  );
}

export function WhatsLive() {
  const { isArtist, isLoading } = useArtistOwnership();
  if (isLoading) return null;

  const items = isArtist ? FOR_ARTISTS : FOR_LISTENERS;

  return (
    <section className="glass-card rounded-2xl p-5 sm:rounded-3xl sm:p-6 shine-overlay">
      <div className="mb-1 flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Live now</span>
      </div>

      <h3 className="font-heading text-lg font-bold text-foreground sm:text-xl">
        {isArtist ? 'Everything you can do here' : "What's on SONGCHAINN"}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {isArtist
          ? 'All of this is working today. Nothing here is a promise.'
          : 'All of it is working today, and it is free to listen.'}
      </p>

      <div className="mt-5 space-y-5">
        {items.map((item) => <Row key={item.title} item={item} />)}
      </div>
    </section>
  );
}

export default WhatsLive;
