# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout

This is a monorepo-style workspace. The git working tree is rooted at `$ONGCHAINN/` but the git directory lives inside `BattleZone/`. Two distinct apps share the same Supabase backend:

| Path | App | Purpose |
|---|---|---|
| `src/` | **SONGCHAINN** | Main PWA — music streaming, social feed, marketplace |
| `src/battlezone/` | BattleZone (embedded) | WaveWarz Africa sub-app served at `/wavewarz-africa/*` inside the main app |
| `BattleZone/africa-battle-live-ui/` | **BattleZone standalone** | Separate Vite app for hosting/spectating live battles (own git repo) |
| `supabase/` | Shared backend | Edge Functions + migrations used by both apps |

## Commands — Main App (`$ONGCHAINN/`)

```bash
npm run dev          # dev server at http://localhost:5173
npm run build        # tsc type-check + vite build
npm run build:dev    # vite build in development mode
npm run lint         # eslint
npm run preview      # serve dist/

# E2E tests (Playwright, requires built/running app)
npm run test:e2e
npm run test:e2e:headed
npm run test:e2e:list
```

## Commands — BattleZone Standalone (`BattleZone/africa-battle-live-ui/`)

```bash
npm run dev          # vite dev server
npm run build        # vite build (no tsc check)
npm run test         # vitest run (unit tests, jsdom)
npm run test:watch   # vitest watch
npm run lint         # eslint
```

## Environment Variables

Copy `.env.example` to `.env.local` for local development. Required variables:

```
VITE_SUPABASE_URL=https://nztccconvwmxpoyjwkrf.supabase.co
VITE_SUPABASE_ANON_KEY=<JWT anon key — must start with eyJ, NOT sb_publishable_...>
VITE_LIVEKIT_WS_URL=wss://voice.songchainn.xyz
VITE_LIVEKIT_TOKEN_ENDPOINT=http://127.0.0.1:7880/token
```

Server-side (Vercel / Supabase Edge Function secrets — no `VITE_` prefix):
```
LIVEKIT_API_KEY, LIVEKIT_SECRET, LIVEKIT_URL, SUPABASE_SERVICE_ROLE_KEY
```

`src/lib/env.ts` validates env at startup and renders a full-screen error overlay in the browser if Supabase URL/key are missing or mismatched — check the browser console first when the app fails to load.

## Architecture — Main App

**Providers (root → leaf order in `App.tsx`):**
`BrowserRouter` → `AuthProvider` → `FarcasterProvider` → `FacebookProvider` → `TooltipProvider` → `AppContent`

Inside an authenticated session: `OfflineQueueProvider` → `PlayerProvider` → `EngagementProvider` → `AppShell`

**Routing:** All pages are lazy-loaded. Auth state gates the route tree:
- Unauthenticated: public routes render, auth-required routes redirect to `<Auth />`
- Onboarding incomplete: `<Onboarding />` renders instead of the full shell
- Authenticated: `<AppShell />` renders with `<BottomTabBar />`, `<VibeAgent />`, `<BehaviorCtaPopups />`
- Vanity slug routes (`/:artistSlug/:songSlug`) are last and resolved by `<SlugResolver />`

**Context/State:**
- `AuthContext` — Supabase session + synthetic identities for Farcaster (`fc-` prefix) and Facebook (`fb-` prefix) users stored in `localStorage`. Three auth paths: email, wallet (SIWE via `src/lib/baseWallet.ts`), Farcaster mini-app.
- `PlayerContext` — Audio playback split into three sub-contexts (`PlayerStateCtx`, `PlayerTimeCtx`, `PlayerActionsCtx`) to minimize re-renders. Manages queue, crossfade, room mode (LiveKit), shuffle/repeat.
- `EngagementContext` — Tracks engagement events (pulses, listens) and batches analytics writes.
- `OfflineQueueProvider` — Queues mutations when offline and flushes on reconnect.

**Data layer:** TanStack Query wraps all Supabase reads. Writes go through hooks in `src/hooks/`. Direct Supabase calls use `src/integrations/supabase/client.ts`. The client gracefully falls back to in-memory storage when `localStorage` is unavailable (private browsing / restricted webviews).

**PWA / offline:** `useOfflineAudio.ts` caches audio, `src/lib/localDb.ts` is an in-browser SQLite-style store for offline-first profile and playlist data.

**Realtime:** Global pulse animations are triggered by Supabase Realtime subscriptions on `song_analytics` inserts (event_type = 'pulse') — see `AppShell` in `App.tsx`.

**Vite build:** All `node_modules` are bundled into a single `vendor` chunk. Splitting was attempted but caused React `forwardRef` errors in production (chunk load order). Do not attempt chunk splitting without verifying React + react-dom + scheduler co-locate in the same chunk.

## Architecture — BattleZone (`src/battlezone/` and `BattleZone/africa-battle-live-ui/`)

The embedded (`src/battlezone/`) and standalone versions share the same structure and Supabase schema. They differ only in routing (standalone has its own `BrowserRouter`) and auth (standalone has its own `AuthContext` in `src/battlezone/contexts/`).

Key modules:
- `src/battlezone/lib/livekit.ts` — LiveKit token fetch and room management
- `src/battlezone/lib/songchain.ts` — Reads `audience_profiles` to verify SONGCHAINN membership
- `src/battlezone/hooks/useBattles.ts` — Battle CRUD via Supabase
- `src/battlezone/hooks/useHostAudio.ts` — Host-side microphone/LiveKit audio

**Embed mode:** `EmbedModeContext` detects whether the app is running inside an iframe (the main SONGCHAINN app embeds Results at `/wavewarz-africa/results`). In embed mode, navigation and the top bar are suppressed.

## Supabase Edge Functions (`supabase/functions/`)

| Function | Purpose |
|---|---|
| `livekit-token` | Issues LiveKit JWT for room participants |
| `wallet-auth` | Verifies SIWE signature, returns Supabase JWT |
| `farcaster-auth` | Verifies Farcaster frame signature |
| `facebook-auth` | Exchanges Facebook token, upserts profile |
| `generate-artwork` | AI artwork generation |
| `moderate-comment` | Comment moderation |
| `artist-follow-counts` | Aggregates follow counts |
| `verify-base-signature` | Verifies Base chain signatures |

Deploy with `supabase functions deploy <name>`.

## Path Aliases

`@` resolves to `src/` in both the main app and `africa-battle-live-ui`. Inside `src/battlezone/`, imports use `@/battlezone/` as the prefix (e.g., `@/battlezone/components/ui/button`).

## Deployment

Deployed to Vercel. `vercel.json` at repo root configures:
- SPA fallback rewrite (all non-asset paths → `index.html`)
- OG image API rewrites: `/share/:id` → `/api/song-og`, `/share/artist/:id` → `/api/artist-og`
- Long-lived cache headers for `/assets/` (hashed filenames, 1 year)
