# ChemVault Files Release Process

## Versioning

Use one product version across Web, Apple, and Windows when possible:

```text
major.minor.patch
```

Patch versions are for fixes. Minor versions are for user-visible features. Major versions are for breaking workflow or API changes.

## Changelog

For each release, record:

- Web changes.
- Apple app changes.
- Windows app changes.
- Backend API or Cloudflare binding changes.
- Known limitations.
- Rollback notes.

## Web Release

1. Run local validation:

```bash
npm run build
npm test
npx astro check
```

2. Confirm Cloudflare bindings:

- D1 binding: `FILES_DB`
- R2 binding: `FILES_BUCKET`
- Runtime vars: `USER_AUTH_ORIGIN`, `USER_LOGIN_URL`, `COOKIE_NAME`, `COOKIE_DOMAIN`, `FILE_STORAGE_QUOTA_BYTES`, `ALLOWED_APP_ORIGINS`
- Secrets: `APP_SESSION_SECRET` or existing `JWT_SECRET`

3. Push the release branch according to the repository deployment policy.
4. Confirm Cloudflare Pages deployment.
5. Smoke test login, list files, upload, preview, share, and recycle bin.

For installed desktop builds, include `null` in `ALLOWED_APP_ORIGINS` because packaged Electron file origins can serialize to `Origin: null`. App API requests still require bearer tokens.

## Apple Release

1. Open `apps/apple/ChemVaultFiles/Package.swift` in Xcode.
2. Confirm bundle id, Team, signing, Keychain, and URL scheme.
3. Run app on iOS simulator and macOS locally.
4. Run Apple tests from macOS:

```bash
cd apps/apple/ChemVaultFiles
swift test
```

5. Archive in Xcode.
6. Upload to App Store Connect.
7. Release through TestFlight first.
8. Promote to App Store when approved.

Rollback for Apple is handled through App Store phased release controls or by submitting a new build.

## Windows Release

1. Install dependencies:

```bash
npm --prefix apps/windows install
```

2. Build and test:

```bash
npm run build:windows
npm --prefix apps/windows run test
```

3. Package unsigned test installer:

```bash
npm run package:windows
```

4. For production, configure code signing and run:

```bash
npm run release:windows
```

5. Upload the installer and updater metadata to `CHEMVAULT_UPDATE_FEED_URL`.
6. Verify app login, upload, download, preview, delete, restore, and update check.

Rollback for Windows is handled by publishing the previous installer metadata to the update feed and removing the bad installer from the public download page.

## Backend Compatibility

The native and desktop apps call the existing Files API. Keep these response formats stable:

```json
{ "ok": true, "data": {} }
```

for app auth endpoints, and:

```json
{ "error": { "code": "CODE", "message": "Message" } }
```

for existing Files API errors.

Do not expose R2 object keys, Cloudflare secrets, or database details to clients.
