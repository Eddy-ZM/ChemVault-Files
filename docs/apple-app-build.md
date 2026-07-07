# ChemVault Files Apple App Build

This repository includes a native SwiftUI Apple app at `apps/apple/ChemVaultFiles`.

## Supported Platforms

- iOS 17+
- iPadOS 17+
- macOS 14+
- visionOS is not enabled yet. The SwiftUI structure is portable, but it still needs a target and UI QA on visionOS hardware or simulator.

## Project Entry

Open the app in Xcode from:

```bash
open apps/apple/ChemVaultFiles/Package.swift
```

The repository also includes `apps/apple/ChemVaultFiles/project.yml` for teams that prefer generating an Xcode project with XcodeGen.

## Required Manual Settings

Set these in Xcode or a local xcconfig copied from `apps/apple/ChemVaultFiles/Config/AppConfig.xcconfig.example`:

```text
API_BASE_URL = https://file.chemvault.science
APP_ENV = production
BUNDLE_ID = science.chemvault.files
DEVELOPMENT_TEAM = 96L6379Q92
```

Use your Apple Developer Team for `DEVELOPMENT_TEAM` if it differs.

## Signing And Capabilities

Enable:

- Automatically manage signing, or select the ChemVault provisioning profiles manually.
- Keychain Sharing for the app bundle.
- App Sandbox for macOS direct distribution.
- Incoming URL scheme: `chemvaultfiles`.

The app stores access and refresh tokens in Keychain. Do not move tokens into `UserDefaults`.

## Running

1. Open `Package.swift` in Xcode.
2. Select the iOS, iPadOS, or macOS destination.
3. Confirm `API_BASE_URL` points to the deployed Files site.
4. Run the app.
5. Sign in through ChemVault User. The login callback returns to `chemvaultfiles://auth`.

## Current Native Features

- SwiftUI app shell with sidebar, toolbar, list/grid file views, detail panel, settings, and recycle bin navigation.
- ChemVault User SSO token bridge.
- Keychain session restore and sign out.
- File list, search, sort, new folder, upload, download, preview, star, delete, restore, and permanent delete calls through the existing Files API.
- Image, PDF, and text/code preview surfaces.
- macOS menu commands for refresh, delete, sign out, and new folder.
- Dynamic Type, dark mode, and native system controls.

## Archive And TestFlight

1. Increment the app version and build number in Xcode.
2. Select `Any iOS Device` or the macOS archive target.
3. Run `Product > Archive`.
4. Validate signing.
5. Upload to App Store Connect.
6. Add the build to TestFlight.

Native code updates must go through TestFlight or App Store review. Do not ship native-code updates through a web updater.

## macOS Direct Distribution

If ChemVault distributes the macOS app outside the App Store:

- Use Developer ID Application signing.
- Notarize the archive with Apple.
- Add Sparkle later for signed app updates.

Sparkle is intentionally not wired yet because the current priority is a native, API-backed app that can run from Xcode.

## Tests

On macOS with Xcode installed:

```bash
cd apps/apple/ChemVaultFiles
swift test
```

For Xcode destinations:

```bash
xcodebuild -scheme ChemVaultFiles -destination 'platform=macOS' build
```

This Windows workspace cannot run `xcodebuild`; final signing, simulator, archive, and TestFlight validation must happen on macOS.
