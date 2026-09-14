import { useMemo } from "react";
import { ARTISTS } from "@/data/musicData";
import { usePublishedCatalog } from "@/hooks/usePublishedCatalog";
import { countryOf } from "@/battlezone/lib/countryOf";

export { countryOf };

/**
 * Regions are the countries the artists actually come from.
 *
 * The battlezone used to carry a fixed list (Zambia, South Africa, Nigeria,
 * Zimbabwe, Botswana), so an artist from anywhere else had no region to be
 * in. Now the list is read off the roster: the moment an artist from Libya
 * has a song live, Libya is a region on the host screen, the live filter and
 * the country chips (founder, 14 Sep 2026).
 *
 * An artist types their location freely ("Lusaka Zambia", "Atlanta, Ga.",
 * "Maine,US"), so countryOf turns that into one country name.
 */

/** Every country an artist on SONGCHAINN is from, founding roster and uploads, sorted. */
export function useArtistRegions(extra: Array<string | null | undefined> = []): string[] {
  const { artists: published } = usePublishedCatalog();
  const extraKey = extra.filter(Boolean).join("|");
  return useMemo(() => {
    const set = new Set<string>();
    for (const a of [...ARTISTS, ...published]) {
      const country = countryOf(a.location || a.townSquare);
      if (country) set.add(country);
    }
    for (const e of extraKey ? extraKey.split("|") : []) {
      const country = countryOf(e);
      if (country) set.add(country);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [published, extraKey]);
}
