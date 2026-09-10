"use client";
import "./ses-compat";
import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SpeedInsights } from "@vercel/speed-insights/react";
import App from "./App.tsx";
import "./index.css";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { checkSupabaseReachability } from "./lib/networkCheck";
import { shouldRegisterServiceWorker } from "./lib/native";
import { initNativeShell } from "./lib/nativeShell";
import { installImageFallback } from "./lib/imageFallback";
import { installStorageShim } from "./lib/storageShim";
import { capturePendingReferralCode } from "./hooks/useReferrals";
import { installLoadErrorRecovery } from "./lib/chunkRecovery";
import { installMediaProtection, restoreReturnPath } from "./lib/deviceGuards";

// FIRST, ahead of every other line in this file.
//
// Where storage is blocked, reading window.localStorage throws rather than
// returning null, and inside an embedded frame (a Farcaster mini app, an in-app
// browser) that took the whole app down to the error boundary before a single
// pixel rendered. Anything below this line may touch storage freely.
installStorageShim();

// Before anything renders, so no image can ever paint the browser's
// broken-image glyph. See src/lib/imageFallback.ts.
installImageFallback();

// Stash ?ref=CODE before anything can navigate it away, so an invite survives
// the whole sign-up round trip and is redeemed once there is a session.
capturePendingReferralCode();

// Back to the page a wallet app took the person away from, before the router
// reads the address; and the ordinary doors to saving an artist's media, shut.
restoreReturnPath();
installMediaProtection();


declare global {
  interface Window {
    __songchainnDeferredInstallPrompt?: any;
  }
}

// Shared query client for wagmi and app
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

if (import.meta.env.DEV) {
  checkSupabaseReachability();
}

// Stale-build recovery for chunk failures that escape React. The lazy routes
// and the error boundary use the same helper, see src/lib/chunkRecovery.ts.
installLoadErrorRecovery();

if (typeof window !== "undefined" && typeof window.fetch === "function") {
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof Request
          ? input.url
          : input instanceof URL
            ? input.href
            : String(input);

    // Silence noisy WalletConnect telemetry pings
    if (url.includes("pulse.walletconnect.org/batch")) {
      return Promise.resolve(new Response(null, { status: 204 }));
    }

    const isSupabase =
      url.includes(".supabase.co/rest/v1/") ||
      url.includes(".supabase.co/functions/v1/") ||
      url.includes(".supabase.co/auth/v1/");

    const runFetch = () => originalFetch(input, init);

    if (!isSupabase) return runFetch();

    // Single retry for transient network failures; real errors propagate to callers
    return runFetch().catch(async (error: any) => {
      const message = String(error?.message ?? error ?? "").toLowerCase();
      const isTransient =
        error?.name !== "AbortError" &&
        (message.includes("failed to fetch") ||
          message.includes("network changed") ||
          message.includes("http2") ||
          message.includes("timeout") ||
          message.includes("name not resolved"));

      if (isTransient) {
        return runFetch();
      }
      throw error;
    });
  };
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e: any) => {
    e.preventDefault();
    window.__songchainnDeferredInstallPrompt = e;
    window.dispatchEvent(new Event("pwa:installprompt"));
  });

  window.addEventListener("appinstalled", () => {
    window.__songchainnDeferredInstallPrompt = null;
    window.dispatchEvent(new Event("pwa:appinstalled"));
  });
}

if ("serviceWorker" in navigator && import.meta.env.PROD && shouldRegisterServiceWorker()) {
  // Capture the controller that was active before registration so we can tell
  // the difference between a fresh install (no prior controller) and an upgrade.
  const existingController = navigator.serviceWorker.controller;

  navigator.serviceWorker.register("/sw.js").then((registration) => {
    // Whenever the tab becomes visible, ask the browser to check for a new SW.
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) registration.update().catch((err) => { if (import.meta.env.DEV) console.warn('[sw-update]', err); });
    });
  }).catch((err) => { if (import.meta.env.DEV) console.warn('[sw-register]', err); });

  // When a new SW finishes activating and claims this client, reload once so
  // the page runs the latest bundles. Guard against looping on fresh install
  // (existingController is null when there was no previous SW).
  let swRefreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (swRefreshing || !existingController) return;
    swRefreshing = true;
    window.location.reload();
  });
}

// Native-only: splash, status bar, back button, external links, deep links.
// No-op in the browser.
void initNativeShell();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
        <SpeedInsights />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
