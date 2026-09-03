# Empire Builder launch scripts

Launches an artist token (Clanker v4) plus its Empire treasury (SmartVault) on Base, then prints the exact commands to wire the token into the SONGCHAINN world-gate. Built against the Empire Builder skill docs (`~/.claude/skills/empire-builder/`).

This is the repeatable template for every artist: one config file per artist, same script.

## One-time setup

```bash
cd scripts/empire-builder
npm install          # pinned: clanker-sdk@4.2.16, viem@2.48.0
```

## Per launch

1. Fill the artist's config (see `iman.config.json`) — every `PLACEHOLDER` must be replaced. Get the token image hosted somewhere permanent first.
2. Get an Empire Builder API key (empirebuilder.world).
3. The artist's deployer wallet needs a little ETH on Base for gas. That wallet becomes `owner()` of the token AND the treasury vault — it must be a wallet the artist controls and keeps safe.

```powershell
$env:EMPIRE_API_KEY = "..."
$env:DEPLOYER_PRIVATE_KEY = "0x..."   # artist's deployer wallet

# Dry run: fetches + prints the server-built tokenConfig, deploys NOTHING
node launch-empire.mjs iman.config.json

# Review the printed config with the artist, then go live (REAL funds, Base mainnet):
node launch-empire.mjs iman.config.json --yes
```

## What the script does

1. `POST /api/get-token-config` — Empire Builder builds the Clanker v4 token config (vault %, fees, LP, optional airdrop).
2. Clanker SDK deploys the token on Base — the deployer wallet signs and pays gas. Empire-wired deploys route 20% of LP trading fees to the Empire wallet, so the treasury funds itself from trading volume.
3. `POST /api/deploy-empire` — registers the Empire, deploys SmartVault treasuries on Base + Arbitrum.
4. If an airdrop was enabled, `POST /api/store-airdrop` persists the recipient tree (required for fans to claim).
5. Prints the token address, vault address, and the `supabase secrets set` commands that flip the artist's World from pre-launch to live.

## Safety notes

- **Mainnet only.** There is no Empire Builder testnet. The dry run is the only rehearsal.
- Rate limit: 2 empire deployments per wallet per 24h.
- Never commit private keys. The script only reads them from env vars.
- Airdrop entries lock at deploy time; `lockupDays` must be at least 1.

## Adding the next artist

Copy `iman.config.json` to `<artist>.config.json`, update every field, add a `launch:<artist>` script to `package.json`, and repeat. Also add the artist's world entry to `WORLD_TOKENS` in `supabase/functions/world-gate/index.ts` and the client registry in `src/worlds/registry.ts` (each world reads its own `<ARTIST>_TOKEN_ADDRESS` secret).
