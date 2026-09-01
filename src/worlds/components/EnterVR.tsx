// The way into the world with depth.
//
// This file must stay free of every 3D import, including the VR button. It is
// pulled into the world map eagerly, and the map is the common case: a phone,
// on metered data, opening a list of doors. @react-three/xr drags fiber and
// three along behind it, so a single import here would put the whole renderer
// into the bundle that every one of those visitors downloads, and the lazy
// loading below would be doing nothing at all.
//
// So: this component knows only how to detect a headset (a browser API, free)
// and how to open a heavy thing on request. Everything that touches three
// lives behind the lazy boundary in WorldScene3D.
//
// Headset owners get the button that matters. People on a real computer are
// offered the same scene without the headset. On a phone neither appears, and
// the flat map is the world.

import { Suspense, lazy, useState } from 'react';
import { Box, Glasses, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { WorldConfig } from '../types';
import { useXRSupport } from '../useXRSupport';
import type { CityTheme } from '../useCityTheme';

const World3DOverlay = lazy(() => import('./WorldScene3D'));

export function EnterVR({ world, theme }: { world: WorldConfig; theme: CityTheme }) {
  const support = useXRSupport();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const hasHeadset = support === 'ready';
  // A coarse pointer with no headset is almost always a phone, and a phone has
  // no business downloading a renderer to orbit a scene it cannot drive.
  const isProbablyPhone =
    typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
  const offerFlat = !hasHeadset && !isProbablyPhone && support !== 'checking';

  if (support === 'checking') return null;
  if (!hasHeadset && !offerFlat) return null;

  const enterCity = (slug: string) => {
    setOpen(false);
    navigate(`/world/${world.slug}/${slug}`);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs font-semibold text-white/85 transition hover:border-white/40 hover:bg-white/10"
      >
        {hasHeadset ? <Glasses className="h-4 w-4" /> : <Box className="h-4 w-4" />}
        {hasHeadset ? 'Step inside in VR' : 'Look around in 3D'}
      </button>

      {open && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-[#07070b] text-white/60">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">Building the city</p>
            </div>
          }
        >
          <World3DOverlay
            world={world}
            theme={theme}
            hasHeadset={hasHeadset}
            onEnterCity={enterCity}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </>
  );
}
