// A city on the world skyline, drawn as a building.
//
// Buildings are content: the lit windows are the real inventory, scaled
// against the tallest city in the world. A city with nothing in it does not
// get a building at all, it gets a fenced plot that says what it is waiting
// for. Pretending an empty city is full is how a world teaches people it is
// dead, so the map never does it.

import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Hammer } from 'lucide-react';
import type { WorldCityDef, WorldConfig } from '../types';
import { standingFor } from '../skyline';
import { DOOR_HUES } from './WorldDoor';
import { WorldArt } from './WorldArt';

const WINDOW_COLUMNS = 6;
const WINDOW_ROWS = 7;
const WINDOW_TOTAL = WINDOW_COLUMNS * WINDOW_ROWS;

export function CityBlock({
  world,
  city,
  index,
}: {
  world: WorldConfig;
  city: WorldCityDef;
  index: number;
}) {
  const hue = DOOR_HUES[city.hue] ?? DOOR_HUES.amber;
  // Height against the rest of the skyline comes from one shared source, so
  // these blocks and the 3D buildings can never disagree about which city is
  // the tallest.
  const { count, unit, ratio, isEmpty } = standingFor(world, city);
  const art = world.cityArt?.[city.slug];
  const loop = world.cityVideo?.[city.slug];

  const litWindows = Math.round(ratio * WINDOW_TOTAL);
  // The artist's own picture is the building. The lit-window grid was drawn
  // over every tower, art or not, and over IMan's it read as an equaliser
  // stamped across his work. Where the artist gave us art, the art stands as
  // they made it; the windows only dress a tower nobody has pictured yet.
  const dressed = Boolean(art);

  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.5, ease: 'easeOut' }}
      className="h-full"
    >
      {isEmpty ? (
        <FencedPlot city={city} />
      ) : (
        <Link
          to={`/world/${world.slug}/${city.slug}`}
          className="group block h-full [perspective:1100px]"
          aria-label={`Enter ${city.name}, ${count} ${unit}`}
        >
          <motion.div
            whileHover={{ rotateY: 4, rotateX: -3, y: -8, scale: 1.02 }}
            style={{ transformStyle: 'preserve-3d', transformPerspective: 1100 }}
            className={`relative flex h-full min-h-[340px] flex-col overflow-hidden rounded-t-xl rounded-b-md border shadow-xl shadow-black/60 transition-shadow ${hue.border} ${hue.glow} hover:shadow-2xl`}
          >
            {/* The tower itself. Held well down in brightness, because the lit
                windows drawn over it are the part that carries the meaning. */}
            <WorldArt
              poster={art}
              video={loop}
              className={`h-full w-full object-cover transition duration-700 group-hover:scale-105 ${
                dressed ? 'brightness-[0.9] group-hover:brightness-100' : 'brightness-[0.4] group-hover:brightness-[0.5]'
              }`}
            />
            <div className={`absolute inset-0 bg-gradient-to-t ${dressed ? 'from-black/90 via-black/30 to-transparent' : 'from-black/95 via-black/70 to-black/40'}`} />

            {/* The windows. Lit ones are content that is actually in there. */}
            {!dressed && <div
              className="absolute inset-x-0 top-0 grid gap-[6px] p-4 opacity-80"
              style={{ gridTemplateColumns: `repeat(${WINDOW_COLUMNS}, minmax(0, 1fr))` }}
              aria-hidden="true"
            >
              {Array.from({ length: WINDOW_TOTAL }).map((_, i) => {
                const lit = i < litWindows;
                return (
                  <span
                    key={i}
                    className={`h-3 rounded-[1px] transition-colors duration-500 ${
                      lit ? hue.light : 'bg-white/[0.06]'
                    }`}
                    style={lit ? { opacity: 0.35 + ((i * 37) % 45) / 100 } : undefined}
                  />
                );
              })}
            </div>}

            {/* Light spilling from the doorway at street level */}
            <div className={`absolute inset-x-10 bottom-0 h-1.5 rounded-t-full ${hue.light} blur-[7px]`} />

            {/* The nameplate at the base of the building */}
            <div className="relative mt-auto p-5" style={{ transform: 'translateZ(30px)' }}>
              <div className="flex items-baseline gap-2">
                <span className={`font-mono text-2xl font-bold tabular-nums ${hue.text}`}>
                  {count.toLocaleString()}
                </span>
                <span className="text-[11px] uppercase tracking-[0.16em] text-white/50">{unit}</span>
              </div>
              <h3 className="mt-1 font-heading text-xl font-bold text-white drop-shadow-lg">
                {city.name}
              </h3>
              <p className={`mt-0.5 text-xs font-medium drop-shadow ${hue.text}`}>{city.tagline}</p>
              <p className="mt-2 text-sm leading-relaxed text-white/65 drop-shadow">{city.teaser}</p>
              <span className={`mt-3 inline-flex items-center gap-1 text-xs font-semibold ${hue.text}`}>
                Walk in
                <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </motion.div>
        </Link>
      )}
    </motion.div>
  );
}

/**
 * A city with nothing in it yet. Deliberately not a link: there is nowhere to
 * go, and a door that opens onto an empty room is worse than a fence that is
 * honest about being a building site.
 */
function FencedPlot({ city }: { city: WorldCityDef }) {
  const hue = DOOR_HUES[city.hue] ?? DOOR_HUES.amber;
  return (
    <div className="relative flex h-full min-h-[340px] flex-col justify-end overflow-hidden rounded-md border border-dashed border-white/20 bg-white/[0.02] p-5">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, transparent, transparent 9px, #fff 9px, #fff 11px)',
        }}
        aria-hidden="true"
      />
      <div className="relative">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">
          <Hammer className="h-3 w-3" /> Building site
        </span>
        <h3 className="mt-3 font-heading text-xl font-bold text-white/80">{city.name}</h3>
        <p className={`mt-0.5 text-xs font-medium ${hue.text} opacity-70`}>{city.tagline}</p>
        <p className="mt-2 text-sm leading-relaxed text-white/45">{city.emptyLine}</p>
      </div>
    </div>
  );
}
