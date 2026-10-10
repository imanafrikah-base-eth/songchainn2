import { memo, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

/**
 * What a pulse looks like when you send one.
 *
 * It used to wash the edges of the whole screen in a cyan glow, twice. The
 * founder asked for something more professional (10 Oct 2026). Now it is a
 * heartbeat from the exact spot you tapped: two thin rings spread out on the
 * beat, a small pop at the centre, then nothing. On a phone it is felt as well
 * as seen, a short double buzz. No colour washes the page.
 */

interface Beat {
  id: number;
  x: number;
  y: number;
}

const BEAT_GAP_S = 0.28;

export const PulseRipple = memo(function PulseRipple() {
  const calm = useReducedMotion();
  const [beats, setBeats] = useState<Beat[]>([]);
  const lastTap = useRef<{ x: number; y: number } | null>(null);
  const nextId = useRef(0);

  useEffect(() => {
    // Where the finger or cursor last went down: the pulse starts there.
    const onDown = (e: PointerEvent) => {
      lastTap.current = { x: e.clientX, y: e.clientY };
    };
    const onPulse = () => {
      const at = lastTap.current ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      const id = nextId.current++;
      setBeats((prev) => [...prev.slice(-3), { id, x: at.x, y: at.y }]);
      window.setTimeout(() => setBeats((prev) => prev.filter((b) => b.id !== id)), 1600);
      try {
        navigator.vibrate?.([14, 90, 22]);
      } catch {
        /* no vibration here */
      }
    };
    window.addEventListener('pointerdown', onDown, { passive: true, capture: true });
    window.addEventListener('songchainn:pulse', onPulse);
    return () => {
      window.removeEventListener('pointerdown', onDown, { capture: true });
      window.removeEventListener('songchainn:pulse', onPulse);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[90] overflow-hidden">
      <AnimatePresence>
        {beats.map((b) => (
          <div key={b.id} className="absolute" style={{ left: b.x, top: b.y }}>
            {calm ? (
              <motion.span
                className="absolute -left-6 -top-6 h-12 w-12 rounded-full border-2 border-primary"
                initial={{ opacity: 0.9 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 0.9 }}
              />
            ) : (
              <>
                {[0, 1].map((ring) => (
                  <motion.span
                    key={ring}
                    className="absolute -left-12 -top-12 h-24 w-24 rounded-full border-2 border-primary"
                    initial={{ scale: 0.15, opacity: 1 }}
                    animate={{ scale: 2.4, opacity: 0 }}
                    transition={{ duration: 1.25, delay: ring * BEAT_GAP_S, ease: [0.25, 0.8, 0.35, 1] }}
                  />
                ))}
                <motion.span
                  className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-primary"
                  initial={{ scale: 0, opacity: 1 }}
                  animate={{ scale: [0, 1.35, 0.85, 1.2, 0], opacity: [1, 1, 1, 1, 0] }}
                  transition={{ duration: 1.0, times: [0, 0.16, 0.3, 0.46, 1], ease: 'easeOut' }}
                />
              </>
            )}
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
});
