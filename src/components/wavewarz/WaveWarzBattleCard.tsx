import { ArrowUpRight, Flame } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import type { BattleCardItem } from '@/data/wavewarzAfrica';

interface WaveWarzBattleCardProps {
  battle: BattleCardItem;
}

export function WaveWarzBattleCard({ battle }: WaveWarzBattleCardProps) {
  const isExternal = /^https?:\/\//i.test(battle.ctaUrl);
  const isLive = battle.status === 'live';
  const isPassed = battle.status === 'passed';

  return (
    <article className="rounded-2xl border border-cyan-500/25 bg-black/45 p-3 shadow-[0_0_30px_rgba(3,169,244,0.15)] backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
            isLive
              ? 'bg-rose-500/20 text-rose-100 border border-rose-400/40'
              : isPassed
                ? 'bg-emerald-500/20 text-emerald-100 border border-emerald-400/40'
                : 'bg-cyan-500/15 text-cyan-100 border border-cyan-300/30'
          }`}
        >
          {isLive ? (
            <>
              <Flame className="h-3 w-3" />
              Live
            </>
          ) : isPassed ? (
            'Passed'
          ) : (
            'Upcoming'
          )}
        </span>
      </div>
      <div className="mb-3 flex items-center gap-2">
        <img
          src={battle.artistAImage}
          alt={battle.artistA}
          className="h-12 w-12 rounded-xl border border-white/15 object-cover"
          loading="lazy"
        />
        <div className="text-sm font-semibold text-white">{battle.artistA}</div>
        <span className="text-cyan-200/70">vs</span>
        <div className="text-sm font-semibold text-white">{battle.artistB}</div>
        <img
          src={battle.artistBImage}
          alt={battle.artistB}
          className="h-12 w-12 rounded-xl border border-white/15 object-cover"
          loading="lazy"
        />
      </div>
      <h4 className="text-base font-semibold text-white">{battle.title}</h4>
      <p className="mt-1 text-xs text-zinc-300">{battle.subtitle}</p>
      <Button asChild size="sm" className="mt-4 w-full bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30 border border-cyan-300/30">
        {isExternal ? (
          <a href={battle.ctaUrl} target="_blank" rel="noreferrer">
            Open Battle
            <ArrowUpRight className="ml-2 h-3.5 w-3.5" />
          </a>
        ) : (
          <Link to={battle.ctaUrl}>
            Open Battle
            <ArrowUpRight className="ml-2 h-3.5 w-3.5" />
          </Link>
        )}
      </Button>
    </article>
  );
}
