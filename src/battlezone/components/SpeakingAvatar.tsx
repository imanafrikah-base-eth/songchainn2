import { memo } from "react";
import { MicOff } from "lucide-react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import type { BattleRole } from "@/battlezone/hooks/useBattleRoles";
import ParticipantPhoto from "@/battlezone/components/ParticipantPhoto";
import {
  useActiveSpeakerIds,
  useSpeaking,
  type SpeakingStore,
} from "@/battlezone/hooks/useSpeakingLevels";

/**
 * An avatar that shows who is really talking.
 *
 * A crisp ring appears the instant a voice comes through and holds briefly
 * after it stops (Discord), a soft halo breathes with the volume and three
 * small bars move beside the name (X Spaces). Everything is driven by the
 * audio LiveKit hears, never the database flag. Muted people never light up.
 */

type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, { box: string; text: string; width: string; ring: string }> = {
  sm: { box: "h-8 w-8", text: "text-xs", width: "w-8", ring: "-inset-[3px]" },
  md: { box: "h-14 w-14", text: "text-sm", width: "w-[72px]", ring: "-inset-1" },
  lg: { box: "h-20 w-20", text: "text-xl", width: "w-24", ring: "-inset-1" },
};

const ROLE_LABEL: Record<BattleRole, string | null> = {
  host: "Host",
  "co-host": "Co-host",
  speaker: "Speaker",
  audience: null,
};

interface SpeakingAvatarProps {
  store: SpeakingStore;
  userId: string;
  name: string;
  role: BattleRole;
  /** Database mute flag. Either this or LiveKit saying the mic is off counts as muted. */
  muted: boolean;
  size?: Size;
  /** Name, bars and role badge under the avatar. Off for list rows that print their own. */
  showLabel?: boolean;
  /** Profile picture; the initial shows when there is none or it fails. */
  avatarUrl?: string | null;
}

function useLit(store: SpeakingStore, userId: string, dbMuted: boolean, role: BattleRole) {
  const snap = useSpeaking(store, userId);
  const liveMuted = snap.present && !snap.micOn;
  const muted = role !== "audience" && (dbMuted || liveMuted);
  const lit = !muted && !dbMuted && snap.speaking;
  return { lit, level: lit ? snap.level : 0, muted };
}

export function LevelBars({ level, lit, className = "" }: { level: number; lit: boolean; className?: string }) {
  const reduced = usePrefersReducedMotion();
  const weights = [0.65, 1, 0.8];
  return (
    <span aria-hidden className={`inline-flex h-2.5 items-end gap-[2px] shrink-0 ${className}`}>
      {weights.map((w, i) => {
        const scale = reduced ? 0.7 : Math.max(0.25, Math.min(1, level * w * 1.4));
        return (
          <span
            key={i}
            className="block h-full w-[2px] origin-bottom rounded-full bg-primary transition-[transform,opacity] duration-100 ease-out motion-reduce:transition-none"
            style={{ transform: `scaleY(${lit ? scale : 0.25})`, opacity: lit ? 1 : 0 }}
          />
        );
      })}
    </span>
  );
}

function SpeakingAvatarImpl({
  store,
  userId,
  name,
  role,
  muted: dbMuted,
  size = "md",
  showLabel = true,
  avatarUrl,
}: SpeakingAvatarProps) {
  const reduced = usePrefersReducedMotion();
  const { lit, level, muted } = useLit(store, userId, dbMuted, role);
  const s = SIZES[size];
  const displayName = name || "Anonymous";
  const roleLabel = ROLE_LABEL[role];

  const haloScale = reduced ? 1.12 : 1 + level * 0.35;

  const avatar = (
    <div className={`relative shrink-0 ${s.box}`}>
      {/* Soft halo, breathing with the voice. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full bg-primary/20 transition-[transform,opacity] duration-100 ease-out motion-reduce:transition-none"
        style={{ transform: `scale(${lit ? haloScale : 1})`, opacity: lit ? (reduced ? 0.6 : 0.35 + level * 0.5) : 0 }}
      />
      {/* Crisp ring, on the instant someone talks. */}
      <span
        aria-hidden
        className={`pointer-events-none absolute ${s.ring} rounded-full border-2 border-primary transition-opacity duration-75 motion-reduce:transition-none`}
        style={{ opacity: lit ? 1 : 0 }}
      />
      <ParticipantPhoto url={avatarUrl} name={displayName} className={`h-full w-full ${s.text}`} />
      {muted && (
        <span
          className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full border border-border bg-background p-0.5"
          title="Muted"
        >
          <MicOff className={size === "sm" ? "h-2.5 w-2.5 text-muted-foreground" : "h-3 w-3 text-muted-foreground"} />
          <span className="sr-only">Muted</span>
        </span>
      )}
    </div>
  );

  if (!showLabel) return avatar;

  return (
    <div className={`flex shrink-0 flex-col items-center gap-1 ${s.width}`}>
      {avatar}
      <div className="flex w-full min-w-0 items-center justify-center gap-1">
        <span className="min-w-0 truncate text-[11px] font-medium text-foreground" title={displayName}>
          {displayName}
        </span>
        {!muted && <LevelBars level={level} lit={lit} />}
      </div>
      {roleLabel && (
        <span className="rounded-full border border-border px-1.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          {roleLabel}
        </span>
      )}
      {lit && <span className="sr-only">Speaking</span>}
    </div>
  );
}

export const SpeakingAvatar = memo(SpeakingAvatarImpl);

/** The right-hand state of a list row: "Speaking" with bars, a mic-off icon, or nothing. */
export function SpeakingStatus({
  store,
  userId,
  role,
  muted: dbMuted,
}: {
  store: SpeakingStore;
  userId: string;
  role: BattleRole;
  muted: boolean;
}) {
  const { lit, level, muted } = useLit(store, userId, dbMuted, role);
  if (lit) {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-primary">
        <LevelBars level={level} lit />
        Speaking
      </span>
    );
  }
  if (muted) return <MicOff className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Muted" />;
  return null;
}

/** One line over the stage: who is talking right now, in stage order. */
export function NowTalkingCaption({
  store,
  stage,
}: {
  store: SpeakingStore;
  stage: { user_id: string; display_name: string; is_muted: boolean }[];
}) {
  const active = useActiveSpeakerIds(store);
  const names = stage
    .filter((p) => !p.is_muted && active.includes(p.user_id))
    .map((p) => p.display_name || "Anonymous");

  let text = "";
  if (names.length === 1) text = names[0];
  else if (names.length === 2) text = `${names[0]} and ${names[1]}`;
  else if (names.length > 2) text = `${names[0]}, ${names[1]} and ${names.length - 2} more`;

  return (
    <p className="mb-2 h-4 truncate text-center text-xs text-muted-foreground">
      {text && (
        <>
          <span className="font-semibold text-primary">Now talking:</span> {text}
        </>
      )}
    </p>
  );
}

export default SpeakingAvatar;
