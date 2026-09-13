// One art slot in the world: a still, and a silent loop over it when the
// visitor's device and settings have earned one.
//
// Every place the world shows artwork goes through here, so the rules about
// motion are written once instead of nine times:
//
//   - The still ships first. It is also the video's poster frame, so the
//     handover is invisible and a visitor who never gets the video is not
//     looking at a hole.
//   - Reduced motion means no video at all. Not a slowed one, none. That
//     setting is usually set by people who get ill or disoriented.
//   - Save-Data, or a connection the browser calls 2g, means no video. A
//     world map carries fifteen of these slots and nobody on a metered phone
//     agreed to download fifteen films to read a list of doors.
//   - A slot that is not on screen does not decode. Loops attach their source
//     when they come into view and pause when they leave, so the cost is what
//     you are actually looking at rather than everything that exists.
//
// The video is decoration, always: alt text stays empty and the element is
// hidden from assistive tech, because the still underneath says the same
// thing and the loop says nothing a screen reader can use.

import { useEffect, useRef, useState } from 'react';
import { fitStyle, type ArtFit } from '@/lib/artFit';
import { decorativeVideoAllowed, thumb } from '@/lib/img';

/**
 * True when this visitor should not be sent a video at all: reduced motion,
 * Save-Data, or a 2g or 3g connection. A 3g phone was being handed 2 MB
 * loops for a list of doors.
 */
function motionIsUnwelcome(): boolean {
  return !decorativeVideoAllowed();
}

export function WorldArt({
  poster,
  video,
  className = '',
  /** Set on both layers, so the still and the loop are framed identically. */
  objectPosition,
  /**
   * The still loads straight away instead of lazily, for a slot that is on
   * screen the moment the page paints. The loop still waits until the slot
   * is actually visible: a slideshow below the fold used to start a 2 MB
   * film before anybody scrolled to it.
   */
  eager = false,
  fit,
  /**
   * How wide the slot is on screen, in CSS pixels, so the still is fetched at
   * that size rather than at the artist's full upload. Defaults to a phone's
   * full width.
   */
  posterWidth = 414,
}: {
  poster?: string;
  video?: string;
  className?: string;
  objectPosition?: string;
  eager?: boolean;
  /** Where the artist put the focus and how far in they zoomed. */
  fit?: ArtFit;
  posterWidth?: number;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Resolved once, on the client, because the answer depends on the device.
  const [wantsMotion, setWantsMotion] = useState(false);
  const [visible, setVisible] = useState(false);
  const still = thumb(poster, posterWidth);

  useEffect(() => {
    setWantsMotion(!motionIsUnwelcome());
  }, []);

  useEffect(() => {
    if (!wantsMotion || !video) return;
    const node = holder.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      // A little margin so a door starts moving just before you reach it.
      { rootMargin: '200px', threshold: 0.01 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [wantsMotion, video]);

  const showVideo = Boolean(video) && wantsMotion && visible;

  // Pause what has scrolled away rather than letting the browser decide.
  //
  // This watches showVideo, not visible. The element does not exist until
  // wantsMotion has resolved on the client, and a slot that is already in view
  // never changes visible after that, so keying on visible alone left the
  // video mounted and paused forever.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (showVideo) {
      // A rejected play() is normal, not an error: some browsers refuse
      // autoplay until the visitor has interacted with the page. The poster
      // is already there, so refusing costs nothing.
      void el.play().catch(() => undefined);
    } else {
      el.pause();
    }
  }, [showVideo]);

  return (
    <div ref={holder} className="absolute inset-0" aria-hidden="true">
      {/* Both layers are taken out of flow and stacked in the same box. Left
          in normal flow they sit one under the other, which is a still with a
          film playing underneath it rather than a slot that moves. */}
      {still && (
        <img
          src={still}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          className={`absolute inset-0 ${className}`}
          style={fit ? fitStyle(fit) : objectPosition ? { objectPosition } : undefined}
        />
      )}
      {showVideo && (
        <video
          ref={videoRef}
          src={video}
          poster={still}
          muted
          loop
          playsInline
          preload="none"
          // Framed the way the artist framed it: their focus point, their zoom.
          className={`absolute inset-0 ${className}`}
          style={fit ? fitStyle(fit) : objectPosition ? { objectPosition } : undefined}
        />
      )}
    </div>
  );
}
