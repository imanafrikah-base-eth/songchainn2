// The world with depth: the skyline you can stand inside.
//
// Same city, same data, same heights as the flat map. A building is still its
// content, it is just a building you can walk up to now. Heights come from
// skylineFor() so this and the 2D blocks can never disagree about which city
// towers over the others.
//
// This module is the ONLY place three.js is imported, and it is loaded lazily
// by EnterVR. That is deliberate: the majority of visitors arrive on a phone
// over metered data, and none of them should download a renderer to look at a
// list of doors. Nothing outside this file may import it eagerly.
//
// Two comfort rules, because this runs on people's faces:
//   - The camera never moves on its own. Motion the body did not ask for is
//     what makes people ill in VR, so there is no auto-orbit, no drifting, no
//     cinematic push-in. You look, you point, you choose.
//   - Nothing flashes or strobes. Windows glow steadily.

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import { XR, Controllers, Interactive, useXR, VRButton } from '@react-three/xr';
import * as THREE from 'three';
import type { Mesh } from 'three';
import { proxied } from '../three/imageProxy';
import type { WorldConfig } from '../types';
import { skylineFor, type CityStanding } from '../skyline';
import type { CityTheme } from '../useCityTheme';

/** Distance from the visitor to the ring of cities. */
const RING_RADIUS = 17;
/** The arc the cities span, in radians. Everything stays in front of you. */
const ARC = Math.PI * 0.78;
const BUILDING_WIDTH = 4.2;
const MIN_HEIGHT = 2.2;
const MAX_HEIGHT = 15;

/** Flat hue lookup so a building reads as the same city it does on the map. */
const CITY_COLOR: Record<string, string> = {
  emerald: '#34d399',
  violet: '#a78bfa',
  sky: '#38bdf8',
  cyan: '#22d3ee',
  orange: '#fb923c',
  amber: '#fbbf24',
  rose: '#fb7185',
  yellow: '#facc15',
  red: '#f87171',
};

function positionFor(index: number, total: number): [number, number] {
  // A single city sits dead ahead rather than at the start of an arc.
  const t = total <= 1 ? 0.5 : index / (total - 1);
  const angle = -ARC / 2 + t * ARC;
  return [Math.sin(angle) * RING_RADIUS, -Math.cos(angle) * RING_RADIUS];
}


/**
 * Load one world texture, failing soft.
 *
 * useLoader() turns a failed texture into a thrown promise and takes the whole
 * scene down with it, which is how a single missing file becomes "Something
 * went wrong" on somebody's face. So the load is manual and a miss simply
 * leaves the material as the flat colour it was before textures existed. A
 * barer city is a fine outcome; a dead one is not.
 *
 * `repeat` is for the two tiles, which are wrapped rather than stretched.
 */
function useWorldTexture(
  src: string | undefined,
  repeat?: [number, number],
): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!src) return;
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
        if (repeat) {
          t.wrapS = THREE.RepeatWrapping;
          t.wrapT = THREE.RepeatWrapping;
          t.repeat.set(repeat[0], repeat[1]);
        }
        setTexture(t);
      },
      undefined,
      () => undefined,
    );
    return () => {
      live = false;
    };
    // repeat is a literal at every call site, so its identity is not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // Give the GPU memory back when the city closes.
  useEffect(() => () => texture?.dispose(), [texture]);

  return texture;
}

/**
 * The night sky, wrapped around everything.
 *
 * An equirectangular still on the inside of a very large sphere, which is the
 * cheapest way to give a scene a horizon: one draw call, one texture, no
 * lighting. BackSide because we stand inside it, and no fog on it, because fog
 * on a sky is just grey.
 */
function NightSky({ src }: { src?: string }) {
  const texture = useWorldTexture(src);
  if (!texture) return null;
  return (
    <mesh scale={[-1, 1, 1]}>
      <sphereGeometry args={[92, 40, 24]} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} fog={false} toneMapped={false} />
    </mesh>
  );
}
function CityTower({
  standing,
  index,
  total,
  accent,
  facade,
  onEnter,
}: {
  standing: CityStanding;
  index: number;
  total: number;
  accent: string;
  /** Shared across every tower: one texture uploaded to the GPU, not five. */
  facade: THREE.Texture | null;
  onEnter: (slug: string) => void;
}) {
  const ref = useRef<Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const { city, count, unit, ratio, isEmpty } = standing;

  const [x, z] = positionFor(index, total);
  const height = isEmpty ? 0.35 : MIN_HEIGHT + ratio * (MAX_HEIGHT - MIN_HEIGHT);
  const color = CITY_COLOR[city.hue] ?? CITY_COLOR.amber;

  // Every city is a different height, and repeat lives on the texture rather
  // than on the mesh, so each tower needs its own view of the same tile. A
  // clone shares the decoded image, so this is five texture objects over one
  // GPU upload, not five uploads. Repeat is derived from the height so the
  // storeys stay square instead of stretching on the tall cities.
  const wornFacade = useMemo(() => {
    if (!facade) return null;
    const t = facade.clone();
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, Math.max(1, Math.round(height / BUILDING_WIDTH)));
    t.needsUpdate = true;
    return t;
  }, [facade, height]);
  useEffect(() => () => wornFacade?.dispose(), [wornFacade]);

  // An empty city is a fenced plot here too, exactly as it is on the flat map.
  // A tower with nothing inside would be the one lie this world tells.
  if (isEmpty) {
    return (
      <group position={[x, 0, z]}>
        <mesh position={[0, 0.17, 0]} receiveShadow>
          <boxGeometry args={[BUILDING_WIDTH, height, BUILDING_WIDTH]} />
          <meshStandardMaterial color="#1a1a20" roughness={1} />
        </mesh>
        <Text
          position={[0, 1.5, BUILDING_WIDTH / 2 + 0.1]}
          fontSize={0.52}
          color="#6b7280"
          anchorX="center"
          anchorY="middle"
          maxWidth={6}
        >
          {city.name}
        </Text>
        <Text
          position={[0, 0.95, BUILDING_WIDTH / 2 + 0.1]}
          fontSize={0.3}
          color="#4b5563"
          anchorX="center"
          anchorY="middle"
          maxWidth={7}
        >
          {city.emptyLine}
        </Text>
      </group>
    );
  }

  return (
    <Interactive
      onSelect={() => onEnter(city.slug)}
      onHover={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <group position={[x, 0, z]}>
        <mesh
          ref={ref}
          position={[0, height / 2, 0]}
          castShadow
          receiveShadow
          onClick={(e) => {
            e.stopPropagation();
            onEnter(city.slug);
          }}
          onPointerOver={() => setHovered(true)}
          onPointerOut={() => setHovered(false)}
        >
          <boxGeometry args={[BUILDING_WIDTH, height, BUILDING_WIDTH]} />
          {/* The tile is near neutral and already dark, so the base colour is
              kept close to white and the city's own hue is carried by the
              emissive instead. Multiplying a dark tile by a dark colour is how
              a textured tower ends up looking like an unlit one.
              With no texture this is exactly the material it always was. */}
          <meshStandardMaterial
            map={wornFacade}
            color={wornFacade ? (hovered ? '#ffffff' : '#c9cedb') : hovered ? '#242a35' : '#14161c'}
            roughness={0.75}
            metalness={0.1}
            emissive={color}
            emissiveIntensity={hovered ? 0.32 : 0.16}
          />
        </mesh>

        {/* The roof band: the city's own colour, readable from across the square */}
        <mesh position={[0, height + 0.12, 0]}>
          <boxGeometry args={[BUILDING_WIDTH + 0.25, 0.24, BUILDING_WIDTH + 0.25]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.1} />
        </mesh>

        {/* Light spilling out of the doorway at street level */}
        <mesh position={[0, 0.5, BUILDING_WIDTH / 2 + 0.02]}>
          <planeGeometry args={[1.5, 1]} />
          <meshBasicMaterial color={color} transparent opacity={0.75} />
        </mesh>

        <Text
          position={[0, height + 0.95, 0]}
          fontSize={0.62}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.015}
          outlineColor="#000000"
        >
          {city.name}
        </Text>
        <Text
          position={[0, height + 0.42, 0]}
          fontSize={0.34}
          color={color}
          anchorX="center"
          anchorY="middle"
        >
          {`${count.toLocaleString()} ${unit}`}
        </Text>
      </group>
    </Interactive>
  );
}

/** The centre of the world: where you arrive and where everyone gathers. */
function TownSquare({ accent, ground }: { accent: string; ground: THREE.Texture | null }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <circleGeometry args={[6.5, 48]} />
        <meshStandardMaterial map={ground} color={ground ? '#8f94a0' : '#111318'} roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[6.2, 6.5, 48]} />
        <meshBasicMaterial color={accent} transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

/** OrbitControls only outside a headset; in VR the headset is the camera. */
function FlatControls() {
  const isPresenting = useXR((state) => state.isPresenting);
  if (isPresenting) return null;
  return (
    <OrbitControls
      enablePan={false}
      minDistance={4}
      maxDistance={38}
      maxPolarAngle={Math.PI / 2.05}
      target={[0, 2, 0]}
    />
  );
}

export interface WorldScene3DProps {
  world: WorldConfig;
  theme: CityTheme;
  /** True when this visitor has a headset, which only changes the copy. */
  hasHeadset: boolean;
  /** Called with a city slug when a visitor chooses a building. */
  onEnterCity: (slug: string) => void;
  onClose: () => void;
}

/**
 * The whole 3D surface, chrome included.
 *
 * The VR button lives in here rather than in EnterVR on purpose. It comes from
 * @react-three/xr, which pulls in fiber and three behind it, so importing it
 * anywhere eager would drag the entire renderer into the bundle every phone
 * downloads and quietly undo the lazy loading. Everything that touches three
 * stays behind this module's boundary.
 */
export default function World3DOverlay({
  world,
  theme,
  hasHeadset,
  onEnterCity,
  onClose,
}: WorldScene3DProps) {
  return (
    <div className="fixed inset-0 z-50 bg-[#07070b]">
      <CityCanvas world={world} theme={theme} onEnterCity={onEnterCity} />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
        <div className="pointer-events-auto rounded-xl bg-black/50 px-3 py-2 backdrop-blur-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">
            {world.artistName} World
          </p>
          <p className="mt-0.5 text-xs text-white/70">
            {hasHeadset
              ? 'Point at a building and pull the trigger to walk in.'
              : 'Drag to look around. Click a building to walk in.'}
          </p>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          {hasHeadset && (
            <VRButton
              className="rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
              onError={() => undefined}
            >
              {(status) =>
                status === 'entered'
                  ? 'Leave VR'
                  : status === 'unsupported'
                    ? 'No headset found'
                    : 'Put it on'
              }
            </VRButton>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Leave the 3D city"
            className="rounded-full bg-black/50 p-2 text-white/70 backdrop-blur-sm transition hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function CityCanvas({
  world,
  theme,
  onEnterCity,
}: {
  world: WorldConfig;
  theme: CityTheme;
  onEnterCity: (slug: string) => void;
}) {
  const skyline = useMemo(() => skylineFor(world), [world]);
  const accent = theme.accent;

  // The world's own textures, loaded once here and shared by everything in the
  // scene. A world that has none renders exactly as it did before they existed.
  const depth = world.depth;
  const facade = useWorldTexture(depth?.facade);
  // The square is walked on, the far plane is only ever seen at a glance, so
  // the tile repeats tightly on one and very loosely on the other.
  const groundNear = useWorldTexture(depth?.ground, [8, 8]);
  const groundFar = useWorldTexture(depth?.ground, [60, 60]);

  return (
    <Canvas
      shadows
      camera={{ position: [0, 1.7, 6], fov: 68, near: 0.1, far: 200 }}
      dpr={[1, 1.6]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      {/* The sky still wears whatever record is playing, inside the headset too.
          The colour stays as the ground the sky sphere sits on, and as the whole
          sky for any world that has not had one made. */}
      <color attach="background" args={[theme.isOwnRecord ? '#0a0910' : '#07070b']} />
      <fog attach="fog" args={['#07070b', 22, 74]} />

      <ambientLight intensity={0.45} />
      <hemisphereLight args={[accent, '#05050a', 0.55]} />
      <directionalLight
        position={[8, 18, 6]}
        intensity={0.85}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />

      <XR referenceSpace="local-floor" foveation={0.3}>
        <Controllers />
        <Suspense fallback={null}>
          {/* The night sky, all the way round */}
          <NightSky src={depth?.sky} />

          {/* The ground plane. Held darker than the square it surrounds, so the
              square still reads as the lit centre of the world. */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[220, 220]} />
            <meshStandardMaterial
              map={groundFar}
              color={groundFar ? '#4a4e58' : '#050509'}
              roughness={1}
            />
          </mesh>

          <TownSquare accent={accent} ground={groundNear} />

          {skyline.map((standing, i) => (
            <CityTower
              key={standing.city.slug}
              standing={standing}
              index={i}
              total={skyline.length}
              accent={accent}
              facade={facade}
              onEnter={onEnterCity}
            />
          ))}
        </Suspense>
        <FlatControls />
      </XR>
    </Canvas>
  );
}
