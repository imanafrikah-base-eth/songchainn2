import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
// Deliberately NOT drei's <Environment> or <Text>: the first fetches an HDR
// and the second a font, both from a CDN. In a PWA behind a strict CSP that is
// a hang, not a fallback, and it is why the room sat on "Building the room..."
// the first time it was tested. Lights are local. Labels are HTML.
import { Html, OrbitControls } from '@react-three/drei';
import { Controllers, VRButton, XR } from '@react-three/xr';
import * as THREE from 'three';
import { proxied } from './imageProxy';

/**
 * A street, standing up in three dimensions.
 *
 * The flat view is the truth: every street works as a page and always will,
 * because most people arrive on a phone with one thumb. This is the same
 * street given depth, for the people who want to walk it, and the same scene
 * is what a headset renders. One room definition, three ways in: look around
 * on a desktop, tilt on a phone, stand inside it in a headset.
 *
 * Deliberately cheap: planes and one environment light, no shadows, no
 * post-processing, pixel ratio capped. A world has to open on a mid-range
 * Android before it is allowed to impress anybody on a desktop.
 */

export interface StagePanel {
  /** Image to hang. Album art, a photo, a still. */
  src: string;
  label?: string;
}

interface WorldStageProps {
  panels: StagePanel[];
  /** Room tint, taken from the world's accent. Kept desaturated on purpose. */
  accentHex?: string;
  title?: string;
  onExit?: () => void;
}

/**
 * One hung image.
 *
 * Loads its own texture, and crucially fails soft. WebGL will not accept a
 * texture from a host that does not send CORS headers, and the artwork lives
 * on R2 buckets that currently do not. useLoader() turns that into a thrown
 * promise and takes the entire room down with it, which is exactly what
 * happened the first time this was tested: one un-CORSed image, whole scene
 * replaced by "Something went wrong".
 *
 * So the load is manual, the failure is caught, and a panel that cannot show
 * its picture hangs as an empty frame with its label. The room still stands.
 */
function Panel({
  src,
  label,
  position,
  rotation,
}: StagePanel & { position: [number, number, number]; rotation: [number, number, number] }) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [failed, setFailed] = useState(false);
  const mesh = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    let live = true;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      proxied(src),
      (t) => {
        if (!live) {
          t.dispose();
          return;
        }
        t.colorSpace = THREE.SRGBColorSpace;
        setTexture(t);
      },
      undefined,
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [src]);

  // Free the GPU memory when the room closes.
  useEffect(() => () => texture?.dispose(), [texture]);

  // Panels breathe very slightly. Enough to read as a place rather than a
  // slideshow, small enough that nobody on a phone notices the cost.
  useFrame(({ clock }) => {
    if (!mesh.current) return;
    mesh.current.position.y = position[1] + Math.sin(clock.elapsedTime * 0.5 + position[0]) * 0.02;
  });

  const aspect = useMemo(() => {
    const img = texture?.image as { width?: number; height?: number } | undefined;
    if (!img?.width || !img?.height) return 1;
    return img.width / img.height;
  }, [texture]);

  const height = 1.6;
  const width = height * aspect;

  return (
    <group position={position} rotation={rotation}>
      <mesh
        ref={mesh}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      >
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          // An empty frame while it loads, and permanently if it cannot be
          // fetched. Never a missing mesh, never a thrown promise.
          map={texture ?? null}
          color={texture ? '#ffffff' : failed ? '#1F2125' : '#1A1B1E'}
          roughness={0.85}
          metalness={0}
          emissive={new THREE.Color(hovered ? '#222429' : '#000000')}
        />
      </mesh>
      {/* A hairline frame, the 3D equivalent of the app's 1px border. */}
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[width + 0.06, height + 0.06]} />
        <meshBasicMaterial color="#32343A" />
      </mesh>
      {label ? (
        <Html position={[0, -height / 2 - 0.22, 0]} center distanceFactor={8} occlude>
          <span className="whitespace-nowrap text-[11px] text-muted-foreground">{label}</span>
        </Html>
      ) : null}
    </group>
  );
}

/**
 * How many pictures to hang.
 *
 * Measured, not guessed: four full-size covers came to 7.9 MB, and that is on
 * top of what the flat page already downloaded, because the proxied texture URL
 * cannot share the browser cache with the plain <img> one. Until the artwork is
 * served at a sane size for textures, a phone gets fewer walls.
 */
function panelBudget(): number {
  if (typeof window === 'undefined') return 6;
  const narrow = window.innerWidth < 700;
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    ?.saveData;
  if (saveData) return 3;
  return narrow ? 5 : 10;
}

function Room({ panels, accentHex = '#3B82F6', title }: WorldStageProps) {
  // Panels are hung around the viewer on an arc, so turning your head finds
  // more rather than running out of room.
  const placed = useMemo(() => {
    const radius = 4;
    const budget = panelBudget();
    const spread = Math.min(Math.PI * 1.4, 0.5 * panels.length);
    const start = -spread / 2;
    return panels.slice(0, budget).map((p, i) => {
      const t = panels.length === 1 ? 0 : start + (spread * i) / Math.max(1, panels.length - 1);
      return {
        ...p,
        position: [Math.sin(t) * radius, 1.5, -Math.cos(t) * radius] as [number, number, number],
        rotation: [0, t, 0] as [number, number, number],
      };
    });
  }, [panels]);

  return (
    <>
      <color attach="background" args={['#101113']} />
      <fog attach="fog" args={['#101113', 6, 16]} />

      <ambientLight intensity={1.1} />
      <directionalLight position={[3, 6, 3]} intensity={0.9} />
      <directionalLight position={[-4, 3, 2]} intensity={0.35} />
      {/* The accent exists as one distant light, not as a wash over everything. */}
      <pointLight position={[0, 3, -5]} intensity={12} distance={14} color={accentHex} />

      {/* Floor. A plain surface catching the light, no grid, no glow. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, 0]}>
        <circleGeometry args={[14, 48]} />
        <meshStandardMaterial color="#1A1B1E" roughness={0.95} />
      </mesh>

      {title ? (
        <Html position={[0, 3, -4]} center distanceFactor={6}>
          <span className="whitespace-nowrap font-heading text-lg font-semibold text-foreground">
            {title}
          </span>
        </Html>
      ) : null}

      {placed.map((p, i) => (
        <Suspense
          key={`${p.src}-${i}`}
          fallback={
            <mesh position={p.position} rotation={p.rotation}>
              <planeGeometry args={[1.6, 1.6]} />
              <meshBasicMaterial color="#1A1B1E" />
            </mesh>
          }
        >
          <Panel {...p} />
        </Suspense>
      ))}

      {!placed.length ? (
        <Html center>
          <p className="text-sm text-muted-foreground">Nothing hung on this street yet.</p>
        </Html>
      ) : null}
    </>
  );
}

export default function WorldStage({ panels, accentHex, title, onExit }: WorldStageProps) {
  return (
    <div className="relative h-[70vh] min-h-[380px] w-full overflow-hidden rounded-lg border border-border bg-card">
      <Canvas
        camera={{ position: [0, 1.6, 0.1], fov: 70 }}
        // Capped: a retina phone rendering at 3x for a room of flat planes is
        // heat and battery for nothing.
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <XR>
          <Controllers />
          <Room panels={panels} accentHex={accentHex} title={title} />
          <OrbitControls
            enablePan={false}
            enableZoom={false}
            // Standing in the middle looking out, which is what a room is.
            target={[0, 1.5, -1]}
            rotateSpeed={-0.35}
            maxPolarAngle={Math.PI * 0.62}
            minPolarAngle={Math.PI * 0.28}
          />
        </XR>
      </Canvas>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 p-3">
        <span className="rounded-full bg-background/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur">
          Drag to look around
        </span>
        {onExit ? (
          <button
            type="button"
            onClick={onExit}
            className="pointer-events-auto rounded-full border border-border bg-background/80 px-4 py-1.5 text-xs font-medium text-foreground backdrop-blur focus-ring"
          >
            Back to the page
          </button>
        ) : null}
      </div>
    </div>
  );
}

export { VRButton };
