import collage from '@/assets/app background images/background..jpg';
import djBranding from '@/assets/app background images/Dj Suffle Branding.png';
import moshaPopup from '@/assets/app background images/Mo$ha chat pop up.png';
import wavewarzHero from '@/assets/app background images/WaveWarz Africa HEADER HERO MOCKUP.png';
import wavewarzBg from '@/assets/app background images/WaveWarz Africa_ with backgroun.png';

/**
 * Section background pools for the living-world ambient layer.
 *
 * Most entries are virtual tiles cut from one 7x7 collage sheet via CSS
 * background-position, so the whole system costs a single image download
 * and every "next image" is already cached (instant, smooth crossfades).
 */

export interface BgImage {
  src: string;
  /** CSS background-position for collage tiles */
  position?: string;
  /** CSS background-size for collage tiles */
  size?: string;
}

const COLS = 7;
const ROWS = 7;

/** Virtual tile (col 0-6, row 0-6) cut from the collage sheet. */
function tile(col: number, row: number): BgImage {
  return {
    src: collage,
    size: `${COLS * 100}% ${ROWS * 100}%`,
    position: `${(col / (COLS - 1)) * 100}% ${(row / (ROWS - 1)) * 100}%`,
  };
}

function full(src: string): BgImage {
  return { src };
}

// Collage tile map (col, row):
// r0: rapper+smoke | stage crowd | singer w/ headphones | producer desk | crowd silhouette | hands up | praying artist
// r1: phone at show | friends w/ headphones | fireworks heart | MUSIC FREEDOM | fans voting screens | cypher circle | laughing artist
// r2: vinyl turntable | headphones | DJ deck | studio mic | neon mixer | waveform | music notes
// r3: connect wallet | hologram note | rare track | YOU OWN THIS TRACK | royalty network | royalties earned | marketplace
// r4: studio hang | dark studio | listening session | signing deal | table talk | showcase screen | OPEN MIC NIGHT
// r5: city skyline | light trails | tower skyline | future dome | THE FUTURE IS OURS | neon artist | CREATE COLLAB ELEVATE
// r6: blue smoke | purple nebula | neon note swirl | equalizer | neon crown | MUSIC IS POWER | flowing notes

export const backgroundPools = {
  auth: [
    tile(0, 0), // rapper in smoke
    tile(6, 0), // praying artist
    tile(4, 0), // crowd silhouette
    tile(1, 6), // purple nebula
    tile(0, 5), // city skyline
    tile(6, 6), // flowing notes
  ],
  presigninHero: [
    tile(1, 0), // stage crowd
    tile(5, 0), // hands up
    tile(4, 5), // THE FUTURE IS OURS
    tile(2, 1), // fireworks heart hands
    tile(0, 0), // rapper in smoke
    tile(5, 6), // MUSIC IS POWER graffiti
  ],
  djShuffle: [
    tile(0, 2), // vinyl turntable
    tile(1, 2), // headphones
    tile(2, 2), // DJ deck
    tile(3, 0), // producer room
    tile(4, 2), // studio mixer
    tile(5, 2), // waveform
    tile(6, 2), // music notes
    tile(3, 6), // equalizer glow
    tile(2, 6), // neon note swirl
    full(djBranding),
  ],
  waveWarz: [
    tile(5, 1), // cypher circle
    tile(1, 0), // live crowd + stage lights
    tile(5, 0), // fans hands up
    tile(3, 2), // microphone
    tile(4, 1), // fans voting screens
    tile(3, 1), // MUSIC FREEDOM crowd
    tile(4, 5), // neon street music scene
    tile(0, 1), // phone at show
    full(wavewarzHero),
    full(wavewarzBg),
  ],
  battleZones: [
    tile(5, 1), // cypher circle
    tile(3, 2), // microphone
    tile(1, 0), // stage crowd
    tile(4, 1), // fans voting
    tile(6, 4), // OPEN MIC NIGHT
    tile(5, 0), // battle energy hands
    tile(0, 0), // artist on the mic
    tile(5, 6), // MUSIC IS POWER
  ],
  theRoom: [
    tile(1, 1), // friends with headphones
    tile(0, 4), // studio hang
    tile(2, 4), // listening session
    tile(4, 4), // table talk
    tile(6, 4), // OPEN MIC NIGHT
    tile(6, 6), // flowing notes
  ],
  moSha: [
    full(moshaPopup),
    tile(1, 6), // purple nebula
    tile(0, 6), // blue smoke
    tile(6, 5), // CREATE COLLAB ELEVATE
  ],
  dailyMix: [
    tile(6, 2), // music notes
    tile(5, 2), // waveform
    tile(2, 6), // neon note swirl
    tile(3, 6), // equalizer
    tile(1, 2), // headphones
    tile(1, 6), // purple nebula
  ],
  onchainMarketplace: [
    tile(3, 3), // YOU OWN THIS TRACK
    tile(2, 3), // rare track card
    tile(1, 3), // hologram note
    tile(5, 3), // royalties earned
    tile(6, 3), // marketplace
    tile(4, 3), // royalty network
    tile(4, 6), // neon crown
    tile(0, 3), // connect wallet
  ],
} satisfies Record<string, BgImage[]>;

export type BackgroundPoolName = keyof typeof backgroundPools;
