#!/bin/sh
# Builds every store package for one version from a clean, self-contained copy of
# the extension source, so the Firefox package is reproducible from the source zip
# AMO asks for (https://extensionworkshop.com/documentation/publish/source-code-submission/).
#
#   sh scripts/make-release.sh <output dir>
#
# Writes to <output dir>:
#   viralgenhub-extension-<v>.zip                 Chrome Web Store + Microsoft Edge Add-ons
#   viralgenhub-extension-<v>-firefox.zip         Firefox Add-ons (AMO)
#   viralgenhub-extension-<v>-firefox-source.zip  AMO "source code" upload
# Needs node, npm, zip and network access to registry.npmjs.org.
set -eu
OUT=${1:?usage: make-release.sh <output dir>}
HERE=$(cd "$(dirname "$0")/.." && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
mkdir -p "$OUT"
OUT=$(cd "$OUT" && pwd)
VER=$(node -p "require('$HERE/package.json').version")
VITE=8.2.1
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

SRC="$TMP/viralgenhub-extension-$VER"
mkdir -p "$SRC/scripts"
cp -R "$HERE/src" "$HERE/public" "$SRC/"
cp "$HERE/manifest.json" "$HERE/vite.config.ts" "$HERE/NOTICE.md" "$SRC/"
cp "$HERE/scripts/write-manifest.mjs" "$SRC/scripts/"
cp "$ROOT/LICENSE" "$SRC/LICENSE"
sed -e "s/__NODE__/$(node --version)/" -e "s/__NPM__/$(npm --version)/" -e "s/__VITE__/$VITE/" \
  "$HERE/amo/README.md" > "$SRC/README.md"
cat > "$SRC/package.json" <<JSON
{
  "name": "viralgenhub-extension",
  "version": "$VER",
  "private": true,
  "license": "AGPL-3.0",
  "type": "module",
  "scripts": {
    "build:firefox": "rm -rf dist && EXT_BROWSER=firefox vite build && EXT_BROWSER=firefox node scripts/write-manifest.mjs && cd dist && zip -X -r ../extension-firefox.zip . -x '.*'",
    "build:chromium": "rm -rf dist && vite build && node scripts/write-manifest.mjs && cd dist && zip -X -r ../extension.zip . -x '.*'"
  },
  "devDependencies": {
    "vite": "$VITE"
  }
}
JSON
(cd "$SRC" && npm install --package-lock-only --ignore-scripts --no-audit --no-fund >/dev/null)
find "$SRC" -name '.DS_Store' -delete
(cd "$TMP" && rm -f "$OUT/viralgenhub-extension-$VER-firefox-source.zip" && \
  zip -X -q -r "$OUT/viralgenhub-extension-$VER-firefox-source.zip" "viralgenhub-extension-$VER")

# Build both variants from the source zip exactly as a reviewer would.
mkdir "$TMP/build"
(cd "$TMP/build" && unzip -q "$OUT/viralgenhub-extension-$VER-firefox-source.zip")
B="$TMP/build/viralgenhub-extension-$VER"
(cd "$B" && npm ci --ignore-scripts --no-audit --no-fund >/dev/null)
(cd "$B" && npm run -s build:firefox >/dev/null && cp extension-firefox.zip "$OUT/viralgenhub-extension-$VER-firefox.zip")
(cd "$B" && npm run -s build:chromium >/dev/null && cp extension.zip "$OUT/viralgenhub-extension-$VER.zip")

cd "$OUT"
for f in "viralgenhub-extension-$VER.zip" "viralgenhub-extension-$VER-firefox.zip" "viralgenhub-extension-$VER-firefox-source.zip"; do
  shasum -a 256 "$f"
done
