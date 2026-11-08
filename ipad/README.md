# Reading Room for iPad

Open **ReadingRoom.xcodeproj** in this folder. This is an iPad-only UIKit/WKWebView app for iPadOS 16 or later. It bundles the existing Reading and Writing interface and all 1,845 Reading questions, including 761 original images. No npm install, Capacitor, CocoaPods, new server, or deployment is needed to build it.

## Open and install

1. Clone the complete repository and check out the iPad feature branch. Keep the `public/` and `asset-packs/` folders next to `ipad/`; the project builds its offline bundle from them.
2. Open `ipad/ReadingRoom.xcodeproj` in Xcode. Use the **ReadingRoom** scheme.
3. For a simulator, choose an installed iPad simulator and press Run. Signing is not needed.
4. For your iPad, connect it to the Mac, unlock it, and trust the computer. In Xcode → Settings → Apple Accounts, add your Apple Account if necessary.
5. Select the **ReadingRoom** target → **Signing & Capabilities**, leave **Automatically manage signing** enabled, and choose your team. A Personal Team is sufficient for local development; no paid membership is required for this workflow. If Xcode says the bundle identifier is unavailable, change `com.wiktorkaluzny.readingroom.ipad` to a unique identifier before the first installation. Use the same identifier for subsequent updates to retain the app's data.
6. Select your connected iPad as the destination. Enable **Settings → Privacy & Security → Developer Mode** on the iPad if prompted, then press Run in Xcode. Complete any trust prompts on the iPad. Personal Team signing may require periodically running the app from Xcode again; reinstall over the existing app, without deleting it.

The build uses `/usr/bin/python3` and the standard library to prepare the web bundle. Xcode's command-line tools must be installed. All four iPad orientations and resizing are enabled. The app retains the web app's light appearance. There are no account, team, signing certificate, or sync secrets committed to the project.

Apple instructions: [run on a device](https://developer.apple.com/documentation/xcode/running-your-app-on-simulated-or-physical-devices), [Developer Mode](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device/), [Personal Team signing](https://help.apple.com/xcode/mac/current/en.lproj/dev60b6fbbc7.html).

## Connect the Mac and iPad

1. On the **existing Mac website**, open **Settings → Sync across browsers**. If sync is already on, keep its existing 32-character code. Otherwise turn on sync once. Wait for a successful sync and export a backup.
2. In the iPad app, tap **Connection** in the top bar. Paste the **exact HTTPS origin of that same deployed Reading Room site**, for example `https://YOUR-ACTUAL-WORKER.workers.dev`. Use the real address from your Mac browser or Cloudflare; the repository does not contain it. Do not add `/api/sync`, a path, or a query string.
3. In the iPad app's **Settings → Sync across browsers**, enter the **same Mac code** and tap **Use code**. Do not create a different code on each device. Wait for “Synced”.
4. Answer a Reading question on one device. On the other, reopen the app/site or press **Sync now**. Check Past questions and bookmarks. The existing sync cadence also checks about once a minute while visible.

The code is the existing login credential: there is no separate account or password. Anyone with the code can access and change that progress. It stays in the app's persistent WebKit storage, never in the project, exported backups, URLs, or application logs. Copy uses a local-only clipboard item that expires after two minutes. Do not put your code in screenshots, commits, or support messages.

**Cloudflare Access:** this version uses the existing code-authenticated `/api/sync` API. If your website additionally requires a Cloudflare Access browser login, sync will show an error; Access login/cookie forwarding is not implemented. No Access policy is changed or bypassed. Offline practice and backups still work.

## Offline progress, navigation, and backups

- Questions and images are bundled, so the app starts and practices offline, including before sync is configured.
- The same `reading-room-v1` state is saved synchronously to localStorage, mirrored into IndexedDB, and retained in daily snapshots. The origin is always `readingroom://localhost`, independent of the configured remote address. Updating the app with the same bundle identifier preserves that storage. Deleting the app can remove it.
- Answers, bookmarks, crossed-out choices, highlights, notes, and session positions use the existing merge rules. Offline edits remain local and retry on reconnect, foreground, after changes, and the minute timer. iPadOS may suspend background network work; foreground sync is the reliable catch-up point.
- The iPad's Reading history, dashboard, weekly activity, review lists and saved sessions exclude Math. Direct Math routes and synced Math resume targets are blocked. No calculator or remote full website is loaded. **Math progress remains in the shared record and backups**, so iPad sync does not erase Mac work. Existing bookmark/settings merge conflict rules remain unchanged.
- Use the in-page navigation or native Back button/swipe. Original question images open in a dismissible viewer.
- **Export backup** opens the native share sheet; use Save to Files. **Restore backup** uses the file picker and asks before replacing local progress. With sync enabled, the existing server merge may restore records that also exist remotely; a backup restore does not reset cloud progress. Daily snapshot restore uses the same confirmation. Export before deleting the app, changing identifiers, or switching sync identities.
- An app update is needed to receive newly added question-bank content. Progress syncing is independent of question-bundle updates. If a newer website introduces unknown question IDs, the current validation refuses that sync state rather than silently dropping records; update the iPad build.

## Implementation and boundaries

`prepare_web.py` derives an isolated iPad bundle during the Xcode build. It retains the full question metadata for backup validation and merging, but packages only Reading question bodies and images. It makes checked, fail-fast transformations of the current `public/app.js`; an upstream change that invalidates an assumption stops the build for review. It never edits `public/`, `src/worker.js`, or `wrangler.jsonc`.

`App.swift` serves the bundled files through `WKURLSchemeHandler` and a persistent `WKWebsiteDataStore`. A narrowly scoped native bridge sends only GET/POST requests to the configured HTTPS origin's `/api/sync`. This avoids adding CORS permissions to the Worker. The 32-character code is sent in the Authorization header. Redirects are refused, network responses are not cached, and only the bundled main frame can call the bridge. CSP blocks remote scripts and frames. No Cloudflare API token is needed.

The existing Worker remains named `reading-room`, backed by the existing Durable Object class `Progress`. Do not deploy a second Worker or run `npm run deploy` for this app. The iPad project does not add any cloud services or purchase anything. When you enable sync, requests use your existing Cloudflare account and its normal usage limits.

## Checks

From the repository root, with Node 22+ and Python 3:

```sh
npm test
xcodebuild -project ipad/ReadingRoom.xcodeproj -scheme ReadingRoom \
  -sdk iphonesimulator -configuration Debug \
  -derivedDataPath /tmp/reading-room-build CODE_SIGNING_ALLOWED=NO build
xcodebuild -project ipad/ReadingRoom.xcodeproj -scheme ReadingRoom \
  -destination 'platform=iOS Simulator,name=iPad Pro 11-inch (M5),OS=26.5' \
  -derivedDataPath /tmp/reading-room-build CODE_SIGNING_ALLOWED=NO test
```

Choose a simulator installed on your Mac. The native tests use local test progress in the simulator; use a simulator dedicated to development, not a personal iPad with real progress. No live Worker credentials or network writes are used by the tests.

The JavaScript tests exercise the actual Worker/DO code with an in-memory SQL adapter: mixed Reading/Math progress, Mac → iPad → Mac merging, stale offline uploads, version checks, invalid credentials and native bridge error handling. Native tests run the real bundled app in WKWebView, checking navigation, persistence in both stores, offline answering, image rendering, credential persistence and invalid endpoint rejection. These tests do not substitute for checking your actual deployed service with your own code after installation.

Validation on 8 November 2026: all 24 JavaScript tests passed; the app built with Xcode 27.0 and both native tests passed on the iPad Pro 11-inch (M5), iPadOS 26.5 simulator. Physical-device signing/installation and synchronization with the actual deployed Worker have not been tested. No production Worker request, deployment, or paid service was used for validation.
