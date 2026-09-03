import type { CapacitorConfig } from '@capacitor/cli';

// Native shell config for the SONGCHAINN Android app.
//
// The web build in dist/ is bundled into the APK and served locally, so the app
// opens instantly and works offline. Network calls still go to Supabase / R2.
//
// appId is PERMANENT. Google Play keys the listing on it and it can never be
// changed after the first upload. Do not edit it.
const config: CapacitorConfig = {
  appId: 'xyz.songchainn.app',
  appName: '$ongChainn',
  webDir: 'dist',

  server: {
    // Serve bundled assets from https://localhost rather than file://. This is a
    // secure context, which the app needs for localStorage persistence, the
    // Web Crypto calls in the wallet/SIWE path, and MediaSession.
    androidScheme: 'https',
  },

  android: {
    // Never allow http:// subresources into the https://localhost origin.
    allowMixedContent: false,
    // Hardware-accelerated WebView; needed for smooth Framer Motion transitions.
    webContentsDebuggingEnabled: false,
    appendUserAgent: 'SongchainnAndroid/1.0',
  },

  plugins: {
    SplashScreen: {
      // The web app paints its own loading state, so hand off quickly.
      launchShowDuration: 800,
      launchAutoHide: false, // hidden manually once React mounts
      backgroundColor: '#0A0A0F',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
    StatusBar: {
      style: 'DARK', // dark background, light content
      backgroundColor: '#0A0A0F',
      overlaysWebView: false,
    },
  },
};

export default config;
