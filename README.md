# ShiftVault

ShiftVault is a free, open-source personal finance and shift tracker that runs entirely on your device. It combines a ledger for accounts and entries with a shift log, monthly goals and multi-currency support, and it keeps working without a connection.

The same web application in [`www/`](www) powers the browser build, the Android APK (Capacitor) and the Windows 10/11 desktop app (Electron). There is no backend, no account system and no telemetry.

## Features

- **Offline-first ledger** — accounts, income and expenses, running balances, categories and notes.
- **Shift tracker** — log shifts with date, hours and earnings, and review monthly totals.
- **Goals and insights** — monthly targets, progress and per-account breakdowns.
- **12 currencies** — amounts are stored per entry and formatted consistently. Exchange rates come from the Frankfurter API and are cached locally with a built-in fallback.
- **Six languages** — English, German, Spanish, French, Italian and Portuguese, switchable at any time.
- **Two themes** — an OLED-friendly dark theme and a light theme with an emerald accent.
- **Local backups** — export the ledger as CSV or as a complete JSON backup.
- **Native packaging** — a signed-for-testing Android APK and a portable or installable Windows executable, both built from the same `www` source.
- **Custom app identity** — a hand-drawn bank-vault icon that can be switched between a dark and a light variant.

## Privacy by design

ShiftVault is built to keep financial data on the device.

- All accounts, entries, shifts, goals and settings are stored in the browser's `localStorage`.
- There is no server, no sign-in, no sync service, no analytics, no advertising and no tracking.
- The only outbound network request is an optional exchange-rate refresh to `api.frankfurter.dev`. If it fails, the app falls back to bundled reference rates and remains fully usable.
- The Android WebView and the Electron window load local files only. Electron runs with `contextIsolation`, `sandbox` enabled, `nodeIntegration` disabled and no application menu.
- Clearing the app's site data or uninstalling the app removes the local database. Export a JSON backup first if you want to keep it.

## Repository structure

```
shiftvault/
├── .github/workflows/
│   ├── build-android.yml      # Android APK CI
│   └── build-windows.yml      # Windows EXE / installer CI
├── assets/
│   └── android/               # launcher icon sets copied into the native project
├── scripts/
│   ├── gen-icons.py           # regenerates every PNG icon (Pillow)
│   ├── prepare-android.mjs    # icons, launcher aliases and native icon plugin
│   └── serve.mjs              # dependency-free static server for local previews
├── www/                       # single source of truth for all three targets
│   ├── index.html
│   ├── style.css
│   ├── lang.js                # translations for six languages
│   ├── store.js               # localStorage state and data model
│   ├── fx.js                  # exchange rates, cache and formatting
│   ├── icon.js                # in-app Canvas vault icon generator
│   ├── app.js                 # views, forms, dialogs, exports
│   ├── icon-dark.png
│   ├── icon-light.png
│   ├── icon-maskable.png
│   └── manifest.webmanifest
├── capacitor.config.json      # Android: appId, app name, webDir "www"
├── electron-main.js           # Windows: native window loading www/index.html
├── package.json               # dependencies, scripts and electron-builder config
├── LICENSE
└── README.md
```

`www/` is committed. `android/`, `dist/` and `release/` are generated and ignored by Git.

## Requirements

| Task | Requirements |
| --- | --- |
| Web preview | Node.js 18+ (Node.js 20 recommended) |
| Android APK | Node.js 20, JDK 17, Android SDK (API 34) |
| Windows EXE | Node.js 20 on Windows 10/11 (or Wine when cross-building) |
| Icon generation | Python 3 with Pillow (`pip install pillow`) |

Capacitor 6 is used deliberately: it is the current Capacitor line that targets JDK 17, which keeps the Android workflow reproducible on `ubuntu-latest`.

## Run the web app locally

The web app has no build step. Serve `www/` over HTTP so that `localStorage`, the manifest and the icon files behave exactly as they do in the native shells:

```bash
npm ci
npm run serve
# http://localhost:3000
```

Opening `www/index.html` directly with `file://` works in most browsers, but a local server is recommended.

## Android build (Capacitor)

### From GitHub Actions

1. Push to `main` or start **Build Android** manually from the **Actions** tab.
2. The workflow installs Node.js 20 and JDK 17, runs `npx cap add android`, installs the launcher icons and aliases, syncs `www`, and runs `./gradlew assembleDebug`.
3. Open the completed run and download the **ShiftVault-Android** artifact. It contains `ShiftVault-Android.apk`.

The APK is a debug build signed with the standard Android debug key. It installs directly on a device (enable installation from unknown sources) and is intended for testing and sideloading, not for Play Store distribution.

### Locally

```bash
npm ci
npm run android:add      # npx cap add android + launcher icons/aliases
npx cap sync android     # copies www into the native project
cd android
./gradlew assembleDebug
```

The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.

### Android launcher icon switching

`capacitor.config.json` points Capacitor at `www`. After the Android project is generated, `scripts/prepare-android.mjs`:

- copies the dark and light icon sets from `assets/android` into the native `res/` folders,
- moves the `LAUNCHER` intent filter from `MainActivity` to two `activity-alias` entries (`MainActivityDark` and `MainActivityLight`),
- generates and registers a small native `IconSwitch` plugin that toggles those aliases at runtime.

Choosing an icon in **Options → App icon** while running the Android app therefore changes the actual home-screen icon. The target alias is enabled before the other one is disabled, so the launcher never loses the icon. Some launchers cache icons briefly; a restart of the launcher may be needed. Pinned shortcuts and widgets keep the icon they were created with.

The desktop build intentionally keeps a fixed icon: the Electron window, executable and shortcuts always use `www/icon-dark.png`.

## Windows 10/11 build (Electron)

### From GitHub Actions

1. Push to `main` or start **Build Windows** manually from the **Actions** tab.
2. The workflow installs Node.js 20 and runs `npx electron-builder --win --x64`.
3. Download one of the artifacts:
   - **ShiftVault-Windows** → `ShiftVault-Windows.exe` (portable, no installation)
   - **ShiftVault-Windows-Installer** → `ShiftVault-Setup.exe` (NSIS installer with Start Menu and desktop shortcuts)

### Locally

```bash
npm ci
npm run dist:win
```

Both targets are written to `release/`:

- `release/ShiftVault-Windows.exe` — portable executable
- `release/ShiftVault-Setup.exe` — NSIS installer

The native window opens `www/index.html` with a `#000000` background, a default size of 480×820, a minimum width of 380 px, a hidden menu bar and the vault icon from `www/icon-dark.png`.

## Downloading builds from GitHub

### GitHub Actions artifacts

1. Open the repository's **Actions** tab.
2. Select **Build Android** or **Build Windows**.
3. Open the most recent successful run.
4. Download the artifact at the bottom of the run:
   - `ShiftVault-Android.zip` → `ShiftVault-Android.apk`
   - `ShiftVault-Windows.zip` → `ShiftVault-Windows.exe`
   - `ShiftVault-Windows-Installer.zip` → `ShiftVault-Setup.exe`

Artifacts are retained according to the repository's retention settings. Downloading artifacts from a public repository requires a GitHub sign-in.

### GitHub Releases

When a release is published, the same files can be attached to it as release assets. Open the **Releases** page on the right side of the repository and download `ShiftVault-Android.apk` or `ShiftVault-Windows.exe` from the latest release.

## Configuration

| Setting | File | Value |
| --- | --- | --- |
| Android app ID | `capacitor.config.json` | `com.shiftvault.app` |
| Android app name | `capacitor.config.json` | `ShiftVault` |
| Capacitor web directory | `capacitor.config.json` | `www` |
| Electron entry file | `package.json` → `main` | `electron-main.js` |
| Desktop application ID | `package.json` → `build.appId` | `com.shiftvault.desktop` |
| Desktop window | `electron-main.js` | 480×820, min. 380 px wide, `#000000` |
| Build output | `package.json` → `build.directories.output` | `release` |

Electron packages only `www/**/*`, `electron-main.js` and `package.json`, so the Android project, scripts and CI files are never included in the desktop app.

## Regenerating icons

```bash
pip install pillow
python3 scripts/gen-icons.py
```

This writes `www/icon-dark.png`, `www/icon-light.png`, `www/icon-maskable.png` and the complete Android launcher sets under `assets/android/`. The same vault artwork is drawn in `www/icon.js` for the in-app icon preview and PNG export, so update both if you change the design.

## Data and backups

- **CSV** — export the visible ledger for spreadsheets.
- **JSON** — export a complete backup of accounts, entries, shifts, goals and settings.

Backups are downloaded locally; nothing is uploaded.

## License

MIT — see [LICENSE](LICENSE).
