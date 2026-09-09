import { useRef, useState } from 'react';
import { Check, Move, RotateCcw, ZoomIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DEFAULT_FIT, fitStyle, type ArtFit } from '@/lib/artFit';

/**
 * Frame a picture or a loop the way you want it seen: drag it about, zoom in
 * or out with the slider or a pinch. Nothing is cut; the choice is saved as
 * a focus point and a zoom, and applied wherever the art shows. Works on the
 * uploaded file itself, so it costs no re-upload and no decoder.
 */
export function MediaFramer({
  src,
  kind,
  aspect,
  value,
  onChange,
  onDone,
}: {
  src: string;
  kind: 'image' | 'video';
  /** Tailwind aspect class, the slot's real shape. */
  aspect: string;
  value: ArtFit | undefined;
  onChange: (fit: ArtFit) => void;
  onDone: () => void;
}) {
  const fit = value ?? DEFAULT_FIT;
  const boxRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null);
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const [live, setLive] = useState<ArtFit>(fit);

  const set = (next: ArtFit) => {
    const clamped = { x: Math.min(1, Math.max(0, next.x)), y: Math.min(1, Math.max(0, next.y)), scale: Math.min(3, Math.max(1, next.scale)) };
    setLive(clamped);
    onChange(clamped);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      drag.current = { x: e.clientX, y: e.clientY, fx: live.x, fy: live.y };
      pinch.current = null;
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: live.scale };
      drag.current = null;
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      set({ ...live, scale: pinch.current.scale * (dist / Math.max(1, pinch.current.dist)) });
      return;
    }
    const d = drag.current;
    if (!d) return;
    // Dragging the picture right shows more of its left, so the focus moves left.
    const dx = (e.clientX - d.x) / (box.width * live.scale);
    const dy = (e.clientY - d.y) / (box.height * live.scale);
    set({ ...live, x: d.fx - dx, y: d.fy - dy });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (pointers.current.size === 0) { drag.current = null; pinch.current = null; }
    else if (pointers.current.size === 1) {
      const [p] = [...pointers.current.values()];
      drag.current = { x: p.x, y: p.y, fx: live.x, fy: live.y };
      pinch.current = null;
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center gap-2">
        <Move className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">Frame it</p>
        <span className="ml-auto text-xs text-muted-foreground">Drag, pinch, zoom</span>
      </div>
      <div
        ref={boxRef}
        className={`relative w-full overflow-hidden rounded-md bg-black/40 ${aspect} cursor-grab active:cursor-grabbing select-none`}
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onLostPointerCapture={onPointerUp}
        onDragStart={(e) => e.preventDefault()}
      >
        {kind === 'video' ? (
          <video src={src} muted loop playsInline autoPlay draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-cover" style={fitStyle(live)} />
        ) : (
          <img src={src} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-cover" style={fitStyle(live)} />
        )}
      </div>
      <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <ZoomIn className="h-4 w-4" />
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={live.scale}
          onChange={(e) => set({ ...live, scale: Number(e.target.value) })}
          aria-label="Zoom"
          className="flex-1 accent-[hsl(var(--primary))]"
        />
        <span className="w-10 text-right font-mono text-foreground">{live.scale.toFixed(1)}x</span>
      </label>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button type="button" size="sm" className="h-8 rounded-full text-xs" onClick={onDone}>
          <Check className="mr-1 h-3.5 w-3.5" /> Done
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-8 rounded-full text-xs" onClick={() => set(DEFAULT_FIT)}>
          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset
        </Button>
      </div>
    </div>
  );
}
