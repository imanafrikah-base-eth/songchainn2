import { createContext, useContext, useEffect, useRef, ReactNode } from 'react';
import { useFacebook, FacebookUser } from '@/hooks/useFacebook';
import { useAuth } from '@/context/AuthContext';

interface FacebookContextType {
  isConnected: boolean;
  isSDKLoaded: boolean;
  fbUser: FacebookUser | null;
  login: () => Promise<FacebookUser | null>;
}

const FacebookContext = createContext<FacebookContextType>({
  isConnected: false,
  isSDKLoaded: false,
  fbUser: null,
  login: async () => null,
});

export function FacebookProvider({ children }: { children: ReactNode }) {
  const { isConnected, isSDKLoaded, fbUser, login } = useFacebook();
  const { user, signInWithFacebook } = useAuth();
  const signedInRef = useRef(false);

  // Auto-sign in when FB SDK detects an existing authorized session.
  // Mirrors the Farcaster mini-app auto-sign-in pattern but without blocking
  // the app — Facebook auth runs silently in the background.
  useEffect(() => {
    const hasRealSession = user && !user.id?.startsWith('fb-');
    if (!isConnected || !fbUser || hasRealSession || signedInRef.current) return;
    signedInRef.current = true;

    void signInWithFacebook(fbUser).then((result) => {
      if (result?.error) signedInRef.current = false;
    });
  }, [isConnected, fbUser, user, signInWithFacebook]);

  return (
    <FacebookContext.Provider value={{ isConnected, isSDKLoaded, fbUser, login }}>
      {children}
    </FacebookContext.Provider>
  );
}

export function useFacebookContext(): FacebookContextType {
  return useContext(FacebookContext);
}
