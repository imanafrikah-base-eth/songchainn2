// A room of a world built in the builder, seen from inside the full viewer.
//
// World #001's rooms are hand-written components. A built world's rooms are
// streets with blocks on them, so this loads that street's blocks and lets
// the shelf draw them. The world page paints on its own dark ground, and the
// app's tokens are dark by default, so the blocks read as they do anywhere
// else without being taught about the world's colours.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BlockList, type BlockInstance } from '@/worlds/blocks';
import type { WorldConfig, WorldRings } from '@/worlds/types';

export function BuiltRoom({
  world,
  roomSlug,
  rings,
}: {
  world: WorldConfig;
  roomSlug: string;
  rings: WorldRings | null;
}) {
  const { data: blocks = [], isLoading } = useQuery({
    queryKey: ['built-room', world.slug, roomSlug],
    staleTime: 30_000,
    queryFn: async (): Promise<BlockInstance[]> => {
      const { data: w } = await supabase.from('worlds').select('id').eq('slug', world.slug).maybeSingle();
      const worldId = (w as { id: string } | null)?.id;
      if (!worldId) return [];
      const { data: s } = await supabase
        .from('world_streets')
        .select('id')
        .eq('world_id', worldId)
        .eq('slug', roomSlug)
        .maybeSingle();
      const streetId = (s as { id: string } | null)?.id;
      if (!streetId) return [];
      const { data: b } = await supabase
        .from('world_blocks')
        .select('id, block_type, props, sort_order')
        .eq('street_id', streetId)
        .order('sort_order');
      return ((b ?? []) as unknown) as BlockInstance[];
    },
  });

  if (isLoading) {
    return <div className="h-24 animate-pulse rounded-2xl bg-white/5" />;
  }
  if (blocks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
        <p className="text-sm text-white/60">Nothing is standing in this room yet.</p>
        <p className="mt-1 text-xs text-white/35">The artist fills it from the builder, block by block.</p>
      </div>
    );
  }
  return (
    <div className="text-foreground">
      <BlockList blocks={blocks} ctx={{ world, rings, streetSlug: roomSlug }} />
    </div>
  );
}
