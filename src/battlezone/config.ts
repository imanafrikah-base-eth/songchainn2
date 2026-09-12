// Feature flags for the WaveWarz Africa battle zone.
//
// VOICE_ENABLED gates every in-app voice surface (LiveKit connection, mic
// controls, speaker requests/management, host music broadcast, audio status).
// Since 11 Sep 2026 it is on, and each battle decides for itself through
// battles.voice_enabled: the host turns voice on from the room ($3 in $WWAT on
// the Main Stage, free for the hosts the founder named). A battle without it
// keeps the X Space link, voting and text chat, exactly as before. Setting this
// back to false hides in-app voice everywhere at once.
export const VOICE_ENABLED: boolean = true;

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
export const BATTLE_MARKET_ENABLED = true;

/**
 * The host fee, separately.
 *
 * This was off for months because the fee was only ever written about: no code
 * path charged it, splitHostFee in battleMarket.ts had no callers, and every
 * fee table was empty. The notice promising artists 40% was a promise nothing
 * kept.
 *
 * It is on now because the charge is real. battle-host-fee quotes $1 in $WWAT
 * at the live price, the host's wallet pays each artist their share DIRECTLY,
 * the pooled part goes to the treasury, and the server reads every leg back off
 * Base before it records anything. A battle whose artists have no payout wallet
 * on file is not charged at all, because money that cannot reach the artist it
 * was promised to should never leave the host's wallet.
 */
export const HOST_FEE_ENABLED = true;

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

/**
 * The token ceilings on the two fees. KEEP IN STEP with MAX_FEE_TOKENS in the
 * battle-host-fee and battle-voice edge functions, which are the authority;
 * these exist so the interface can state the real price before a quote exists.
 *
 * A price in dollars against a very cheap coin asks for an absurd number of
 * tokens: at the September 2026 price $1 came to 8.7 million $WWAT and $3 to
 * 26.1 million, against a total supply of one billion. So a host pays the
 * LESSER of the dollar price and these, which today means roughly a penny to
 * host and three cents for voice. As $WWAT appreciates the dollar price falls
 * below the ceiling on its own and the real $1 and $3 take over, with no code
 * change and nothing to announce.
 */
export const HOST_FEE_MAX_TOKENS = 90_000;
export const VOICE_FEE_MAX_TOKENS = 250_000;

/** Whether the coin behind the host fee actually exists yet. */
export function wwatIsLive(): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(WWAT_TOKEN_ADDRESS);
}

/** Whether the trading ground should be shown at all. */
export function battleMarketIsLive(): boolean {
  return BATTLE_MARKET_ENABLED && wwatIsLive();
}
