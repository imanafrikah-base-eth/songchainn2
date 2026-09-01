import { lazy, Suspense, useEffect, useState } from 'react';
import { Box, Headset } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { BlockInstance } from '@/worlds/blocks';

/**
 * The door between the flat street and the dimensional one.
 *
 * Three rules this enforces, all of them about not punishing the majority:
 *
 *  1. The 3D bundle is lazy. Someone who never taps "Walk in" never downloads
 *     three.js, and the page they came for stays fast.
 *  2. No WebGL, no offer. An old phone or a locked-down browser sees the page
 *     it can actually use, with no broken canvas and no apology.
 *  3. VR is only offered where a headset actually reports itself, because an
 *     "Enter VR" button that does nothing is worse than no button.
 */

const WorldStage = lazy(() => import('./WorldStage'));

/** Cheap, cached probe. Creating a context per render would be its own bug. */
let webglSupport: boolean | null = null;
function hasWebGL(): boolean {
  if (webglSupport !== null) return webglSupport;
  try {
    const canvas = document.createElement('canvas');
    webglSupport = Boolean(
      canvas.getContext('webgl2') ?? canvas.getContext('webgl'),
    );
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

/** Pull every image a street is showing, so the room is hung with real work. */
export function panelsFromBlocks(blocks: BlockInstance[]): Array<{ src: string; label?: string }> {
  const out: Array<{ src: string; label?: string }> = [];
  for (const b of blocks) {
    const props = (b.props ?? {}) as Record<string, unknown>;
    const push = (value: unknown, label?: string) => {
      if (typeof value !== 'string') return;
      for (const line of value.split('\n')) {
        const src = line.trim();
        if (src.startsWith('http') || src.startsWith('/')) out.push({ src, label });
      }
    };
    push(props.image, typeof props.title === 'string' ? props.title : undefined);
    push(props.images);
    if (Array.isArray(props.images)) {
      for (const src of props.images) {
        if (typeof src === 'string') out.push({ src });
      }
    }
  }
  return out;
}

interface WalkIn3DProps {
  panels: Array<{ src: string; label?: string }>;
  title?: string;
  accentHex?: string;
}

export function WalkIn3D({ panels, title, accentHex }: WalkIn3DProps) {
  const [open, setOpen] = useState(false);
  const [supported, setSupported] = useState(false);
  const [xr, setXr] = useState(false);

  useEffect(() => {
    setSupported(hasWebGL());
    // navigator.xr exists in plenty of browsers that cannot actually present.
    // Only isSessionSupported tells the truth.
    const nav = navigator as Navigator & {
      xr?: { isSessionSupported?: (mode: string) => Promise<boolean> };
    };
    let live = true;
    void nav.xr
      ?.isSessionSupported?.('immersive-vr')
      .then((ok) => {
        if (live) setXr(Boolean(ok));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  if (!supported || !panels.length) return null;

  if (!open) {
    return (
      <div className="my-6 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          className="h-11 rounded-full px-5 text-sm font-semibold"
          onClick={() => setOpen(true)}
        >
          <Box className="mr-2 h-4 w-4" />
          Walk in
        </Button>
        {xr ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Headset className="h-3.5 w-3.5" />
            Headset detected, you can stand inside this one
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="my-6">
      <Suspense
        fallback={
          <div className="flex h-[70vh] min-h-[380px] items-center justify-center rounded-lg border border-border bg-card">
            <p className="text-sm text-muted-foreground">Building the room...</p>
          </div>
        }
      >
        <WorldStage
          panels={panels}
          title={title}
          accentHex={accentHex}
          onExit={() => setOpen(false)}
        />
      </Suspense>
    </div>
  );
}

export default WalkIn3D;
