/**
 * Every SONGCHAINN artist's Zora Creator Coin.
 *
 * A SONGCHAINN artist coin IS a Zora Creator Coin. We do not deploy it and we
 * do not own it: it belongs to the artist, on their own Zora profile, and this
 * file only records where to find it. That is the point. An artist whose coin
 * lives on our contract is an artist who depends on us, which is the exact
 * arrangement this platform exists to replace.
 *
 * VERIFIED 1 Sep 2026 by reading each profile off the Zora API with
 * `scripts/artist-zora-profiles.mjs`. Handles were confirmed by IMan directly,
 * which matters: guessing handles from artist names found real coins belonging
 * to STRANGERS (a `@prp` and a `@sanchy` that are not ours). Never add a row
 * here from a guess. Only from a link the artist gave us.
 *
 * Re-run the script to refresh market caps; they move.
 */

export interface ArtistCoin {
  /** Artist id as used in `musicData.ts` and across the app. */
  artistId: string;
  name: string;
  /** Their Zora profile handle, without the @. */
  zoraHandle: string;
  /** The creator coin contract on Base. This is the artist coin. */
  coinAddress: string;
  /** The wallet published on their Zora profile. */
  wallet: string;
  /**
   * WHERE ROYALTIES MUST BE SENT.
   *
   * Read from each creator coin's own `payoutRecipientAddress` on 1 Sep 2026,
   * which is the address Zora already pays them at. For six of the seven this
   * is identical to the profile wallet. For IMan it is NOT, and using the
   * profile wallet for him would send his song earnings somewhere his own coin
   * does not pay. Always route song royalties here, never to `wallet`.
   */
  payoutAddress: string;
  /** Market cap in USD when last read. Indicative only, it moves. */
  marketCapUsdAt20260901: number;
}

export const ARTIST_COINS: ArtistCoin[] = [
  {
    artistId: '3',
    name: 'IMan Afrikah',
    zoraHandle: 'imanafrikah',
    coinAddress: '0x46bd92b482e506ecacffd4e485f3b50a4828deb7',
    wallet: '0xeec7a1c2e0452a099cbb423b24c713b414df6355',
    payoutAddress: '0x5b4613a4deeadc0a8cc8540e35c0c65e52645433',
    marketCapUsdAt20260901: 4874,
  },
  {
    artistId: '4',
    name: 'NDA',
    zoraHandle: 'nda63',
    coinAddress: '0xd95f5343ddd180e560dcdf165c39d2e904da3d8f',
    wallet: '0x88498a8ea0163972e0bb75ba7587a0ebe335b5c7',
    payoutAddress: '0x88498a8ea0163972e0bb75ba7587a0ebe335b5c7',
    marketCapUsdAt20260901: 4846,
  },
  {
    artistId: '7',
    name: 'Santana',
    zoraHandle: 'santanaunofficial',
    coinAddress: '0xedbad33620e105d499cbe97a00c0deee252064b6',
    wallet: '0xbdde9e54fef1e1eb79750063bd62b0c125510566',
    payoutAddress: '0xbdde9e54fef1e1eb79750063bd62b0c125510566',
    marketCapUsdAt20260901: 2406,
  },
  {
    artistId: '1',
    name: '7ROO7H BASED',
    zoraHandle: '7roo7h',
    coinAddress: '0x846ddf7f47b3c65e73b24db75fb4211f5f1df3b5',
    wallet: '0x736c327b72adf696ed4ec5d584dbb262aaffe639',
    payoutAddress: '0x736c327b72adf696ed4ec5d584dbb262aaffe639',
    marketCapUsdAt20260901: 1410,
  },
  {
    artistId: '2',
    name: 'DenaJah',
    zoraHandle: 'denaja_7',
    coinAddress: '0x0f2a0e134a19f53d266b976fd2fae370ac832d13',
    wallet: '0xe17e7b33a5929851c364843fcbb18816a88d187b',
    payoutAddress: '0xe17e7b33a5929851c364843fcbb18816a88d187b',
    marketCapUsdAt20260901: 6636,
  },
  {
    artistId: '6',
    name: 'Sanchy',
    zoraHandle: 'sanchella',
    coinAddress: '0xc8b3b18f1c51bdcab4b7e971e093780bd074e9fd',
    wallet: '0x50127accd3c59a03d90b32f098b389e85ffccefc',
    payoutAddress: '0x50127accd3c59a03d90b32f098b389e85ffccefc',
    marketCapUsdAt20260901: 5277,
  },
  {
    artistId: '5',
    name: 'PRP',
    zoraHandle: 'purpose_prp',
    coinAddress: '0x7dc287ab5512524a4814786db339ea5b89fbbf70',
    wallet: '0x9a61c15677f23997bf7156b3ad9f1f7476ae6a29',
    payoutAddress: '0x9a61c15677f23997bf7156b3ad9f1f7476ae6a29',
    marketCapUsdAt20260901: 1252,
  },
  {
    // Added 12 Sep 2026, and NOT from a guessed handle. The handle came from
    // her own profile row (audience_profiles.zora_handle = 'n3m3siss'), and the
    // wallet Zora publishes on it, 0xdd2c9b0c..., is byte for byte the address
    // Ernest supplied for her on 31 Aug and which already sits in
    // artist_wallets. Two independent records agreeing is what makes this a
    // confirmation rather than the kind of guess that found strangers' coins.
    artistId: '11',
    name: 'N3M3SIS',
    zoraHandle: 'n3m3siss',
    coinAddress: '0x6e07337a8e89514abfa38ba0e1c7d02a1ced04c2',
    wallet: '0xdd2c9b0c159d56aea6ccccb45bebf5b371e468b7',
    payoutAddress: '0xdd2c9b0c159d56aea6ccccb45bebf5b371e468b7',
    marketCapUsdAt20260901: 8153,
  },
];

/**
 * The SONGCHAINN account itself, which holds the catalog. Not an artist, so it
 * is kept out of ARTIST_COINS and will never appear in an artist listing.
 */
export const SONGCHAINN_ZORA = {
  zoraHandle: 'songchainn',
  coinAddress: '0x757097a2720001f92e7a4e0f6b2ac3e8e6200fd9',
  wallet: '0xbbb71df935ac501ca9ea8afdcfa7ab09ba898ac6',
} as const;

/**
 * Artists on the roster with no coin recorded yet: FAITH (8), JMN (9),
 * SAMMIE (10). They are not missing, they simply have not sent a profile link.
 * Ask, then add a row. Do not guess a handle.
 */
export const ARTISTS_AWAITING_COIN = ['8', '9', '10'] as const;

const BY_ARTIST_ID = new Map(ARTIST_COINS.map((a) => [a.artistId, a]));
const BY_HANDLE = new Map(ARTIST_COINS.map((a) => [a.zoraHandle.toLowerCase(), a]));

export function getArtistCoin(artistId: string): ArtistCoin | null {
  return BY_ARTIST_ID.get(artistId) ?? null;
}

export function getArtistCoinByHandle(handle: string): ArtistCoin | null {
  return BY_HANDLE.get(handle.replace(/^@/, '').toLowerCase()) ?? null;
}

/** Whether this artist has a coin that a world could be gated on. */
export function artistHasCoin(artistId: string): boolean {
  return BY_ARTIST_ID.has(artistId);
}

/**
 * Where a person goes to buy a creator coin: its page on Zora, on Base.
 *
 * This is the ONLY place a "get the key" link may come from. A world's key is
 * the artist's creator coin and the gate checks that exact contract, so the
 * link a visitor is handed has to buy that exact contract too. A link to any
 * other token, however similar its name, sells a key that fits no door.
 */
export function zoraCoinUrl(coinAddress: string): string {
  return `https://zora.co/coin/base:${coinAddress.toLowerCase()}`;
}

/** The buy link for an artist's world key, or null when they have no coin yet. */
export function worldKeyUrlFor(artistId: string): string | null {
  const coin = BY_ARTIST_ID.get(artistId);
  return coin ? zoraCoinUrl(coin.coinAddress) : null;
}

/** Find the artist behind a coin address, for attributing a trade or a holding. */
export function getArtistByCoinAddress(coinAddress: string): ArtistCoin | null {
  const needle = coinAddress.toLowerCase();
  return ARTIST_COINS.find((a) => a.coinAddress.toLowerCase() === needle) ?? null;
}
