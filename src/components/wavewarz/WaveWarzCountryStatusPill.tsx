import type { CountryRolloutState } from '@/data/wavewarzAfrica';

interface WaveWarzCountryStatusPillProps {
  state: CountryRolloutState;
}

export function WaveWarzCountryStatusPill({ state }: WaveWarzCountryStatusPillProps) {
  if (state === 'live') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/40 bg-emerald-500/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-200">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" />
        Live Now
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-cyan-300/30 bg-cyan-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-cyan-100">
      Coming Soon
    </span>
  );
}
