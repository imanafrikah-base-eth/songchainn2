import { Mic, Trophy, Check } from 'lucide-react';
import { STAGES, OPEN_MIC_LIMITS, type BattleStage } from '@/battlezone/lib/battleStages';
import { useUserPoints } from '@/hooks/useUserPoints';

/**
 * Which room is this battle in.
 *
 * Both options are presented as real choices rather than a free one and a paid
 * one, because Open Mic is not a trial. The limits are listed in full on the
 * card itself, not behind a link, so nobody picks it and finds out later that
 * their artists were never going to be paid.
 */
export function StagePicker({
  value,
  onChange,
}: {
  value: BattleStage;
  onChange: (stage: BattleStage) => void;
}) {
  // The spendable balance, not the lifetime total. The points are really taken
  // when the room opens, so this has to be the number that actually pays.
  const { points } = useUserPoints();
  const balance = points ?? 0;
  const openMic = STAGES.open_mic;
  const mainStage = STAGES.main_stage;
  const canAffordOpenMic = balance >= openMic.pointsCost;

  return (
    <div className="space-y-3">
      <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Where is this battle
      </span>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onChange('open_mic')}
          aria-pressed={value === 'open_mic'}
          className={`rounded-2xl border p-4 text-left transition-all duration-300 ${
            value === 'open_mic'
              ? 'border-primary bg-card'
              : 'border-border/60 bg-transparent hover:bg-muted/40'
          }`}
        >
          <span className="flex items-center gap-2">
            <Mic className="h-4 w-4 text-primary" aria-hidden="true" />
            <span className="font-heading text-base font-bold text-foreground">{openMic.name}</span>
            {value === 'open_mic' && (
              <span className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-primary">
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                Chosen
              </span>
            )}
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">{openMic.tagline}</span>

          <span className="mt-3 block text-xs font-semibold text-foreground">
            {openMic.pointsCost.toLocaleString()} points
          </span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            {canAffordOpenMic
              ? `You have ${balance.toLocaleString()}, and they come off when the room opens.`
              : `You have ${balance.toLocaleString()}, so not yet. Listening earns them.`}
          </span>

          <ul className="mt-3 space-y-1">
            {OPEN_MIC_LIMITS.map((limit) => (
              <li key={limit} className="text-[11px] leading-relaxed text-muted-foreground">
                {limit}
              </li>
            ))}
          </ul>
        </button>

        <button
          type="button"
          onClick={() => onChange('main_stage')}
          aria-pressed={value === 'main_stage'}
          className={`rounded-2xl border p-4 text-left transition-all duration-300 ${
            value === 'main_stage'
              ? 'border-primary bg-card'
              : 'border-border/60 bg-transparent hover:bg-muted/40'
          }`}
        >
          <span className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" aria-hidden="true" />
            <span className="font-heading text-base font-bold text-foreground">{mainStage.name}</span>
            {value === 'main_stage' && (
              <span className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-primary">
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                Chosen
              </span>
            )}
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">{mainStage.tagline}</span>

          <span className="mt-3 block text-xs font-semibold text-foreground">
            {mainStage.costLabel}
          </span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            Paid from your own wallet when you launch.
          </span>

          <ul className="mt-3 space-y-1">
            {[
              'The room can back a side, and that counts toward the verdict.',
              'The artists you picked are paid, and so are the winning backers.',
              'Free to watch and vote in, for everyone, wallet or not.',
            ].map((line) => (
              <li key={line} className="flex gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
                {line}
              </li>
            ))}
          </ul>
        </button>
      </div>
    </div>
  );
}
