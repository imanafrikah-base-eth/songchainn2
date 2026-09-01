import { memo } from 'react';
// Imported from the leaves, not from ./index: index re-exports this file, and
// a module that imports its own barrel is a cycle that typechecks fine and
// then hands you an undefined at runtime.
import { getBlockType } from './registry';
import type { BlockContext } from './spec';

/**
 * Renders the blocks standing on one street, in order.
 *
 * An unknown block type renders nothing rather than an error. A world is
 * public-facing: a block that was removed from the shelf, or one from a seller
 * whose listing was revoked, must leave a quiet gap and never a broken page.
 * The editor is where a missing block gets flagged, not the visitor's screen.
 */

export interface BlockInstance {
  id: string;
  block_type: string;
  props: Record<string, unknown>;
  sort_order: number;
}

interface BlockListProps {
  blocks: BlockInstance[];
  ctx: BlockContext;
}

function BlockOne({ block, ctx }: { block: BlockInstance; ctx: BlockContext }) {
  const def = getBlockType(block.block_type);
  if (!def) return null;
  const Component = def.component;
  return <Component props={{ ...def.defaults, ...(block.props ?? {}) }} ctx={ctx} />;
}

export const BlockList = memo(function BlockList({ blocks, ctx }: BlockListProps) {
  if (!blocks?.length) return null;
  const ordered = [...blocks].sort((a, b) => a.sort_order - b.sort_order);
  return (
    <>
      {ordered.map((b) => (
        <BlockOne key={b.id} block={b} ctx={ctx} />
      ))}
    </>
  );
});
