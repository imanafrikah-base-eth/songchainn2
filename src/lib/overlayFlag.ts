import { useEffect } from 'react';

/**
 * Telling the rest of the app that something is covering the screen.
 *
 * Mo$ha parks a tab on the right edge. A dialog built on Radix locks the body
 * and he steps aside on his own, but the app also has hand-built panels, and
 * on those he sat right on top of the panel: the invite sheet in particular
 * had his tab across it. Rather than teach him about every panel one by one,
 * a panel says "I am open" here and anything that needs to move gets out of
 * the way.
 *
 * A count, not a flag, because two panels can be open at once and the second
 * one closing must not clear the first one's mark.
 */
const ATTR = 'data-overlay-open';
let open = 0;

function write() {
  if (typeof document === 'undefined') return;
  if (open > 0) document.body.setAttribute(ATTR, 'true');
  else document.body.removeAttribute(ATTR);
}

export function useOverlayFlag(isOpen: boolean) {
  useEffect(() => {
    if (!isOpen) return;
    open += 1;
    write();
    return () => {
      open = Math.max(0, open - 1);
      write();
    };
  }, [isOpen]);
}
