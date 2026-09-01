// Walking in.
//
// You do not appear in this world, you arrive in it. The doors part, you walk
// through, and the city is on the other side. It runs once per visit and takes
// under two seconds, because the point is to make the entrance feel like a
// place rather than to make anyone wait at it.
//
// Two rules it obeys:
//   - Once per session, not once per navigation. Nothing is worse than a
//     cinematic that replays every time you back out of a room.
//   - Anyone who has asked their system for less motion gets none of it. The
//     door is simply already open. That setting is usually set by people who
//     get ill or disoriented, so it is honoured completely, not softened.

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { AvatarConfig } from '../avatars';
import { CitizenAvatar } from './CitizenAvatar';

function alreadyArrived(worldSlug: string): boolean {
  try {
    return sessionStorage.getItem(`world-arrived:${worldSlug}`) === '1';
  } catch {
    // Private mode, or storage blocked. Better to play it than to crash.
    return false;
  }
}

function markArrived(worldSlug: string) {
  try {
    sessionStorage.setItem(`world-arrived:${worldSlug}`, '1');
  } catch {
    // Nothing to do. The worst case is the walk plays again next navigation.
  }
}

export function ArrivalWalk({
  worldSlug,
  worldName,
  avatar,
  accent,
  entrance,
}: {
  worldSlug: string;
  worldName: string;
  avatar: AvatarConfig;
  /** The colour the city is currently wearing. */
  accent: string;
  /**
   * The world's own doors, if it has had them made. When there is a clip it
   * replaces the two CSS panels entirely, because a drawn door and a filmed
   * one parting at the same time read as four doors. The still is what a
   * visitor sees while the clip is fetching, and all they see if it never
   * arrives.
   */
  entrance?: { poster: string; video?: string };
}) {
  const reduceMotion = useReducedMotion();
  const [playing, setPlaying] = useState(
    () => !reduceMotion && !alreadyArrived(worldSlug),
  );

  useEffect(() => {
    if (!playing) {
      markArrived(worldSlug);
      return;
    }
    // Drawn doors take 1.9s. Filmed ones run 2.4s, and cutting a door off
    // half open is worse than the extra half second.
    const done = window.setTimeout(
      () => {
        markArrived(worldSlug);
        setPlaying(false);
      },
      entrance?.video ? 2400 : 1900,
    );
    return () => window.clearTimeout(done);
  }, [playing, worldSlug, entrance?.video]);

  return (
    <AnimatePresence>
      {playing && (
        <motion.div
          key="arrival"
          className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden bg-[#07070b]"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: 'easeInOut' }}
          aria-hidden="true"
        >
          {/* The doors. Filmed ones if this world has them, drawn ones if not. */}
          {entrance ? (
            <FilmedDoors entrance={entrance} />
          ) : (
            <>
              <motion.div
                className="absolute inset-y-0 left-0 w-1/2 border-r"
                style={{ borderColor: `rgba(255,255,255,0.08)`, background: '#0c0c12' }}
                initial={{ x: 0 }}
                animate={{ x: '-100%' }}
                transition={{ duration: 1.15, delay: 0.42, ease: [0.7, 0, 0.3, 1] }}
              />
              <motion.div
                className="absolute inset-y-0 right-0 w-1/2 border-l"
                style={{ borderColor: `rgba(255,255,255,0.08)`, background: '#0c0c12' }}
                initial={{ x: 0 }}
                animate={{ x: '100%' }}
                transition={{ duration: 1.15, delay: 0.42, ease: [0.7, 0, 0.3, 1] }}
              />
            </>
          )}

          {/* Light widening through the gap as the doors open. The filmed doors
              bring their own, so this is only for the drawn ones. */}
          {!entrance && (
            <motion.div
              className="absolute inset-y-0 left-1/2 -translate-x-1/2"
              style={{
                background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
                filter: 'blur(28px)',
              }}
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: ['0px', '260px', '0px'], opacity: [0, 0.55, 0] }}
              transition={{ duration: 1.5, delay: 0.42, times: [0, 0.45, 1] }}
            />
          )}

          {/* You, walking through it */}
          <motion.div
            className="relative z-10 flex flex-col items-center gap-4"
            initial={{ scale: 0.55, y: 40, opacity: 0 }}
            animate={{ scale: [0.55, 1.05, 1.9], y: [40, 0, -30], opacity: [0, 1, 0] }}
            transition={{ duration: 1.8, times: [0, 0.45, 1], ease: 'easeInOut' }}
          >
            <motion.div
              animate={{ rotate: [-2.5, 2.5, -2.5] }}
              transition={{ duration: 0.62, repeat: 2, ease: 'easeInOut' }}
            >
              <CitizenAvatar config={avatar} size={92} />
            </motion.div>
            <p
              className="text-[10px] font-semibold uppercase tracking-[0.3em]"
              style={{ color: accent }}
            >
              {worldName}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * The world's own doors, filmed.
 *
 * The still is painted first and stays underneath, so the fetch of the clip is
 * never a black screen. It is also the clip's poster frame, so when the video
 * does start there is nothing to see happen. If autoplay is refused, and some
 * browsers do refuse it until a visitor has interacted with the page, the still
 * is simply what the arrival was: closed doors, held for a beat.
 *
 * Nobody who asked for less motion reaches this component at all; the parent
 * has already decided not to play an arrival for them.
 */
function FilmedDoors({ entrance }: { entrance: { poster: string; video?: string } }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    void el.play().catch(() => undefined);
  }, []);

  return (
    <motion.div
      className="absolute inset-0"
      initial={{ scale: 1 }}
      animate={{ scale: 1.06 }}
      transition={{ duration: 2.2, ease: 'easeOut' }}
    >
      <img src={entrance.poster} alt="" className="absolute inset-0 h-full w-full object-cover" />
      {entrance.video && (
        <video
          ref={ref}
          src={entrance.video}
          poster={entrance.poster}
          muted
          playsInline
          preload="auto"
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {/* The frame darkens at the edges so the citizen reads against it. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(7,7,11,0.85)_100%)]" />
    </motion.div>
  );
}
