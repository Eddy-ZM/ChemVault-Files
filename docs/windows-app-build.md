# ChemVault Files Windows App Build

The Windows desktop app lives in `apps/windows` and uses Electron. Electron was chosen over Tauri here because the current project is already a web/API TypeScript stack, Electron can package the app on Windows without adding a Rust toolchain, and it provides mature NSIS installer and updater support.

## Features

- ChemVault User SSO login in a contained auth window.
- Secure token storage through Electron `safeStorage`.
- Sidebar navigation for My Files, Recent, Starred, Shared with Me, Recycle Bin, and Settings.
- File list and grid views.
- Search, sort, new folder, upload, drag-and-drop upload, download, preview, star, delete, restore, and permanent delete.
- Native file open/save dialogs.
- Desktop upload notification.
- App menu commands for new folder and sign out.
- Updater hook through `electron-updater`.

## Install Dependencies

From the repository root:

```bash
npm --prefix apps/windows install
```

## Local Development

Start the Vite renderer:

```bash
npm run dev:windows
```

In another terminal, start Electron:

```bash
npm --prefix apps/windows run dev:electron
```

The desktop dev server uses `http://127.0.0.1:5177`, which is included in the default API CORS allowlist.

## Environment Variables

Copy `apps/windows/.env.example` for local use:

```text
CHEMVAULT_API_BASE_URL=https://file.chemvault.science
CHEMVAULT_APP_ENV=production
CHEMVAULT_UPDATE_FEED_URL=https://download.chemvault.science/files/windows/
```

Only public app configuration belongs here. Do not put Cloudflare, R2, D1, or signing secrets in the renderer.

## Build

```bash
npm run build:windows
```

This compiles the Electron main/preload code and builds the Vite renderer.

## Package EXE

```bash
npm run package:windows
```

The installer is written to:

```text
dist/windows/ChemVaultFilesSetup-<version>.exe
```

Without a Windows code-signing certificate, the installer can still be generated for testing, but Windows SmartScreen may warn users.

## Code Signing

For production, configure electron-builder signing with one of:

- A local certificate file referenced outside the repository.
- CI secret variables for certificate content and password.
- A signing service used by the release pipeline.

Do not commit certificate files or passwords.

## Auto Update

The app uses `electron-updater` with a generic provider. Configure:

```text
CHEMVAULT_UPDATE_FEED_URL=https://download.chemvault.science/files/windows/
```

The release command is:

```bash
npm run release:windows
```

Upload the generated installer, blockmap, and latest metadata to the configured update feed, or publish them from CI to GitHub Releases if the feed changes to a GitHub provider later.

The bundled package and release scripts set `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` because the current Windows environment times out against GitHub's Electron download endpoint. CI can remove or override that variable when direct GitHub access is reliable.

## Tests

```bash
npm --prefix apps/windows run test
```

The tests mock the API client path used by the desktop app.
