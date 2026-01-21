import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.tsx";
import "./index.css";
import { Web3Provider } from "./components/Web3Provider";

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

if (typeof window !== "undefined") {
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

    const shouldIgnoreAbortSignal =
      typeof init?.signal !== "undefined" && (isSupabaseRestOrFn || isSupabaseAuth);

    const nextInit = shouldIgnoreAbortSignal ? { ...init, signal: undefined } : init;
    return originalFetch(input, nextInit).catch((error: any) => {
      const isSupabase = isSupabaseRestOrFn || isSupabaseAuth;
      const message = String(error?.message ?? error ?? "");
      const isAbortError =
        error?.name === "AbortError" ||
        message.toLowerCase().includes("abort") ||
        message.toLowerCase().includes("aborted");
      const isFetchFailed = message.toLowerCase().includes("failed to fetch");

      if (isSupabase && isAbortError) {
        return new Response(null, { status: 499, statusText: "Client Abort Suppressed" });
      }

      if (isSupabaseAuth && isFetchFailed) {
        return new Response(JSON.stringify({ error: "network_error", message }), {
          status: 503,
          statusText: "Supabase auth network error suppressed",
          headers: { "Content-Type": "application/json" },
        });
      }

      throw error;
    });
  };
}

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
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

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Web3Provider>
        <App />
      </Web3Provider>
    </QueryClientProvider>
  </React.StrictMode>
);
