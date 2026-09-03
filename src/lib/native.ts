// Native-shell detection.
//
// The same bundle runs in three places: the browser PWA, the Farcaster mini
// app, and the Capacitor Android shell. A few behaviours have to differ in the
// native shell, so everything that branches on it goes through here rather than
// sniffing the user agent at the call site.

import { Capacitor } from '@capacitor/core';

/** True inside the Capacitor Android/iOS shell, false in any browser. */
export const isNativeApp = (): boolean => Capacitor.isNativePlatform();

/** 'android' | 'ios' | 'web' */
export const nativePlatform = (): string => Capacitor.getPlatform();

export const isAndroidApp = (): boolean => Capacitor.getPlatform() === 'android';

/**
 * In the native shell the web assets ship inside the APK and are served from
 * https://localhost, so there is no deploy to detect and nothing useful to
 * pre-cache. Registering the service worker there would cache local files,
 * and its controllerchange reload could fight the WebView on cold start.
 * Updates arrive through the Play Store instead.
 */
export const shouldRegisterServiceWorker = (): boolean => !isNativeApp();
