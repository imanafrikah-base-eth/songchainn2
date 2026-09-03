# SONGCHAINN for Android

The Android app is the same React bundle as the web PWA, wrapped in a
[Capacitor](https://capacitorjs.com) native shell. The web assets ship inside
the package, so the app opens instantly and works offline; everything dynamic
still comes from Supabase and R2.

- **Package (permanent):** `xyz.songchainn.app`
- **Version:** `versionName 1.0`, `versionCode 1`
- **minSdk 23** (Android 6.0), **targetSdk 35**
- **Launcher label:** `$ongChainn`

---

## Building

The system `java` on this machine is still a 1.8 JRE, which cannot build
Android. The build script sets `JAVA_HOME` explicitly, so use the script rather
than calling Gradle directly.

```powershell
.\scripts\build-android.ps1                    # debug APK, no keystore needed
.\scripts\build-android.ps1 -Release           # signed APK + AAB
.\scripts\build-android.ps1 -Release -SkipWebBuild   # reuse existing dist/
```

Toolchain (already installed, not on PATH):

| | |
|---|---|
| JDK | `E:\devtools\jdk\jdk-21.0.12+8` (Temurin 21) |
| Android SDK | `E:\devtools\android-sdk` (platform 36, build-tools 36.0.0) |

Outputs:

```
android/app/build/outputs/apk/release/app-release.apk    <- sideload / direct install
android/app/build/outputs/bundle/release/app-release.aab <- upload this to Play
```

**Google Play requires the `.aab`.** New apps cannot be submitted as APKs. The
APK exists for direct install and testing.

### Three things that will waste your afternoon

1. `android/local.properties` must use **forward slashes** (`E:/devtools/android-sdk`).
   A Java properties file treats a lone backslash as an escape, so the Windows
   path silently collapses and Gradle fails with a confusing path error. The
   build script rewrites this file every run, so do not hand-edit it.
2. Gradle is invoked with `--no-problems-report`. Its post-build report writer
   can hang on this disk and print `BUILD FAILED` *after* the artifact was
   packaged correctly.
3. Never pipe `gradlew` through `tail` / `Select-Object`. It masks the exit code
   and a failed build looks like a successful one.

---

## Signing

`scripts/make-keystore.ps1` generated the **upload** keystore:

```
android/songchainn-upload.keystore     <- the key
android/keystore.properties            <- path + passwords, read by Gradle
```

Both are gitignored. **Back them up off this machine.**

With Play App Signing (default for new apps) Google holds the real app signing
key and this is only the upload key, so a lost upload key can be reset through
Play Console support. It is still the credential that proves uploads are yours.

---

## What v1.0 does and does not do

**Working:**
- Full app, offline-capable, assets bundled in the package
- Lock screen / notification playback controls via `MediaSession` (already in
  `AudioPlayer.tsx` and `FullScreenPlayer.tsx`)
- Hardware back button walks router history and only exits at the root
- External links open in the system browser instead of trapping the user
- Splash screen, status bar theming, portrait lock
- Service worker disabled natively (assets are local; updates come from Play)
- Backup and device-transfer disabled so session tokens cannot be restored onto
  another device

**Known limitations, deliberate for v1.0:**
- **Background audio is best-effort.** Playback runs in the WebView. Android
  gives an app playing audio some priority, but with no native media foreground
  service it can be killed under memory pressure. A proper
  `MediaSessionService` is the fix and is the single biggest native upgrade for
  v1.1.
- **No push notifications.** Needs Firebase, `google-services.json`, and
  `@capacitor/push-notifications`. Web push still works in the browser PWA.
- **App Links are declared but not yet verified** (see below).
- **LiveKit voice is off** (`VOICE_ENABLED=false`), so no microphone permission
  is requested.

---

## Follow-up after the first Play upload: assetlinks.json

`AndroidManifest.xml` declares App Links for `songchainn.xyz`. This is what
brings Supabase magic links and OAuth redirects **back into the app** instead of
stranding the user in Chrome. Until it is verified those links open the browser,
which is today's behaviour, so this is not a regression, but auth-by-email will
feel broken-ish in the app until it is done.

It cannot be completed before the first upload, because with Play App Signing
the fingerprint that matters is **Google's** app signing key.

1. Upload the AAB. In Play Console go to **Release > Setup > App signing** and
   copy the **SHA-256 certificate fingerprint** of the *app signing key* (not
   the upload key).
2. Publish this at `https://songchainn.xyz/.well-known/assetlinks.json`
   (the repo already serves `public/.well-known/`):

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "xyz.songchainn.app",
    "sha256_cert_fingerprints": ["PASTE_THE_SHA256_FROM_PLAY_CONSOLE"]
  }
}]
```

3. Reinstall the app and confirm with:
   `adb shell pm verify-app-links --re-verify xyz.songchainn.app`

---

## Play Console submission

### Store listing

- **App name:** use **`SONGCHAINN`**, not `$ongChainn`. Play's title policy
  treats leading special characters as promotional, and on a
  blockchain-adjacent app a leading `$` invites exactly the scrutiny you do not
  want. The launcher label on the device stays `$ongChainn` either way; they are
  separate fields.
- **Privacy policy URL:** `https://songchainn.xyz/privacy`
  (added as an alias of the existing "Terms of Use and Privacy Notice" page).
- Needs: 2+ phone screenshots, a 512x512 icon, and a 1024x500 feature graphic.

### Data safety form

Declare collected and linked to the user:

| Category | What | Why |
|---|---|---|
| Personal info | Email address | Account creation (Supabase auth) |
| Personal info | Name / username, profile photo, bio | Public profile |
| Financial info | Wallet address | Optional wallet sign-in and onchain features |
| Messages | Direct messages | In-app inbox |
| Photos / audio | Uploaded artwork and audio | User-generated content |
| App activity | Plays, pulses, engagement events | Charts, loyalty points, recommendations |
| App info | Diagnostics via Vercel Speed Insights | Performance monitoring |

Encrypted in transit: **yes** (everything is HTTPS/WSS).
Users can request deletion: **must be yes** once the item below is built.

### Content rating

Music + social + user-generated content. Expect **Teen / PEGI 12**. Answer the
UGC questions honestly: users can post, comment, and message each other.

---

## Blockers to fix before submitting

These are Play **policy requirements**, not polish. Both are currently missing
and both cause rejection.

### 1. Account deletion (Play "Data deletion" policy)

Any app with account creation must offer deletion of the account and its data
**both in-app and via a publicly reachable web URL** listed on the store entry.
There is currently no delete-account path anywhere in `src/`.

Needs: a destructive action in Profile/Settings, an edge function that deletes
the user's rows and their `auth.users` record, and a public web page that
explains how to request it.

### 2. Report and block (Play "User Generated Content" policy)

Apps hosting UGC must provide in-app reporting of objectionable content **and**
a way to block other users. Reporting exists: `src/components/ReportDialog.tsx`
writes to `content_reports` and is wired into posts (3 Sep 2026). Blocking does
not exist yet: there is no `blocked_users` table and no block action anywhere
in `src/`. `is_hidden` and the `moderate-comment` function cover the moderator
side only.

Still needs: a `blocked_users` table filtered into feed and DM queries, plus a
block action on profiles and DMs.

### 3. Watch the Play Billing line

Play requires Google Play Billing for the sale of in-app digital content, at
15-30%. Token-gated Worlds are the risk area: if the Android build ever
presents a "buy $IMAN to unlock this room" flow, that can be read as selling
digital access outside Play Billing.

**This is no longer a hypothetical.** As of 3 Sep 2026 the web bundle has
World #001 live: `WORLDS_ENABLED = true`, `swapUrl` points at IMan's Zora
creator coin, and the `world-gate` function reports `tokenLive: true` once the
3 Sep rewrite of it is deployed (production still answered `false` on the day
this was written, because that deploy was pending). The
doorway on Home and Auth shows a "Get $IMAN" button that opens zora.co in the
browser. On the web that is fine. On Android, a button that sends someone to
buy a token which then unlocks rooms is exactly the pattern Play reads as
selling digital access outside Play Billing.

Before any Android submission: hide the "Get the key" buttons when running
inside Capacitor (`Capacitor.isNativePlatform()`), keep the balance read, and
let the rooms open for anyone who already holds the coin. Token acquisition
must happen in the user's own external wallet. This is also the reason to keep
the Artizen `$10 Artifact = access` model off the Android build and on the web.
