#!/bin/sh
# Builds the Safari variant of the extension into the Xcode project that wraps it
# (apps/extension-safari/ViralGenHub, a Mac app made by Apple's
# safari-web-extension-packager), checks it, and builds the app unsigned.
#
#   sh scripts/make-safari.sh            production (app.viralgenhub.com only)
#   sh scripts/make-safari.sh --staging  also trusts staging.viralgenhub.com
#                                        (for local testing only; never upload it)
#
# Run it before every App Store archive, then commit the refreshed Resources.
# Signing, archiving and uploading are done in Xcode with the Talkiru team
# (ops repo: docs/launch/extension-safari.md).
# Needs node (with the repo's node_modules for vite) and Xcode 15 or later.
set -eu
HERE=$(cd "$(dirname "$0")/.." && pwd)
PROJ="$HERE/../extension-safari/ViralGenHub"
RES="$PROJ/ViralGenHub Extension/Resources"
cd "$HERE"
export PATH="$HERE/../../node_modules/.bin:$PATH"

if [ "${1:-}" = "--staging" ]; then
  npm run -s build:staging:safari
else
  npm run -s build:safari
fi
node scripts/simulate-build.mjs dist

# The Xcode project lists each resource file by name: the build must produce
# exactly the files it references, or the app ships without them.
want=$(cd dist && ls | sort | tr '\n' ' ')
have=$(cd "$RES" && ls | sort | tr '\n' ' ')
if [ "$want" != "$have" ]; then
  echo "FAIL: dist has [$want] but the Xcode project has [$have]."
  echo "Add or remove the files in Xcode (ViralGenHub Extension > Resources) first."
  exit 1
fi
cp dist/* "$RES/"

# Keep the app's version in step with the extension's (App Store shows it).
VER=$(node -p "require('./package.json').version")
sed -i '' -E "s/MARKETING_VERSION = [0-9.]+;/MARKETING_VERSION = $VER;/" "$PROJ/ViralGenHub.xcodeproj/project.pbxproj"

DD=$(mktemp -d)
trap 'rm -rf "$DD"' EXIT
xcodebuild -project "$PROJ/ViralGenHub.xcodeproj" -scheme ViralGenHub -configuration Release \
  -destination 'generic/platform=macOS' -derivedDataPath "$DD" CODE_SIGNING_ALLOWED=NO build \
  > "$DD/build.log" 2>&1 || { tail -40 "$DD/build.log"; echo "FAIL: xcodebuild"; exit 1; }
APPEX="$DD/Build/Products/Release/ViralGenHub.app/Contents/PlugIns/ViralGenHub Extension.appex/Contents/Resources"
cmp -s "$APPEX/manifest.json" dist/manifest.json || { echo "FAIL: built app has a different manifest.json"; exit 1; }
echo "Safari app $VER built (unsigned)$( [ "${1:-}" = "--staging" ] && echo ', STAGING build: run make-safari.sh again before archiving')."
