import { useEffect, useState, useCallback } from 'react';

declare global {
  interface Window {
    FB: any;
    fbAsyncInit: () => void;
  }
}

export interface FacebookUser {
  id: string;
  name: string;
  email?: string;
  picture_url?: string;
  access_token: string;
}

interface FacebookState {
  isSDKLoaded: boolean;
  isConnected: boolean;
  fbUser: FacebookUser | null;
}

const FB_APP_ID = (import.meta as any).env?.VITE_FACEBOOK_APP_ID as string | undefined;

// Module-level flags so multiple hook instances share SDK loading state.
let sdkLoading = false;
let sdkLoaded = false;
const sdkReadyCallbacks: (() => void)[] = [];

function loadFbSdk(appId: string): Promise<void> {
  if (sdkLoaded) return Promise.resolve();
  if (sdkLoading) {
    return new Promise((resolve) => { sdkReadyCallbacks.push(resolve); });
  }

  sdkLoading = true;
  return new Promise((resolve) => {
    window.fbAsyncInit = () => {
      window.FB.init({ appId, cookie: true, xfbml: false, version: 'v20.0' });
      sdkLoaded = true;
      resolve();
      sdkReadyCallbacks.forEach((cb) => cb());
      sdkReadyCallbacks.length = 0;
    };

    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  });
}

async function fetchFbProfile(accessToken: string): Promise<FacebookUser | null> {
  return new Promise((resolve) => {
    window.FB.api(
      '/me',
      { fields: 'id,name,email,picture.type(large)', access_token: accessToken },
      (res: any) => {
        if (!res || res.error || !res.id) { resolve(null); return; }
        resolve({
          id: res.id,
          name: res.name,
          email: res.email,
          picture_url: res.picture?.data?.url,
          access_token: accessToken,
        });
      },
    );
  });
}

export function useFacebook(): FacebookState & { login: () => Promise<FacebookUser | null> } {
  const [state, setState] = useState<FacebookState>({
    isSDKLoaded: false,
    isConnected: false,
    fbUser: null,
  });

  useEffect(() => {
    if (!FB_APP_ID) return;
    let cancelled = false;

    async function init() {
      try {
        await loadFbSdk(FB_APP_ID!);
        if (cancelled) return;
        setState((s) => ({ ...s, isSDKLoaded: true }));

        window.FB.getLoginStatus(async (response: any) => {
          if (cancelled) return;
          if (response.status === 'connected') {
            const profile = await fetchFbProfile(response.authResponse.accessToken);
            if (!cancelled && profile) {
              setState({ isSDKLoaded: true, isConnected: true, fbUser: profile });
            }
          }
        });
      } catch {
        // FB SDK load failed — silently disabled
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (): Promise<FacebookUser | null> => {
    if (!window.FB) return null;
    return new Promise((resolve) => {
      window.FB.login(async (response: any) => {
        if (response.status === 'connected') {
          const profile = await fetchFbProfile(response.authResponse.accessToken);
          if (profile) setState({ isSDKLoaded: true, isConnected: true, fbUser: profile });
          resolve(profile);
        } else {
          resolve(null);
        }
      }, { scope: 'public_profile,email' });
    });
  }, []);

  return { ...state, login };
}
