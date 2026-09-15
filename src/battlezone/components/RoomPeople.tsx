import { useRef, useState } from "react";
import { Mic, MicOff, ArrowDownToLine, Hand, Crown, MoreHorizontal, Sparkles } from "lucide-react";
import type { BattleParticipant } from "@/battlezone/hooks/useBattleRoles";
import type { SpeakingStore } from "@/battlezone/hooks/useSpeakingLevels";
import { SpeakingAvatar, SpeakingStatus } from "@/battlezone/components/SpeakingAvatar";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/battlezone/components/ui/drawer";

/**
 * Everybody in the battle room, stage first.
 *
 * A host or co-host holds a name (or right-clicks it, or taps the dots) to act
 * on that person: invite them up to speak, bring a speaker back down, mute or
 * unmute them (founder, 15 Sep 2026). Nothing happens on a short tap, so
 * scrolling the list never fires an action by accident.
 */
const HOLD_MS = 450;

const ROLE_LABEL: Record<BattleParticipant["role"], string> = {
  host: "Host",
  "co-host": "Co-host",
  speaker: "On the mic",
  audience: "Listening",
};

function isInvited(p: BattleParticipant): boolean {
  return !!p.invited_to_speak_at && Date.now() - Date.parse(p.invited_to_speak_at) < 10 * 60_000;
}

interface RowProps {
  p: BattleParticipant;
  me: boolean;
  manageable: boolean;
  voiceOn: boolean;
  avatarUrl: string | undefined;
  speakingStore: SpeakingStore;
  onHoldStart: (p: BattleParticipant) => void;
  onHoldEnd: () => void;
  onOpen: (p: BattleParticipant) => void;
}

function PersonRow({ p, me, manageable, voiceOn, avatarUrl, speakingStore, onHoldStart, onHoldEnd, onOpen }: RowProps) {
  return (
    <div
      onPointerDown={() => onHoldStart(p)}
      onPointerUp={onHoldEnd}
      onPointerLeave={onHoldEnd}
      onPointerCancel={onHoldEnd}
      onContextMenu={(e) => {
        if (!manageable) return;
        e.preventDefault();
        onOpen(p);
      }}
      className={`group flex select-none items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors ${
        manageable ? "cursor-pointer hover:bg-primary/5 active:bg-primary/10" : "hover:bg-muted/30"
      }`}
      style={{ WebkitTouchCallout: "none" }}
    >
      <SpeakingAvatar
        store={speakingStore}
        userId={p.user_id}
        name={p.display_name}
        role={p.role}
        muted={p.is_muted}
        avatarUrl={avatarUrl}
        size="sm"
        showLabel={false}
      />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 truncate text-xs font-semibold text-foreground">
          {p.role === "host" && <Crown className="h-3 w-3 shrink-0 text-accent" aria-hidden="true" />}
          <span className="truncate">{p.display_name || "Listener"}</span>
          {me && <span className="text-[10px] font-normal text-muted-foreground">(you)</span>}
        </p>
        <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {p.requested_to_speak && p.role === "audience" ? (
            <span className="inline-flex items-center gap-1 font-semibold text-accent">
              <Hand className="h-3 w-3" /> Wants the mic
            </span>
          ) : isInvited(p) && p.role === "audience" ? (
            <span className="inline-flex items-center gap-1 font-semibold text-secondary">
              <Sparkles className="h-3 w-3" /> Invited up
            </span>
          ) : (
            ROLE_LABEL[p.role]
          )}
        </p>
      </div>
      {voiceOn && <SpeakingStatus store={speakingStore} userId={p.user_id} role={p.role} muted={p.is_muted} />}
      {manageable && (
        <button
          type="button"
          aria-label={`Actions for ${p.display_name || "this person"}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onOpen(p);
          }}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-60 transition-opacity hover:bg-muted/50 hover:text-foreground group-hover:opacity-100"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function RoomPeople({
  participants,
  avatars,
  speakingStore,
  voiceOn,
  canManage,
  myUserId,
  onInvite,
  onBringDown,
  onMute,
}: {
  participants: BattleParticipant[];
  avatars: Map<string, string>;
  speakingStore: SpeakingStore;
  voiceOn: boolean;
  canManage: boolean;
  myUserId: string | null;
  onInvite: (userId: string) => Promise<boolean>;
  onBringDown: (userId: string) => Promise<boolean>;
  onMute: (userId: string, muted: boolean) => Promise<boolean>;
}) {
  const [target, setTarget] = useState<BattleParticipant | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const holdTimer = useRef<number | null>(null);

  const stage = participants.filter((p) => p.role !== "audience");
  const crowd = participants.filter((p) => p.role === "audience");

  const open = (p: BattleParticipant) => {
    if (!canManage || p.user_id === myUserId) return;
    setNote(null);
    setTarget(p);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(18);
  };

  const startHold = (p: BattleParticipant) => {
    if (!canManage || p.user_id === myUserId) return;
    holdTimer.current = window.setTimeout(() => {
      open(p);
    }, HOLD_MS);
  };
  const cancelHold = () => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  const act = async (fn: () => Promise<boolean>) => {
    setBusy(true);
    const ok = await fn();
    setBusy(false);
    if (ok) setTarget(null);
    else setNote("That did not go through. Try again.");
  };

  const row = (p: BattleParticipant) => (
    <PersonRow
      key={p.user_id}
      p={p}
      me={p.user_id === myUserId}
      manageable={canManage && p.user_id !== myUserId}
      voiceOn={voiceOn}
      avatarUrl={avatars.get(p.user_id)}
      speakingStore={speakingStore}
      onHoldStart={startHold}
      onHoldEnd={cancelHold}
      onOpen={open}
    />
  );

  return (
    <div className="space-y-4">
      {canManage && (
        <p className="rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground">
          <span className="font-semibold text-primary">Host tip:</span> hold anyone's name to invite them up
          to speak, bring them down or mute them.
        </p>
      )}

      <section>
        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-primary">
          <Mic className="h-3 w-3" /> On stage ({stage.length})
        </p>
        <div className="space-y-0.5">
          {stage.map(row)}
        </div>
      </section>

      <section>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          In the crowd ({crowd.length})
        </p>
        {crowd.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted-foreground">Nobody in the crowd yet. Share the room.</p>
        ) : (
          <div className="space-y-0.5">
            {crowd.map(row)}
          </div>
        )}
      </section>

      <Drawer open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DrawerContent className="wavewarz-theme border-primary/30">
          {target && (
            <div className="mx-auto w-full max-w-md px-4 pb-6">
              <DrawerHeader className="px-0 text-left">
                <DrawerTitle className="flex items-center gap-2 text-lg">
                  {target.display_name || "Listener"}
                </DrawerTitle>
                <DrawerDescription>{ROLE_LABEL[target.role]}</DrawerDescription>
              </DrawerHeader>

              <div className="grid gap-2">
                {target.role === "audience" &&
                  (voiceOn ? (
                    <button
                      type="button"
                      disabled={busy || isInvited(target)}
                      onClick={() => void act(() => onInvite(target.user_id))}
                      className="flex min-h-12 items-center gap-3 rounded-xl bg-primary px-4 text-left text-sm font-bold text-primary-foreground shadow-[0_0_20px_hsl(var(--neon-green)/0.35)] disabled:opacity-60"
                    >
                      <Mic className="h-4 w-4" />
                      {isInvited(target) ? "Invite sent, waiting for them" : "Invite up to speak"}
                    </button>
                  ) : (
                    <p className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                      Turn on voice for this battle first, then you can bring people up to speak.
                    </p>
                  ))}

                {(target.role === "speaker" || target.role === "co-host") && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void act(() => onBringDown(target.user_id))}
                    className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-card px-4 text-left text-sm font-semibold text-foreground hover:bg-muted/40 disabled:opacity-60"
                  >
                    <ArrowDownToLine className="h-4 w-4" /> Bring back to the crowd
                  </button>
                )}

                {voiceOn && target.role !== "audience" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void act(() => onMute(target.user_id, !target.is_muted))}
                    className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-card px-4 text-left text-sm font-semibold text-foreground hover:bg-muted/40 disabled:opacity-60"
                  >
                    {target.is_muted ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                    {target.is_muted ? "Unmute" : "Mute"}
                  </button>
                )}

                {note && <p className="text-xs text-live">{note}</p>}
              </div>
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}

export default RoomPeople;
