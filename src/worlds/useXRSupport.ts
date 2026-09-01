// Can this visitor put the world on their face?
//
// WebXR is the browser standard behind headset support: Quest, Pico, Vive and
// anything else that ships an immersive browser. Asking the browser directly
// is the only honest way to know, because a headset is not a screen size and
// cannot be guessed from a user agent string.
//
// This hook deliberately owns no 3D code and imports no 3D libraries. It runs
// on every visit, including the phone visits that are the majority, so it has
// to stay free. The heavy scene is loaded only once someone actually has a
// headset and actually asks to enter it.

import { useEffect, useState } from 'react';

/**
 * Minimal shape of the bits of WebXR we touch. Declared locally rather than
 * pulled from @types/webxr so this file adds no dependency of its own.
 */
interface XRSystemLike {
  isSessionSupported: (mode: string) => Promise<boolean>;
}

function xrSystem(): XRSystemLike | null {
  if (typeof navigator === 'undefined') return null;
  const xr = (navigator as Navigator & { xr?: XRSystemLike }).xr;
  return xr ?? null;
}

export type XRSupport =
  /** Still asking the browser. */
  | 'checking'
  /** A headset is present and immersive VR can start. */
  | 'ready'
  /** WebXR exists but no immersive device answered. */
  | 'no-device'
  /** This browser has no WebXR at all. The overwhelming common case. */
  | 'unsupported'
  /** WebXR needs a secure context; this page is not one. */
  | 'insecure';

export function useXRSupport(): XRSupport {
  const [support, setSupport] = useState<XRSupport>('checking');

  useEffect(() => {
    let active = true;

    const xr = xrSystem();
    if (!xr) {
      // isSecureContext is the difference between "your browser cannot" and
      // "your browser could, if this page were served over https".
      const insecure = typeof window !== 'undefined' && window.isSecureContext === false;
      setSupport(insecure ? 'insecure' : 'unsupported');
      return;
    }

    void xr
      .isSessionSupported('immersive-vr')
      .then((ok) => {
        if (active) setSupport(ok ? 'ready' : 'no-device');
      })
      .catch(() => {
        // A browser that throws here is a browser that cannot do it.
        if (active) setSupport('unsupported');
      });

    return () => {
      active = false;
    };
  }, []);

  return support;
}
