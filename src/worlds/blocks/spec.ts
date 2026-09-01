// What a block is, and how the editor learns to edit it.
//
// The one decision that makes the world builder cheap to own: every block type
// declares its own props, and the editor renders its settings form from that
// declaration. Nobody hand-writes an editor screen for a block, not ours and
// not a seller's. A new block added on Tuesday has a working settings panel on
// Tuesday.
//
// Blocks are deliberately declarative. A block says "show these images" or
// "show this artist's catalog"; it never runs logic of its own. That is what
// makes it safe to let strangers ship them later, and it is why a block asks
// the host for a ring and is told yes or no, never why.

import type { ComponentType } from 'react';
import type { WorldConfig, WorldRings } from '../types';

export type PropKind =
  | 'text'
  | 'longtext'
  /** A list of lines: paragraphs, credits, bullet points. */
  | 'lines'
  | 'image'
  /** A list of image URLs. */
  | 'images'
  | 'url'
  | 'number'
  | 'date'
  | 'boolean'
  | 'select';

export interface PropSpec {
  key: string;
  label: string;
  kind: PropKind;
  /** Shown under the field. Say what it does, not what it is. */
  help?: string;
  placeholder?: string;
  required?: boolean;
  /** For 'select'. */
  options?: Array<{ value: string; label: string }>;
  /** For 'number'. */
  min?: number;
  max?: number;
  maxLength?: number;
}

/** Everything a block is handed at render time. It gets no more than this. */
export interface BlockContext {
  world: WorldConfig;
  /** The visitor's resolved rings. A block reads these; it never decides them. */
  rings: WorldRings | null;
  /** The street this block is standing on. */
  streetSlug: string;
}

export interface BlockProps {
  props: Record<string, unknown>;
  ctx: BlockContext;
}

export interface BlockTypeDef {
  /** Stable id, stored in world_blocks.block_type. Renaming one is a migration. */
  id: string;
  name: string;
  /** One line in the block picker. What a visitor will see, not how it works. */
  description: string;
  /** Grouping in the picker. */
  category: 'music' | 'words' | 'visual' | 'people' | 'event';
  props: PropSpec[];
  defaults: Record<string, unknown>;
  component: ComponentType<BlockProps>;
}

/* ---------- prop readers ---------- */
/* Blocks are fed jsonb that a human typed into a form, so every read is
   defensive. A malformed prop shows an empty block, never a crash. */

export function str(props: Record<string, unknown>, key: string, fallback = ''): string {
  const v = props[key];
  return typeof v === 'string' ? v : fallback;
}

export function num(props: Record<string, unknown>, key: string, fallback = 0): number {
  const v = props[key];
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function bool(props: Record<string, unknown>, key: string, fallback = false): boolean {
  const v = props[key];
  return typeof v === 'boolean' ? v : fallback;
}

export function list(props: Record<string, unknown>, key: string): string[] {
  const v = props[key];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
  // The form stores multi-line fields as one string; split on newlines.
  if (typeof v === 'string') return v.split('\n').map((s) => s.trim()).filter(Boolean);
  return [];
}
