// Feature flags for the WaveWarz Africa battle zone.
//
// VOICE_ENABLED gates every in-app voice surface (LiveKit connection, mic
// controls, speaker requests/management, host music broadcast, audio status).
// While it is false, live audio for battles runs on an X (Twitter) Space that
// the host links when creating the battle; the app keeps voting + text chat.
// Flip this to true to bring the in-app LiveKit voice stack back, the code
// paths are all still in place.
export const VOICE_ENABLED = false;

// ---------------------------------------------------------------------------
// The Trading Ground
// ---------------------------------------------------------------------------

/**
 * The backing market inside a battle, and the host fee that pays for the room.
 *
 * Held shut until two things are true, because turning it on before either one
 * would put a door in front of people that cannot open:
 *
 *   1. $WWAT exists and its address is set below.
 *   2. The battle_market migration has been applied to the live project.
 *
 * Same pattern as WORLDS_ENABLED. Nothing is deleted while this is false, and
 * the battle itself, the judges, the poll and the chat all work exactly as they
 * do today. Flip this to true once both are done.
 */
export const BATTLE_MARKET_ENABLED = false;

/**
 * $WWAT, the WaveWarz Africa token. Hosting a battle is paid in it.
 *
 * Read from the environment rather than hardcoded so the coin can be launched
 * without a code change, and so a testnet address can stand in during a
 * rehearsal. Empty means the coin is not live yet.
 */
export const WWAT_TOKEN_ADDRESS = (import.meta.env.VITE_WWAT_TOKEN_ADDRESS ?? '').trim();

export const WWAT_TOKEN_DECIMALS = Number(import.meta.env.VITE_WWAT_TOKEN_DECIMALS ?? 18);

/** Whether the coin behind the host fee actually exists yet. */
export function wwatIsLive(): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(WWAT_TOKEN_ADDRESS);
}

/** Whether the trading ground should be shown at all. */
export function battleMarketIsLive(): boolean {
  return BATTLE_MARKET_ENABLED && wwatIsLive();
}
