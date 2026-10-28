# ViralGenHub browser extension: source package (Firefox Add-ons review)

This archive is the complete source of the ViralGenHub extension as submitted to
addons.mozilla.org. The submitted add-on is built from exactly these files with the
commands below; nothing is minified (`minify: false`), the build only compiles
TypeScript and bundles the few local modules into `background.js` and `bridge.js`.

Upstream: derived from the Postiz browser extension (AGPL-3.0); see NOTICE.md and LICENSE.
Public repository: https://github.com/ViralGenHub/viralgenhub (apps/extension).

## Requirements
- Any OS with a POSIX shell and `zip` (built on macOS 26; also works on Ubuntu 24.04).
- Node.js 20.19+ or 22.12+ (built with Node __NODE__), npm 10+ (built with npm __NPM__).
  Download: https://nodejs.org/en/download
- Only build dependency: Vite __VITE__ (exact version pinned in package-lock.json).

## Build
```
npm ci
npm run build:firefox
```
Output: `dist/` (the add-on files) and `extension-firefox.zip` (the uploaded package).
`npm run build:chromium` builds the Chrome Web Store / Edge Add-ons variant instead.

## What is in the add-on
- `src/background.ts` -> `background.js`: reads the two Skool sign-in cookies
  (client_id, auth_token) when app.viralgenhub.com asks, and refreshes them once a day.
- `src/bridge.ts` -> `bridge.js` (Firefox only): content script on app.viralgenhub.com
  that relays the page's window.postMessage requests to the background, because
  Firefox does not support externally_connectable for web pages.
- `scripts/write-manifest.mjs`: writes `dist/manifest.json` from `manifest.json`
  (Firefox: event-page background, the bridge content script, gecko ID and
  data_collection_permissions).
