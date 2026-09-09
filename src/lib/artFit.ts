import type { CSSProperties } from 'react';

/**
 * How a picture or loop sits in its frame, chosen by the artist: the point of
 * the picture that stays centred (fractions of its width and height) and a
 * zoom. Nothing is cut on upload; the frame is applied where the art shows,
 * so the same file can be framed differently on the map and in a room.
 */
export interface ArtFit {
  x: number;
  y: number;
  scale: number;
}

export const DEFAULT_FIT: ArtFit = { x: 0.5, y: 0.5, scale: 1 };

export type ArtFitMap = Record<string, ArtFit>;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function normaliseFit(raw: unknown): ArtFit | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const x = Number(r.x), y = Number(r.y), scale = Number(r.scale);
  if (![x, y, scale].every(Number.isFinite)) return undefined;
  return { x: clamp01(x), y: clamp01(y), scale: Math.min(3, Math.max(1, scale)) };
}

export function normaliseFitMap(raw: unknown): ArtFitMap {
  if (!raw || typeof raw !== 'object') return {};
  const out: ArtFitMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const f = normaliseFit(v);
    if (f) out[k] = f;
  }
  return out;
}

/** The CSS that puts a covered image or video where the artist framed it. */
export function fitStyle(fit: ArtFit | undefined): CSSProperties | undefined {
  if (!fit) return undefined;
  const origin = `${(fit.x * 100).toFixed(2)}% ${(fit.y * 100).toFixed(2)}%`;
  return {
    objectPosition: origin,
    transform: fit.scale !== 1 ? `scale(${fit.scale})` : undefined,
    transformOrigin: origin,
  };
}
