// The way in. Pre-launch it says so honestly; once the token is live it links
// to the coin. Copy rule: access and belonging, never price.
//
// INSIDE THE ANDROID SHELL there is no link at all. Google Play reads "buy
// this to unlock that room" as selling digital access outside Play Billing,
// so the native build only ever reads a balance the person already holds in
// their own wallet. The words still say what the key is; they just do not
// sell it. See ANDROID.md, "Watch the Play Billing line".

import { KeyRound, ExternalLink } from 'lucide-react';
import type { WorldConfig, WorldRings } from '../types';
import { isNativeApp } from '@/lib/native';

export function GetKeyCta({
  world,
  rings,
  compact = false,
}: {
  world: WorldConfig;
  rings: WorldRings | null;
  compact?: boolean;
}) {
  const tokenLive = rings?.tokenLive ?? false;
  const native = isNativeApp();
  const liveSwapUrl = tokenLive && world.swapUrl && !native ? world.swapUrl : null;

  if (compact) {
    if (liveSwapUrl) {
      return (
        <a
          href={liveSwapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-4 py-2 text-xs font-bold text-black transition hover:bg-amber-300"
        >
          <KeyRound className="h-3.5 w-3.5" /> Get {world.tokenSymbol}
        </a>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs font-semibold text-amber-300">
        <KeyRound className="h-3.5 w-3.5" />
        {tokenLive
          ? `${world.tokenSymbol} in your wallet is the key.`
          : `The key is being cut. ${world.tokenSymbol} goes live soon.`}
      </span>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-400/30 bg-gradient-to-b from-amber-500/10 to-transparent p-6">
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-amber-300" />
        <h3 className="font-heading text-lg font-bold text-white">The key to this world</h3>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-white/60">{world.positioning} Hold it and doors open. The deeper the room, the more of the key it takes.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {liveSwapUrl ? (
          <a
            href={liveSwapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-5 py-2 text-sm font-bold text-black transition hover:bg-amber-300"
          >
            Get {world.tokenSymbol} <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-5 py-2 text-sm font-semibold text-amber-300">
            {tokenLive
              ? `${world.tokenSymbol} held in your own wallet opens the doors.`
              : `The key is being cut. ${world.tokenSymbol} goes live soon on Base.`}
          </span>
        )}
        {world.farcasterUrl && (
          <a
            href={world.farcasterUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-5 py-2 text-sm text-white/80 transition hover:bg-white/10"
          >
            Follow the opening on Farcaster <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}
