// How tall each city stands.
//
// Two surfaces draw this same skyline: the flat city blocks on the world map
// and, for anyone in a headset, the actual buildings you walk between. If they
// each did their own arithmetic they would drift apart, and Music City would
// be the tallest tower on one and the second tallest on the other. So the
// ratio lives here once and both read it.
//
// Deliberately free of any 3D import. The world map is the common case, loaded
// on every phone that opens the world, and it must not pay for a renderer it
// never uses.

import type { WorldCityDef, WorldConfig } from './types';
import { cityInventory } from './cities';

export interface CityStanding {
  city: WorldCityDef;
  /** Real item count. Zero means nothing is standing here yet. */
  count: number;
  unit: string;
  /**
   * Height against the tallest city in this world, 0 to 1. A city with
   * anything in it never reads below a floor, so a small city looks modest
   * rather than derelict.
   */
  ratio: number;
  isEmpty: boolean;
}

/** The shortest a non-empty city is allowed to look. */
const MIN_RATIO = 0.22;

export function skylineFor(world: WorldConfig): CityStanding[] {
  const counted = [...world.cities]
    .sort((a, b) => a.order - b.order)
    .map((city) => ({ city, ...cityInventory(world, city) }));

  const tallest = counted.reduce((max, c) => Math.max(max, c.count), 0);

  return counted.map(({ city, count, unit }) => {
    const isEmpty = count === 0;
    const raw = tallest > 0 ? count / tallest : 0;
    return {
      city,
      count,
      unit,
      isEmpty,
      ratio: isEmpty ? 0 : Math.max(MIN_RATIO, raw),
    };
  });
}

export function standingFor(world: WorldConfig, city: WorldCityDef): CityStanding {
  const found = skylineFor(world).find((s) => s.city.slug === city.slug);
  // Every city in the world is in its own skyline, so this only guards a
  // caller passing a city from somewhere else entirely.
  return (
    found ?? {
      city,
      count: 0,
      unit: 'items',
      ratio: 0,
      isEmpty: true,
    }
  );
}
