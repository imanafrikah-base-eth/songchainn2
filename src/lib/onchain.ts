/**
 * The SONGCHAINN on-chain estate. One place, so no other file has to guess.
 *
 * Every address and every claim below was READ OFF BASE MAINNET on 1 Sep 2026
 * with `scripts/inspect-songchainn-tokens.mjs`, `-deep.mjs` and `-final.mjs`.
 * Nothing here is from memory. Re-run those scripts to re-verify.
 */

/**
 * The SONGCHAINN treasury. Everything the platform earns goes here, including
 * its cut of the battle host fee.
 *
 * VERIFIED: a plain wallet, no contract code.
 * VERIFIED: 0 ETH, and it has NEVER SENT A TRANSACTION (nonce 0).
 *
 * That last fact is worth keeping in view. A never-used address is indis-
 * tinguishable on chain from an address nobody holds the key to, and money
 * sent to the wrong one is simply gone. Send a token amount and move it back
 * out once, before any real revenue is pointed here.
 */
export const TREASURY_ADDRESS = '0x70d211C7ed27CFA73d6FdDAF43736159F19EA118' as const;

/**
 * SongChainn Protocol Credit, symbol SONGCHAINN. 18 decimals.
 *
 * VERIFIED NON-TRANSFERABLE. `transfer` reverts even when the amount is ZERO,
 * which an ordinary ERC-20 always permits. That is an unconditional refusal
 * built into the contract, not a balance check failing.
 *
 * WHAT THIS MEANS, AND IT IS THE MOST IMPORTANT LINE IN THIS FILE:
 * THIS TOKEN CAN NEVER PAY ANYBODY. It cannot settle a host fee, it cannot be
 * shared out to winners, and it cannot reach an artist. Any design that moves
 * value has to use something transferable: ETH, USDC, or a separate tradable
 * token. Pointing a payout at this address would build a machine that reverts
 * every time it runs.
 *
 * WHAT IT IS GOOD FOR: exactly what its name says. A credit, a standing, a
 * reputation that is yours and cannot be bought off you. It is the natural home
 * for the loyalty points ledger, for tier, and for proving somebody was early.
 * Non-transferability is a feature there, not a defect.
 *
 * VERIFIED: totalSupply is 0. Nothing has ever been issued.
 * VERIFIED: the owner can still `mint`, so supply can be issued when wanted.
 */
export const PROTOCOL_CREDIT_ADDRESS = '0x50d9AeA41a57B84726624A695ba843e669be6a49' as const;
export const PROTOCOL_CREDIT_TRANSFERABLE = false;

/**
 * The Song Registry.
 *
 * VERIFIED: NOT an ERC-20. `name`, `totalSupply` and `balanceOf` all revert.
 * It exposes `owner`, `transferOwnership` and `supportsInterface`, which is the
 * shape of a registry or an NFT-style contract, not a currency. Do not treat it
 * as a balance and do not try to pay anyone in it.
 */
export const SONG_REGISTRY_ADDRESS = '0x39e8317fEEBE3129f3d876c1F6D35271849797F9' as const;

/**
 * The wallet that owns both contracts above.
 *
 * VERIFIED: this is an ORDINARY WALLET with a private key, not a contract
 * somebody deployed and walked away from. Its code is
 * `0xef010063c0c19a282a1b52b07dd5a65b58948a07dae32b`, and the `0xef0100` prefix
 * is the EIP-7702 delegation designator: an everyday wallet that has been
 * upgraded into a smart account, delegated to
 * 0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B.
 *
 * SO: WHOEVER HOLDS THE SEED PHRASE FOR THIS ADDRESS CONTROLS BOTH CONTRACTS.
 * It has sent 26 transactions, so the key has been in use. Nothing is lost.
 * Import that seed into any wallet and it is reachable again.
 */
export const CONTRACT_OWNER_ADDRESS = '0xF73485A61856Ab07Ad57152151db3ab99dF9a8Ea' as const;

/** Base mainnet. Everything above lives here. */
export const CHAIN_ID = 8453;

/** Human explanations, for anywhere the app has to say why something is refused. */
export const ONCHAIN_NOTES = {
  protocolCreditIsCredit:
    'Your SONGCHAINN credit is a record of what you have done here. It stays yours and cannot be sold or moved.',
} as const;
