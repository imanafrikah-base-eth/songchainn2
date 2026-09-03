import { useCallback, useEffect, useState } from 'react';
import {
  claimInterruption,
  releaseInterruption,
  subscribeInterruptions,
  type ClaimOptions,
} from '@/lib/interruptions';

/**
 * Gate an interrupting surface behind the app-wide interruption budget.
 *
 *   const { granted, dismiss } = useInterruption('install-banner', wantsToShow);
 *   if (!granted) return null;
 *
 * `wantsToShow` is the component's own condition. This hook only decides
 * whether the app can afford to interrupt right now, never whether the
 * surface is relevant. See src/lib/interruptions.ts.
 */
export function useInterruption(id: string, wantsToShow: boolean, opts: ClaimOptions = {}) {
  const [granted, setGranted] = useState(false);
  const { priority, cooldownMs } = opts;

  useEffect(() => {
    if (!wantsToShow) return;
    if (granted) return;

    // Retry when whoever currently holds the floor gives it up.
    const attempt = () => {
      if (claimInterruption(id, { priority, cooldownMs })) setGranted(true);
    };
    attempt();
    const unsubscribe = subscribeInterruptions(attempt);
    return unsubscribe;
  }, [id, wantsToShow, granted, priority, cooldownMs]);

  // Always hand the floor back on unmount, or a route change strands it.
  useEffect(() => () => releaseInterruption(id), [id]);

  useEffect(() => {
    if (!wantsToShow && granted) {
      releaseInterruption(id);
      setGranted(false);
    }
  }, [wantsToShow, granted, id]);

  const dismiss = useCallback(() => {
    releaseInterruption(id);
    setGranted(false);
  }, [id]);

  return { granted, dismiss };
}
