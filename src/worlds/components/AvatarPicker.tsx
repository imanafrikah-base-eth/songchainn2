// Choosing who you are here.
//
// Three kinds of look sit on the same rack, and the difference is stated
// plainly rather than hidden behind a padlock: free to anyone, unlocked by
// holding the key, or bought. A locked item still shows what it is and exactly
// what it takes, because a rack of mysteries is worse than a rack with prices.

import { useState } from 'react';
import { EyeOff, Lock, Sparkles } from 'lucide-react';
import type { WorldConfig, WorldRings } from '../types';
import {
  ACCESSORIES,
  HAIRS,
  OUTFITS,
  SKINS,
  canWear,
  priceFor,
  unlockHint,
  type AvatarLook,
} from '../avatars';
import type { CitizenState } from '../useCitizen';
import { CitizenAvatar } from './CitizenAvatar';

function LookButton({
  look,
  active,
  rings,
  symbol,
  onPick,
}: {
  look: AvatarLook;
  active: boolean;
  rings: WorldRings | null;
  symbol: string;
  onPick: () => void;
}) {
  const wearable = canWear(look, rings);
  const price = priceFor(look, rings);
  const hint = unlockHint(look, rings, symbol);
  const locked = !wearable;

  return (
    <button
      type="button"
      onClick={() => wearable && onPick()}
      disabled={locked}
      aria-pressed={active}
      title={hint ?? (price ? `${price.toLocaleString()} ${symbol}` : undefined)}
      className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
        active
          ? 'border-amber-400/60 bg-amber-400/10 text-white'
          : locked
            ? 'cursor-not-allowed border-white/8 bg-white/[0.02] text-white/35'
            : 'border-white/12 bg-white/[0.03] text-white/75 hover:border-white/30'
      }`}
    >
      <span className="flex items-center gap-1.5">
        {locked && <Lock className="h-3 w-3 shrink-0" />}
        {look.kind === 'premium' && !locked && <Sparkles className="h-3 w-3 shrink-0" />}
        {look.name}
      </span>
      {price != null && (
        <span className="mt-0.5 block font-mono text-[10px] text-amber-200/70">
          {price.toLocaleString()} {symbol}
        </span>
      )}
      {hint && <span className="mt-0.5 block text-[10px] leading-tight text-white/35">{hint}</span>}
    </button>
  );
}

export function AvatarPicker({
  world,
  rings,
  citizen,
  onClose,
}: {
  world: WorldConfig;
  rings: WorldRings | null;
  citizen: CitizenState;
  onClose: () => void;
}) {
  const [name, setName] = useState(citizen.displayName ?? '');
  const symbol = world.tokenSymbol;
  const set = (patch: Partial<typeof citizen.avatar>) =>
    void citizen.save({ avatar: { ...citizen.avatar, ...patch } });

  return (
    <div className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="flex flex-wrap items-center gap-5">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
          <CitizenAvatar config={citizen.avatar} size={84} title="Your citizen" />
        </div>
        <div className="min-w-[200px] flex-1">
          <label htmlFor="citizen-name" className="mb-1.5 block text-sm font-medium text-white">
            What do they call you here?
          </label>
          <input
            id="citizen-name"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void citizen.save({ displayName: name.trim() || null })}
            placeholder="Pick a name for this world"
            className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-amber-400/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void citizen.save({ incognito: !citizen.incognito })}
            className={`mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${
              citizen.incognito
                ? 'border-white/35 bg-white/10 text-white'
                : 'border-white/12 text-white/55 hover:border-white/30'
            }`}
          >
            <EyeOff className="h-3.5 w-3.5" />
            {citizen.incognito ? 'Nobody can see you' : 'Walk unseen'}
          </button>
        </div>
      </div>

      <Row label="Skin">
        {SKINS.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-label={s.id}
            aria-pressed={citizen.avatar.skin === s.id}
            onClick={() => set({ skin: s.id })}
            className={`h-11 w-11 rounded-full border-2 transition ${
              citizen.avatar.skin === s.id ? 'border-amber-400' : 'border-white/15 hover:border-white/40'
            }`}
            style={{ backgroundColor: s.hex }}
          />
        ))}
      </Row>

      <Row label="Outfit">
        {OUTFITS.map((o) => (
          <LookButton
            key={o.id}
            look={o}
            rings={rings}
            symbol={symbol}
            active={citizen.avatar.outfit === o.id}
            onPick={() => set({ outfit: o.id })}
          />
        ))}
      </Row>

      <Row label="Hair">
        {HAIRS.map((h) => (
          <LookButton
            key={h.id}
            look={h}
            rings={rings}
            symbol={symbol}
            active={citizen.avatar.hair === h.id}
            onPick={() => set({ hair: h.id })}
          />
        ))}
      </Row>

      <Row label="Extras">
        {ACCESSORIES.map((a) => (
          <LookButton
            key={a.id}
            look={a}
            rings={rings}
            symbol={symbol}
            active={citizen.avatar.accessory === a.id}
            onPick={() => set({ accessory: a.id })}
          />
        ))}
      </Row>

      <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4">
        <p className="text-xs text-white/40">
          Your first body is free. Looks marked with a key are yours for as long as you hold it.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-white px-4 py-2 text-xs font-bold text-black transition hover:bg-white/90"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
