import "./ses-compat";
import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.tsx";
import "./index.css";
import { Web3Provider } from "./components/Web3Provider";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { checkSupabaseReachability } from "./lib/networkCheck";

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

if (typeof window !== "undefined" && import.meta.env.PROD) {
  const AUTO_RELOAD_KEY = "__songchainn_auto_reload_at";
  const AUTO_RELOAD_WINDOW_MS = 30_000;

  const canAutoReload = () => {
    try {
      const last = Number(sessionStorage.getItem(AUTO_RELOAD_KEY) || "0");
      return !last || Date.now() - last > AUTO_RELOAD_WINDOW_MS;
    } catch {
      return true;
    }
  };

  const markAutoReload = () => {
    try {
      sessionStorage.setItem(AUTO_RELOAD_KEY, String(Date.now()));
    } catch {
      void 0;
    }
  };

  const isRecoverableLoadError = (value: unknown) => {
    const message =
      typeof value === "string"
        ? value
        : value && typeof value === "object" && "message" in value
          ? String((value as any).message)
          : "";

    const normalized = message.toLowerCase();
    return (
      normalized.includes("loading chunk") ||
      normalized.includes("chunkloaderror") ||
      normalized.includes("failed to fetch dynamically imported module") ||
      normalized.includes("importing a module script failed") ||
      normalized.includes("error loading dynamically imported module")
    );
  };

  const tryAutoReload = () => {
    if (!canAutoReload()) return;
    markAutoReload();
    const reload = () => window.location.reload();
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      Promise.all([
        navigator.serviceWorker.getRegistrations().then((regs) => Promise.all(regs.map((r) => r.unregister()))),
        typeof caches !== "undefined" && caches.keys ? caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))) : Promise.resolve([]),
      ])
        .catch(() => {})
        .finally(reload);
      return;
    }
    reload();
  };

  window.addEventListener("error", (event) => {
    if (isRecoverableLoadError((event as ErrorEvent).error) || isRecoverableLoadError((event as ErrorEvent).message)) {
      tryAutoReload();
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (isRecoverableLoadError((event as PromiseRejectionEvent).reason)) {
      tryAutoReload();
    }
  });
}

if (typeof window !== "undefined" && typeof window.fetch === "function") {
  const originalFetch = window.fetch.bind(window);

  const neverAbortedSignal = () => new AbortController().signal;

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof Request
          ? input.url
          : input instanceof URL
            ? input.href
            : String(input);

    if (url.includes("pulse.walletconnect.org/batch")) {
      return Promise.resolve(new Response(null, { status: 204 }));
    }

    const isSupabaseRestOrFn =
      url.includes(".supabase.co/rest/v1/") || url.includes(".supabase.co/functions/v1/");
    const isSupabaseAuth = url.includes(".supabase.co/auth/v1/");

    const isSupabaseRequest = isSupabaseRestOrFn || isSupabaseAuth;
    const shouldIgnoreAbortSignal =
      isSupabaseRequest &&
      (typeof init?.signal !== "undefined" ||
        (input instanceof Request && typeof input.signal !== "undefined"));

    const nextInput =
      shouldIgnoreAbortSignal && input instanceof Request
        ? new Request(input, { signal: neverAbortedSignal() })
        : input;
    const nextInit = shouldIgnoreAbortSignal && init?.signal ? { ...init, signal: neverAbortedSignal() } : init;

    const runFetch = () => originalFetch(nextInput, nextInit);

    return runFetch().catch(async (error: any) => {
      const isSupabase = isSupabaseRestOrFn || isSupabaseAuth;
      const message = String(error?.message ?? error ?? "");
      const normalized = message.toLowerCase();
      const isAbortError =
        error?.name === "AbortError" ||
        normalized.includes("abort") ||
        normalized.includes("aborted");
      const isFetchFailed =
        normalized.includes("failed to fetch") ||
        normalized.includes("network changed") ||
        normalized.includes("http2") ||
        normalized.includes("timed out") ||
        normalized.includes("timeout") ||
        normalized.includes("name not resolved") ||
        normalized.includes("dns");

      const shouldRetrySupabase =
        isSupabase &&
        (isAbortError || isFetchFailed);

      if (shouldRetrySupabase) {
        try {
          // Retry once to smooth over transient browser/network transport failures.
          return await runFetch();
        } catch {
          // Fall through to suppressed response below.
        }
      }

      if (isSupabase && isAbortError) {
        return new Response(null, { status: 499, statusText: "Client Abort Suppressed" });
      }

      if (isSupabase && isFetchFailed) {
        return new Response(JSON.stringify({ error: "network_error", message }), {
          status: 503,
          statusText: "Supabase network error suppressed",
          headers: { "Content-Type": "application/json" },
        });
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

if ("serviceWorker" in navigator && import.meta.env.PROD && import.meta.env.VITE_ENABLE_SERVICE_WORKER === "true") {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Web3Provider>
          <App />
        </Web3Provider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
