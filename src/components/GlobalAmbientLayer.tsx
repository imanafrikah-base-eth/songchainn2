import { memo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { usePlayerState } from '@/context/PlayerContext';

interface GlobalAmbientLayerProps {
  isGlobalPulsing: boolean;
  prefersReducedMotion: boolean;
}

export const GlobalAmbientLayer = memo(function GlobalAmbientLayer({
  isGlobalPulsing,
  prefersReducedMotion,
}: GlobalAmbientLayerProps) {
  const { isPlaying } = usePlayerState();
  const [burstOpacity, setBurstOpacity] = useState<number | null>(null);

  useEffect(() => {
    if (!isGlobalPulsing || prefersReducedMotion) return;
    setBurstOpacity(1);
    const timeout = window.setTimeout(() => setBurstOpacity(null), 650);
    return () => window.clearTimeout(timeout);
  }, [isGlobalPulsing, prefersReducedMotion]);

  const baseOpacity = isPlaying ? [0.5, 0.8, 0.5] : 0.35;
  const shouldLoop = isPlaying && !prefersReducedMotion;

  return (
    <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
      <motion.div
        className="absolute inset-0 gradient-ambient"
        animate={{
          opacity: burstOpacity ?? baseOpacity,
          scale: shouldLoop ? [1, 1.04, 1] : 1,
        }}
        transition={
          burstOpacity !== null
            ? { duration: 0.65, ease: 'easeOut' }
            : shouldLoop
              ? { duration: 6, repeat: Infinity, ease: 'easeInOut' }
              : { duration: 0.3 }
        }
      />
    </div>
  );
});
