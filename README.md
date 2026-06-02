<h1 align="center">
  <img src="assets/slop.png" alt="NoSlop" width="120"><br>
  NoSlop
</h1>

<p align="center"><em>Instagram without the parts designed to waste your time.</em></p>

<p align="center">
  <a href="https://github.com/Rafraf-bot2/GramZero/actions/workflows/eas-build.yml"><img alt="Build" src="https://github.com/Rafraf-bot2/GramZero/actions/workflows/eas-build.yml/badge.svg"></a>
  <a href="https://github.com/Rafraf-bot2/GramZero/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/Rafraf-bot2/GramZero?include_prereleases&sort=semver"></a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-Android-green.svg">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
</p>

NoSlop is a free, open-source Android app that wraps Instagram's mobile website in a WebView and surgically removes the features built for addiction — Reels, infinite feed — while leaving everything intentional intact: DMs, Stories, Search, profiles, posting.

No Play Store. No account. No server. Just Instagram, minus the slop.

> [!NOTE]
> This is an **independent personal project**, not affiliated with or endorsed by Meta/Instagram. It doesn't touch your credentials or account data — it only manipulates the DOM client-side, exactly like a browser extension would.
>
> **Use at your own risk.** Automated DOM manipulation may conflict with Instagram's Terms of Service. Only use this with your own account.

---

## Table of contents

- [What it blocks](#what-it-blocks)
- [Download](#download-android)
- [Build it yourself](#build-it-yourself)
- [How it works](#how-it-works)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)
- [License](#license)

---

## What it blocks

| Feature | Behaviour |
|---|---|
| **Reels tab** | Hidden from the nav bar. A full-screen overlay appears if you somehow reach `/reels/`. |
| **Home feed** | Only the Stories strip is visible. All feed articles are hidden behind a "Focus mode" overlay. |
| **Reel swiping** | When you open a reel from a DM or direct link, vertical swipes to the next reel are intercepted. Taps still work normally (likes, comments, replies). |

Everything else works as normal: DMs, Stories, profiles, Search, posting, Explore.

---

## Download (Android)

> **No Play Store** — sideload required. Takes about 30 seconds.

1. Go to [**Releases**](../../releases/latest) and download the latest `.apk`.
2. On your Android phone: **Settings → Apps → Special app access → Install unknown apps** → allow your browser or file manager.
3. Open the downloaded APK and tap **Install**.

Done. Log in with your Instagram account inside the app.

---

## Build it yourself

### Requirements

- Node 20+
- Java 17 (for Gradle)
- Android SDK / [Android Studio](https://developer.android.com/studio) with `ANDROID_HOME` set
- `watchman` — `brew install watchman` (macOS) / `sudo apt install watchman` (Linux)

### Run in dev mode

```bash
git clone https://github.com/Rafraf-bot2/GramZero.git
cd GramZero
npm install
npx expo start
```

Connect a device via USB (USB debugging enabled) or start an emulator, then press `a` in the Metro terminal.

> [!TIP]
> Use `npx expo start --clear` after any change to the JavaScript content script — Metro caches the bundle aggressively and changes won't appear otherwise.

### Build a release APK locally

```bash
npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease
# APK → android/app/build/outputs/apk/release/
```

### Automated releases via GitHub Actions

Tagging a version triggers the CI workflow that builds and publishes the APK automatically:

```bash
git tag v1.x.x && git push --tags
```

No Expo account, no EAS subscription — the build runs entirely on GitHub's free runners.

---

## How it works

```
┌─────────────────────┐    ┌──────────────────────┐    ┌─────────────────────┐
│   WebView load      │ ─▶ │   JS injection       │ ─▶ │   DOM polling       │
│                     │    │                      │    │                     │
│ instagram.com       │    │ hides Reels tab       │    │ 600ms interval      │
│ mobile Chrome UA    │    │ patches pushState     │    │ catches SPA navs    │
│                     │    │ intercepts taps       │    │ that bypass hooks   │
└─────────────────────┘    └──────────────────────┘    └─────────────────────┘
```

The app points a React Native WebView at `instagram.com` with a mobile Chrome user-agent. On every page load, a JavaScript content script is injected that:

- **Hides the Reels nav item** and intercepts taps on it before navigation fires
- **Patches `history.pushState` / `replaceState`** to react to Instagram's SPA navigations in real-time
- **Polls the DOM every 600ms** as a safety net for navigations that bypass the pushState hooks
- **Measures the Stories strip** dynamically and positions a "Focus mode" overlay between it and the nav bar
- **Intercepts `touchmove` events** on reels to block vertical swipes, forwarding taps through via `elementFromPoint`
- **Detects dark/light theme** by reading `document.body.backgroundColor` and syncs the native Android status bar

No data leaves your device. The app makes no network calls other than to `instagram.com`.

---

## Troubleshooting

<details>
<summary><b>The Focus mode overlay appears on the login page</b></summary>

The script checks for a nav bar (`nav` or `[role="tablist"]`) before activating the feed block. If you see the overlay on the login screen, make sure you're on a recent version — this was an early bug.

</details>

<details>
<summary><b>Stories strip is hidden along with the feed</b></summary>

The script detects the Stories container by `scrollWidth > window.innerWidth`. If Instagram changes its layout, this detection may fail. Open an issue with your Android version and Instagram web version (visible in browser settings).

</details>

<details>
<summary><b>Reel tap forwarding doesn't work (can't like/comment)</b></summary>

The overlay sets `pointer-events: none` momentarily to forward the tap via `elementFromPoint` + synthetic click. Some elements (like the heart button) use custom touch handling. This is a known limitation — open an issue if a specific action is broken.

</details>

<details>
<summary><b>App is blank or shows a white screen</b></summary>

Instagram may have changed a URL or DOM structure the app depends on. Check the [Issues](../../issues) page for a known fix, or open a new one.

</details>

<details>
<summary><b>Back button closes the app instead of going back</b></summary>

This is intentional when the WebView has no history to go back to (e.g. on the home screen). If it's happening mid-session, that's a bug — open an issue.

</details>

<details>
<summary><b>Something broke after an Instagram update</b></summary>

Instagram is a React SPA that ships frequent updates. The content script targets Instagram's DOM structure, which can change without notice. Fixes are usually small CSS selector tweaks. Open an issue and it'll be addressed in the next release.

</details>

---

## Roadmap

- [x] Block Reels tab and `/reels/` route
- [x] Hide home feed, keep Stories strip
- [x] Block reel swiping from DM links
- [x] Dark/light mode sync with system status bar
- [x] Onboarding screen
- [ ] iOS support (WebView JS injection restrictions make this harder)
- [ ] Notification badge on the app icon

---

## License

MIT — see [LICENSE](LICENSE).

---

<sub>NoSlop is an independent personal project. Instagram® is a trademark of Meta Platforms, Inc. This project is not affiliated with, endorsed by, or sponsored by Meta.</sub>
