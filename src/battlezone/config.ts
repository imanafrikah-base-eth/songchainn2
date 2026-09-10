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
 * Launched on Base on 10 September 2026 as "WWA Token" ($WWAT). A token
 * address is public the moment it exists, so it ships with the app; the
 * environment still wins, so a testnet address can stand in for a rehearsal.
 */
export const WWAT_TOKEN_ADDRESS = (
  (import.meta.env.VITE_WWAT_TOKEN_ADDRESS as string | undefined) ||
  '0xefa920796416daf8dc8df7e5ceaeee45ae3350be'
).trim();

export const WWAT_TOKEN_DECIMALS = Number(import.meta.env.VITE_WWAT_TOKEN_DECIMALS ?? 18);

/** Whether the coin behind the host fee actually exists yet. */
export function wwatIsLive(): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(WWAT_TOKEN_ADDRESS);
}

/** Whether the trading ground should be shown at all. */
export function battleMarketIsLive(): boolean {
  return BATTLE_MARKET_ENABLED && wwatIsLive();
}
