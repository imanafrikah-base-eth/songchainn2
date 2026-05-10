# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**SongChainn** (`songchainn.xyz`) is a decentralized music social platform. Users discover and share music, follow artists, interact through posts, and join live audio battle rooms ("WaveWarz BattleZone"). The stack combines a React SPA with Supabase as the backend and LiveKit for real-time WebRTC audio.

## Tech Stack

| Layer | Technology |
|---|---|
| UI | React 18 + TypeScript, Vite 5 |
| Routing | React Router 6 |
| Server state | TanStack Query (React Query 5) |
| Styling | Tailwind CSS 3 + shadcn-ui (Radix UI) |
| Animation | Framer Motion |
| Auth / DB | Supabase (Postgres + Auth + Edge Functions) |
| Real-time audio | LiveKit WebRTC |
| Web3 | Wagmi 2 + Viem + Coinbase OnchainKit |
| Forms | React Hook Form + Zod |
| Testing | Playwright (E2E) |

## Dev Commands

```bash
npm run dev              # Start Vite dev server (localhost:5173)
npm run build            # Production build → dist/
npm run build:dev        # Dev-mode build
npm run lint             # ESLint check
npm run preview          # Preview production build locally
npm run livekit:token    # Start LiveKit token server locally
npm run test:e2e         # Run Playwright E2E tests (headless)
npm run test:e2e:headed  # Run Playwright with browser visible
npm run test:e2e:list    # List available E2E tests
```

## Directory Layout

```
src/
  pages/           # Route-level components (Home, Discover, Social, Room, Profile, Admin…)
  components/      # Reusable UI; social/, wallet/, wavewarz/, ui/ (shadcn primitives)
  context/         # AuthContext, PlayerContext, EngagementContext
  hooks/           # useSocial, useShare, usePopularity, usePlayerContext…
  integrations/
    supabase/      # Typed Supabase client (client.ts) + generated types (types.ts)
  lib/             # Utilities: songRegistry, localDb, web3Config, env, networkCheck
  types/           # database.ts, social.ts
  data/            # Static music data (SONGS, ARTISTS)
api/
  livekit-token.ts # Vercel serverless — mints LiveKit JWT tokens
BattleZone/
  africa-battle-live-ui/  # Standalone Vite sub-project (live battles UI)
supabase/
  functions/       # Edge functions: livekit-token, generate-artwork, moderate-comment, verify-base-signature
  migrations/      # 30+ ordered SQL migrations
e2e/               # Playwright tests
```

## Application Boot Sequence

1. **`src/main.tsx`** — Mounts React root; sets up QueryClient, Web3Provider, ErrorBoundary, chunk-error auto-reload (max 2/min), Supabase fetch retry interceptor, service worker registration
2. **`src/App.tsx`** — Renders `AuthProvider` → checks session → shows Onboarding gate or AppShell with all lazy-loaded routes; subscribes to `global-pulse-effects` Supabase channel
3. **`src/context/AuthContext.tsx`** — Bootstraps Supabase session with an 8-second timeout guard, loads `user_roles` and `audience_profiles`, falls back to IndexedDB cache (`localDb.ts`) when Supabase is unreachable

## Routing

All pages are `lazy()`-imported. Adding a new page: lazy-import in `App.tsx`, add `<Route>`, add to `BottomTabBar` if it belongs in the main nav. Routes at `/room` hide all chrome (full-screen LiveKit). `/wavewarz-africa/*` delegates to the separate BattleZone sub-project.

## State Management

- **Auth / Player / Engagement** — React Context (`useAuth()`, `usePlayerContext()`)
- **Server data** — TanStack Query: 5 min stale, 10 min gc, `refetchOnWindowFocus: false`, retry: 1
- **Real-time** — Supabase channels: `song_analytics` INSERT events drive pulse animations dispatched as `custom:pulse-effect` DOM events

## LiveKit / BattleZone Flow

1. Client requests token from `POST /api/livekit-token` (Vercel serverless)
2. Server validates Supabase JWT via `SUPABASE_SERVICE_ROLE_KEY`, checks `battle_rooms` table for user role (host/co-host/speaker/audience)
3. Server returns a signed LiveKit access token; client connects to `VITE_LIVEKIT_WS_URL`
4. Publish permission granted only to host/co-host/speaker roles
5. In dev, `vite.config.ts` proxies `/api/livekit-token` to the local token server (`npm run livekit:token`)

## Web3

- Wagmi 2 + Base mainnet only; WalletConnect and Coinbase Wallet connectors disabled — injected + EIP-6963 only
- `Web3Provider` (`src/components/Web3Provider.tsx`) mounts client-side only (useEffect guard)
- OnchainKit (Coinbase) is lazy-loaded only on the Marketplace page
- Wallet address flows into `AuthContext`; Base signature verification is handled by the `verify-base-signature` Edge Function

## Supabase

- Client: `src/integrations/supabase/client.ts` — always import from here, never instantiate directly. Has a `localStorage` graceful fallback for private browsing.
- Types: `src/integrations/supabase/types.ts` — regenerate with `supabase gen types typescript --project-id <id>`
- RLS is enabled on all tables; test features with both authenticated and anon sessions
- Key tables: `audience_profiles`, `user_roles`, `liked_songs`, `liked_artists`, `social_posts`, `post_comments`, `song_analytics`, `battle_rooms`, `room_messages`
- Edge functions: `livekit-token`, `generate-artwork`, `moderate-comment`, `verify-base-signature`, `artist-follow-counts`

## Environment Variables

Frontend (need `VITE_` prefix):
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — validated at startup in `src/lib/env.ts` (shows visible error UI if wrong)
- `VITE_LIVEKIT_WS_URL` — WebSocket URL for LiveKit
- `VITE_ONCHAINKIT_API_KEY`, `VITE_ONCHAINKIT_PROJECT_ID` — Coinbase OnchainKit

Server-side (Vercel / Edge Functions, no `VITE_` prefix):
- `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

See `.env.example` for all keys.

## Code Splitting

Vite manual chunks: `vendor-react`, `vendor-web3`, `vendor-livekit`, `vendor-ui`. Chunk size warning at 1 000 KB. `VibeAgent` and `BehaviorCtaPopups` are also lazy-loaded inside the AppShell.

## Coding Conventions

- Tailwind utility classes only — no inline `style={}` unless CSS variables or truly dynamic values
- shadcn-ui primitives for all base UI (Button, Avatar, Sheet, Skeleton, Tabs, etc.)
- All Supabase queries go through `src/integrations/supabase/client.ts`
- New pages: `lazy()`-import in `App.tsx`, add route, add to nav if needed
- No comments unless the *why* is non-obvious

## Social Feed

`src/pages/Social.tsx` — free-scroll feed (no snap). `MusicFeedCard` handles manual play/pause on tap; no autoplay on scroll.

## BattleZone Sub-project

`BattleZone/africa-battle-live-ui/` has its own `package.json` and Vite config. Run it independently or access via `/wavewarz-africa/*` routes in the main app.
