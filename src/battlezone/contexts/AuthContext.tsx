import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/battlezone/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface AudienceProfile {
  id: string;
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  onboarding_completed: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: AudienceProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

const clearAuthParamsFromUrl = () => {
  const url = new URL(window.location.href);
  const searchKeysToClear = [
    "code",
    "state",
    "access_token",
    "refresh_token",
    "songchain_access_token",
    "songchain_refresh_token",
  ];
  searchKeysToClear.forEach((key) => url.searchParams.delete(key));
  url.hash = "";
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
};

const getTokenFromSearchOrHash = (key: string) => {
  const url = new URL(window.location.href);
  const searchValue = url.searchParams.get(key);
  if (searchValue) return searchValue;

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return hashParams.get(key);
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AudienceProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from("audience_profiles")
      .select("*")
      .eq("user_id", userId)
      .eq("onboarding_completed", true)
      .maybeSingle();
    setProfile(data as AudienceProfile | null);
  };

  useEffect(() => {
    const hydrateSessionFromAuthCallback = async () => {
      const code = new URL(window.location.href).searchParams.get("code");
      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
        clearAuthParamsFromUrl();
        return;
      }

      const accessToken =
        getTokenFromSearchOrHash("songchain_access_token") ||
        getTokenFromSearchOrHash("access_token");
      const refreshToken =
        getTokenFromSearchOrHash("songchain_refresh_token") ||
        getTokenFromSearchOrHash("refresh_token");

      if (accessToken && refreshToken) {
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        clearAuthParamsFromUrl();
      }
    };

    // Set up listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          // Use setTimeout to avoid deadlock with Supabase auth
          setTimeout(() => fetchProfile(session.user.id), 0);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    // Then hydrate callback session and check existing session
    hydrateSessionFromAuthCallback()
      .catch(() => {
        // Ignore callback hydration failures; regular session lookup still works.
      })
      .finally(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
          setSession(session);
          setUser(session?.user ?? null);
          if (session?.user) {
            fetchProfile(session.user.id);
          }
          setLoading(false);
        });
      });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
