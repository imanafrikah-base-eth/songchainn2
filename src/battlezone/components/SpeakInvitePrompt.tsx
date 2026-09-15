import { useEffect, useState } from "react";
import { Loader2, Mic, Sparkles, X } from "lucide-react";

/**
 * The host asked this person up to speak.
 *
 * Shown to the invited person only, inside the room, until they answer or ten
 * minutes pass (the same window the server allows for accepting). Joining puts
 * them on the stage and their mic opens through the usual controls.
 */
const INVITE_WINDOW_MS = 10 * 60_000;

export function SpeakInvitePrompt({
  invitedAt,
  hostName,
  onAccept,
  onDecline,
}: {
  invitedAt: string | null | undefined;
  hostName: string;
  onAccept: () => Promise<boolean>;
  onDecline: () => Promise<boolean>;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<"yes" | "no" | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!invitedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, [invitedAt]);

  if (!invitedAt) return null;
  const at = Date.parse(invitedAt);
  if (!Number.isFinite(at) || now - at > INVITE_WINDOW_MS) return null;

  const answer = async (yes: boolean) => {
    setBusy(yes ? "yes" : "no");
    setFailed(false);
    const ok = await (yes ? onAccept() : onDecline());
    setBusy(null);
    if (!ok) setFailed(true);
  };

  return (
    <div
      role="alertdialog"
      aria-label="Invitation to speak"
      className="relative overflow-hidden rounded-2xl border border-primary/50 bg-card p-4 shadow-[0_0_30px_hsl(var(--neon-green)/0.25)]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(80% 120% at 0% 0%, hsl(var(--neon-green) / 0.16), transparent 60%)" }}
      />
      <div className="relative flex items-start gap-3">
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/40" aria-hidden="true" />
          <Mic className="relative h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary">
            <Sparkles className="h-3 w-3" /> You are invited up
          </p>
          <p className="mt-0.5 text-sm font-bold text-foreground">{hostName} wants you on the mic.</p>
          <p className="text-xs text-muted-foreground">Join the stage and the whole room hears you.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void answer(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-[0_0_18px_hsl(var(--neon-green)/0.4)] disabled:opacity-60"
            >
              {busy === "yes" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
              Join the stage
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void answer(false)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60"
            >
              {busy === "no" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              Not now
            </button>
          </div>
          {failed && <p className="mt-2 text-xs text-live">That did not go through. The invite may have run out, ask the host again.</p>}
        </div>
      </div>
    </div>
  );
}

export default SpeakInvitePrompt;
