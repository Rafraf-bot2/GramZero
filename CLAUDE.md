# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

App name: **NoSlop**. Icon: `./assets/slop.png`.

A React Native (Expo) Android app that wraps Instagram's mobile website in a WebView with two focus features:
1. **Reels blocked** — the Reels tab is hidden from the nav bar; a full-screen grey overlay appears if the user reaches `/reels/` via direct URL. Individual reels from DMs or direct links (`/reel/ABC123/`) still work normally, but swiping to the next reel is blocked (see below).
2. **Home feed masked** — on `/`, only the stories strip is visible. All feed articles and intermediate content ("Vous êtes à jour", "Publications suggérées") are hidden. A "Mode focus" overlay covers the feed area between the stories and the nav bar.
3. **Reel scroll blocked** — when a reel is open (from a DM share or direct link), a transparent full-screen overlay intercepts all touch events. Vertical swipes are blocked (`preventDefault()` on the overlay's own `touchmove` listener). Taps are forwarded to the underlying element via `elementFromPoint` + synthetic `click`. The overlay is removed when a dialog is active (comments, etc.).
4. **Onboarding landing screen** — shown only on first launch (`AsyncStorage` key `onboarding_done`). Full-screen dark component (`LandingScreen.js`) with a horizontal paged `ScrollView` carousel (3 slides), auto-advancing every 3s via `Animated.timing` on a progress dot, background video (`assets/bg.mp4`) via `expo-video`, DM Sans font via `@expo-google-fonts/dm-sans`. "Get started" CTA is locked (opacity 0.3, non-tappable) until the last slide is reached.

## Commands

```bash
npm install               # install dependencies
npx expo start            # start dev server
npx expo start --clear    # start with Metro cache cleared (use this after changing CONTENT_SCRIPT)
```

Requires **watchman** (`brew install watchman`). Without it, Metro throws `EMFILE: too many open files`.

## Deployment & releases

Releases are fully automated via GitHub Actions — no EAS Build, no Expo account needed.

**To release a new version:**
```bash
git tag v1.x.x && git push --tags
```
This triggers `.github/workflows/eas-build.yml` which:
1. Runs `npx expo prebuild --platform android` to generate the native project
2. Builds the APK with Gradle (`assembleRelease`)
3. Creates a GitHub Release at github.com/Rafraf-bot2/GramZero/releases with the APK attached

**No OTA updates** — every change (JS or native) requires a new tag and a new APK. Users sideload the new APK from GitHub Releases.

**`eas.json`** — kept for `npx expo prebuild` config (build profile `preview`, Android APK). No EAS Build quota is consumed.

## Version constraints

- Expo SDK 54 requires React Native **0.81.5** and React **19.1.0**
- Do not change these versions — mismatches cause `TurboModuleRegistry: PlatformConstants not found` at runtime in Expo Go

## Architecture

All logic lives in two places inside `App.js`:

**`CONTENT_SCRIPT`** — a JS string injected into the WebView on every load and re-injection. Contains:
- `window.__NOREELS__` guard to prevent double-execution across multiple injections
- `hideReelsTab()` — hides the Reels nav button using `a[href="/reels/"]`, `a[href="/reels"]`, and `aria-label` selectors with `!important`
- `showBlocker()` / `removeBlocker()` — full-screen grey overlay when `pathname` is exactly `/reels` or `/reels/`
- `findStoriesStrip()` — detects the stories horizontal-scroll container by `scrollWidth > window.innerWidth`, more reliable than aria-label selectors
- `isLoggedIn()` — checks for the presence of `nav` or `[role="tablist"]`; returns false on the login page (no nav bar). Used to guard `applyFeedBlock()` so the overlay never appears before authentication.
- `hasActiveDialog()` — checks for `[role="dialog"]` or `[role="alertdialog"]`; when true, `applyFeedBlock()` hides the overlay elements without restoring hidden articles (avoids feed flash), then returns early. The overlay is restored on the next tick once the dialog is dismissed.
- `applyFeedBlock()` / `removeFeedBlock()` — on `/` and only when logged in and no dialog is active, hides all `article` elements plus their non-stories siblings (marked with `data-nofeed-hidden`); shows a "Mode focus" overlay positioned dynamically between the stories strip bottom and the nav bar top. `cachedFeedTop` persists the measured top across polling cycles. **If `cachedFeedTop` is null and no stories strip is found, calls `removeFeedBlock()` and returns early** — this prevents the overlay from firing on Instagram's "open app" interstitial pages (which are served at `/`, have a nav bar, but never have a stories strip).
- `parseColor(cssColor)` — parses CSS color strings (`rgb(...)` / `rgba(...)`) without regex, using `indexOf`/`slice`/`split`/`parseInt`. **Do not use `\d` or `\s` inside the CONTENT_SCRIPT template literal** — they are silently converted to `d` and `s` by the JS engine, breaking any regex that uses them.
- `getPageTheme()` — detects Instagram's dark mode by reading `document.body.backgroundColor` directly (luminance < 200 = dark). Falls back to body text color (light text = dark mode). Sends `postMessage({type:'theme', dark:bool})` to React Native when theme changes (only on change, not every tick).
- `getNavBottom()` — measures nav bar position using `getBoundingClientRect().top` (not `offsetHeight`) for accurate bottom spacing
- `hideReelsTab()` — hides native children of the Reels `<a>` element; measures its viewport coordinates with `getBoundingClientRect()` **before** hiding (the element collapses to 0 after children are hidden); saves position in `reelsIconPos`; injects a `position:fixed` custom eye-slash SVG at those coordinates as `REELS_ICON_ID`; hides the icon with `display:none` when the nav bar is not present (DMs, search, etc.) by checking `placed` flag after the loop
- Feed focus overlay uses two separate elements: `FEED_BLOCKER_ID` (background + rainbow bar) and `FEED_CONTENT_ID` (icon + text as a `position:fixed` element). Content Y = `feedTop + (innerHeight - feedTop - navBottom) / 2` in viewport pixels — avoids `top:50%` percentage resolution bugs in Android WebView inside `position:fixed` parents without explicit height. The eye-slash SVG (`id="noslop-eye-svg"`) blinks at random intervals (3–10s) via a JS `scheduleBlink()` recursive `setTimeout` — the innerHTML and the `<style>` keyframe tag (`id="noslop-blink-style"`) are written **only on element creation**, not on every polling tick, so the animation is never interrupted.
- Click interceptor on `document` (capture phase) to block taps on the Reels tab before navigation fires
- `history.pushState` + `history.replaceState` patches + `popstate` listener to react to SPA navigations
- `setInterval` at 600ms as a polling fallback — catches navigations that bypass the pushState patch
- `tick()` and `setInterval` both call `removeFeedBlock()` (not just skip) when `isHomeFeed() && isLoggedIn()` is false — ensures any stale overlay is cleaned up rather than silently left in place
- `isOnSingleReel()` — returns true if the URL path starts with `/reel/`; returns false immediately if the path starts with `/stories/` (stories also have fullscreen videos — must be excluded before the DOM check to avoid false positives); otherwise checks if a video element occupying more than 70% viewport width and 50% viewport height is present in the DOM (necessary because Instagram opens DM reels as a modal overlay without changing the URL).
- `createReelOverlay()` / `removeReelOverlay()` — when `isOnSingleReel()` is true and no dialog is active, a transparent `position:fixed` full-screen div (`REEL_OV_ID`, z-index 2147483646) is appended to `body`. Its own `touchmove` listener (`{ passive: false }`) calls `preventDefault()` + `stopImmediatePropagation()` when the vertical component of the swipe exceeds the horizontal (dy²>dx² and dy²>144). Taps (no significant movement) are forwarded to the element below via `ov.style.pointerEvents='none'` + `elementFromPoint` + synthetic `MouseEvent click`. The overlay is recreated every 600ms if Instagram's DOM updates remove it.
- `dbg(msg)` — sends `{ type: 'dbg', msg }` via `postMessage` to React Native for debugging; `onMessage` logs these as `[WebView] msg` in Metro console.

**`LandingScreen.js`** — standalone component, new dependencies:
- `@react-native-async-storage/async-storage` — persists `onboarding_done` key
- `expo-video` ~2.0.6 (SDK 54 compatible — do **not** upgrade to 3.x+) — background video player, isolated in a `memo()` `VideoBackground` component to prevent re-renders from the dot animation (`useNativeDriver: false`) from freezing the video
- `@expo-google-fonts/dm-sans` + `expo-font` — DM Sans 400/600/700
- All text in **English only** (locale detection removed)
- To re-test the landing: `Settings > Apps > NoSlop > Clear Storage` on device (Metro `--clear` does not reset AsyncStorage)
- Dev override: to force the landing, temporarily replace the `AsyncStorage.getItem` call with `setShowLanding(true)` in `App.js`

**WebView props in `App()`**:
- `injectedJavaScriptBeforeContentLoaded` + `injectedJavaScript` — both set to `CONTENT_SCRIPT` to cover early and late injection
- `onNavigationStateChange` — updates `canGoBackRef` from `navState.canGoBack`, then re-injects `CONTENT_SCRIPT` on full-page navigations (e.g. login redirects)
- `onMessage` — receives `{type:'theme', dark:bool}` from the script; calls `setStatusBarStyle` and `setStatusBarBackgroundColor` from `expo-status-bar` to sync the native status bar with Instagram's theme. Theme message is only sent when the value changes (`lastSentDark` guard) to avoid spamming
- Mobile Chrome user-agent to get Instagram's mobile web layout

**Android back gesture handling**:
- `canGoBackRef` (useRef, not useState — avoids re-renders) tracks whether the WebView has history to go back to, updated on every `onNavigationStateChange`
- `BackHandler` listener (registered in `useEffect`, cleaned up on unmount) intercepts the hardware back press: if `canGoBackRef.current` is true → calls `webViewRef.current.goBack()` and returns `true` (event consumed, app stays open); otherwise returns `false` (Android default behaviour, app closes normally)

**Status bar handling**:
- `STATUS_BAR_HEIGHT` constant uses `Platform.OS === 'android' ? RNStatusBar.currentHeight : 0` — applied as `paddingTop` on the root `View` so content is never obscured by the Android status bar. No `react-native-safe-area-context` needed.
- Status bar style (`light`/`dark`) and background color are driven by `isDark` state, updated via `onMessage`. Use `expo-status-bar`'s `setStatusBarStyle` / `setStatusBarBackgroundColor` (imperative) — **not** `RNStatusBar.setBarStyle` which is unreliable, and **not** `barStyle` prop which doesn't exist on `expo-status-bar`'s `StatusBar` (correct prop is `style`).

`content-script.js` at the root is a standalone reference copy — it is **not imported** by the app.

## Key constraints

- Instagram is a React SPA: navigations don't trigger page reloads. The `pushState` patch is the primary hook; the 600ms `setInterval` is the safety net.
- The `__NOREELS__` guard is critical: `onNavigationStateChange` re-injects the script on every navigation, so without the guard the pushState function would be wrapped repeatedly.
- Use `npx expo start --clear` after any change to `CONTENT_SCRIPT` — Metro caches the bundle aggressively.
