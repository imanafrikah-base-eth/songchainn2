import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate, type To } from "react-router-dom";

const EMBED_QUERY_KEY = "embed";
const EMBED_QUERY_VALUE = "1";
const EMBED_SESSION_KEY = "battlezone:embedded";
const BASE_PATH = "/wavewarz-africa";

interface EmbedModeContextType {
  isEmbedded: boolean;
  embedTo: (to: To) => To;
  openStandalone: (path?: string) => void;
}

const EmbedModeContext = createContext<EmbedModeContextType>({
  isEmbedded: false,
  embedTo: (to) => to,
  openStandalone: () => {},
});

const withBasePath = (path: string) => {
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith(BASE_PATH)) return path;
  if (path === "/") return BASE_PATH;
  if (path.startsWith("/")) return `${BASE_PATH}${path}`;
  return path;
};

const addEmbedSearchParam = (search: string) => {
  const params = new URLSearchParams(search);
  params.set(EMBED_QUERY_KEY, EMBED_QUERY_VALUE);
  const next = params.toString();
  return next ? `?${next}` : "";
};

const toEmbeddedTarget = (to: To): To => {
  if (typeof to === "string") {
    if (/^https?:\/\//i.test(to)) return to;
    const scoped = withBasePath(to);
    const hashIndex = scoped.indexOf("#");
    const hash = hashIndex >= 0 ? scoped.slice(hashIndex) : "";
    const withoutHash = hashIndex >= 0 ? scoped.slice(0, hashIndex) : scoped;
    const queryIndex = withoutHash.indexOf("?");
    const pathname = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
    const search = queryIndex >= 0 ? withoutHash.slice(queryIndex) : "";
    return `${pathname}${addEmbedSearchParam(search)}${hash}`;
  }

  const nextPathname = typeof to.pathname === "string" ? withBasePath(to.pathname) : to.pathname;
  return {
    ...to,
    pathname: nextPathname,
    search: addEmbedSearchParam(to.search ?? ""),
  };
};

export const EmbedModeProvider = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [sessionEmbedded, setSessionEmbedded] = useState(() => sessionStorage.getItem(EMBED_SESSION_KEY) === "1");

  const hasEmbedQuery = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get(EMBED_QUERY_KEY) === EMBED_QUERY_VALUE;
  }, [location.search]);

  useEffect(() => {
    if (hasEmbedQuery) {
      sessionStorage.setItem(EMBED_SESSION_KEY, "1");
      if (!sessionEmbedded) setSessionEmbedded(true);
      return;
    }

    if (sessionEmbedded) {
      const params = new URLSearchParams(location.search);
      params.set(EMBED_QUERY_KEY, EMBED_QUERY_VALUE);
      navigate(
        {
          pathname: location.pathname,
          search: `?${params.toString()}`,
          hash: location.hash,
        },
        { replace: true },
      );
    }
  }, [hasEmbedQuery, location.hash, location.pathname, location.search, navigate, sessionEmbedded]);

  const isEmbedded = hasEmbedQuery || sessionEmbedded;

  const value = useMemo<EmbedModeContextType>(
    () => ({
      isEmbedded,
      embedTo: (to: To) => (isEmbedded ? toEmbeddedTarget(to) : to),
      openStandalone: (path?: string) => {
        sessionStorage.removeItem(EMBED_SESSION_KEY);
        setSessionEmbedded(false);
        const targetPath = withBasePath(path ?? `${location.pathname}${location.search}${location.hash}`);
        const url = new URL(targetPath, window.location.origin);
        url.searchParams.delete(EMBED_QUERY_KEY);
        window.location.href = url.toString();
      },
    }),
    [isEmbedded, location.hash, location.pathname, location.search],
  );

  return <EmbedModeContext.Provider value={value}>{children}</EmbedModeContext.Provider>;
};

export const useEmbedMode = () => useContext(EmbedModeContext);
