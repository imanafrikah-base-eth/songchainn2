import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CENTRE_CROP, type PhotoCrop } from '@/lib/cropImage';

/**
 * A photo you drag into place inside a window.
 *
 * Fills whatever box it is put in. The photo is scaled to cover the box
 * (never a gap on any side), and dragging slides it so a different part
 * shows. Every move is written straight to the image's transform on the
 * next animation frame, never through React state, so it tracks the finger.
 * The browser is told to keep its hands off touches here (no page scroll,
 * no image drag-ghost), which is what made the old version stutter.
 *
 * Reports the crop as fractions of the photo plus the box's aspect ratio,
 * so `cropImage()` can cut the same window out of the full-size file.
 */
export function PhotoPositioner({
  src,
  onChange,
  hint = 'Drag to fit',
  disabled = false,
  alt = '',
  className = '',
}: {
  src: string;
  onChange: (crop: PhotoCrop) => void;
  /** Small label at the bottom; pass null for none. */
  hint?: string | null;
  disabled?: boolean;
  alt?: string;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const natural = useRef({ w: 0, h: 0 });
  const box = useRef({ w: 0, h: 0 });
  const crop = useRef({ cx: 0.5, cy: 0.5 });
  const drag = useRef<{ id: number; x: number; y: number; cx: number; cy: number } | null>(null);
  const frame = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  /** Scale and size of the photo as displayed, covering the box. */
  const layout = useCallback(() => {
    const { w: nw, h: nh } = natural.current;
    const { w: bw, h: bh } = box.current;
    if (!nw || !nh || !bw || !bh) return null;
    const scale = Math.max(bw / nw, bh / nh);
    return { dw: nw * scale, dh: nh * scale, bw, bh };
  }, []);

  /** Keep the window inside the photo. */
  const clamp = useCallback(() => {
    const l = layout();
    if (!l) return;
    const halfX = l.bw / 2 / l.dw;
    const halfY = l.bh / 2 / l.dh;
    crop.current.cx = l.dw <= l.bw + 0.5 ? 0.5 : Math.min(1 - halfX, Math.max(halfX, crop.current.cx));
    crop.current.cy = l.dh <= l.bh + 0.5 ? 0.5 : Math.min(1 - halfY, Math.max(halfY, crop.current.cy));
  }, [layout]);

  const paint = useCallback(() => {
    frame.current = null;
    const l = layout();
    const img = imgRef.current;
    if (!l || !img) return;
    clamp();
    const tx = l.bw / 2 - crop.current.cx * l.dw;
    const ty = l.bh / 2 - crop.current.cy * l.dh;
    img.style.width = `${l.dw}px`;
    img.style.height = `${l.dh}px`;
    img.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
  }, [layout, clamp]);

  const schedule = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(paint);
  }, [paint]);

  const report = useCallback(() => {
    const l = layout();
    if (!l) return;
    onChangeRef.current({ cx: crop.current.cx, cy: crop.current.cy, aspect: l.bw / l.bh });
  }, [layout]);

  // A new photo starts centred.
  useEffect(() => {
    crop.current = { cx: 0.5, cy: 0.5 };
    natural.current = { w: 0, h: 0 };
    setReady(false);
    onChangeRef.current({ ...CENTRE_CROP, aspect: box.current.h ? box.current.w / box.current.h : 1 });
  }, [src]);

  // The box can change size (rotation, a dialog opening); follow it.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      box.current = { w: r.width, h: r.height };
      schedule();
      if (natural.current.w) report();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [schedule, report]);

  const onLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    natural.current = { w: img.naturalWidth, h: img.naturalHeight };
    paint();
    setReady(true);
    report();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || !ready || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: crop.current.cx, cy: crop.current.cy };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const l = layout();
    if (!d || d.id !== e.pointerId || !l) return;
    e.preventDefault();
    crop.current.cx = d.cx - (e.clientX - d.x) / l.dw;
    crop.current.cy = d.cy - (e.clientY - d.y) / l.dh;
    clamp();
    schedule();
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    paint();
    report();
  };

  return (
    <div
      ref={boxRef}
      className={`${className.includes('absolute') ? '' : 'relative'} overflow-hidden select-none ${disabled ? '' : 'cursor-grab active:cursor-grabbing'} ${className}`}
      style={{ touchAction: 'none', WebkitUserSelect: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onDragStart={(e) => e.preventDefault()}
      role="img"
      aria-label={alt || 'Photo, drag to fit'}
    >
      <img
        ref={imgRef}
        src={src}
        alt=""
        draggable={false}
        onLoad={onLoad}
        className="pointer-events-none absolute left-0 top-0 max-w-none"
        style={{ willChange: 'transform', opacity: ready ? 1 : 0, transition: 'opacity 120ms ease-out' }}
      />
      {hint && ready && !disabled && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
          <span className="rounded-full bg-background/70 px-3 py-1 text-[10px] font-medium tracking-wide text-foreground/80">
            {hint}
          </span>
        </div>
      )}
    </div>
  );
}
