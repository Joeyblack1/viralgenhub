// Writes dist/manifest.json from manifest.json.
//   EXT_ENV=staging      adds the staging origin and a visible name suffix.
//   EXT_BROWSER=firefox  writes the AMO (Firefox) variant, see below.
// Production Chromium (Chrome Web Store + Edge Add-ons) is manifest.json as is.
import fs from 'node:fs';

const m = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const browser = process.env.EXT_BROWSER === 'firefox' ? 'firefox' : 'chromium';
const staging = process.env.EXT_ENV === 'staging';

if (m.version !== pkg.version) {
  console.error(`manifest.json version ${m.version} != package.json version ${pkg.version}`);
  process.exit(1);
}

// Each provider's hostPermission must be covered by manifest.json. 1.0.0 shipped with
// www.skool.com only while Skool sets its sign-in cookies on skool.com, so every connect failed.
const hostOf = (pattern) => pattern.split('://')[1].split('/')[0];
for (const f of fs.readdirSync('src/providers/list')) {
  const src = fs.readFileSync(`src/providers/list/${f}`, 'utf8');
  const want = src.match(/hostPermission:\s*'([^']+)'/)?.[1];
  if (want && !m.host_permissions.some((h) => hostOf(h) === hostOf(want))) {
    console.error(`${f}: manifest.json host_permissions must cover ${want}`);
    process.exit(1);
  }
}
if (staging) {
  m.name = 'ViralGenHub (staging)';
  m.host_permissions.push('https://staging.viralgenhub.com/*');
  m.externally_connectable.matches.push('https://staging.viralgenhub.com/*');
}

if (browser === 'firefox') {
  // Firefox MV3 differences (docs/launch/extension-other-browsers.md in the ops repo):
  // - background.service_worker is not supported; an event page runs background.js.
  //   background.js has no import/export, so it loads as a classic script.
  // - externally_connectable (web page -> extension) is not supported; the bridge
  //   content script on the same app origins replaces it.
  // - AMO needs a stable add-on ID and, for new add-ons since 3 Nov 2025, the
  //   built-in data consent (data_collection_permissions, Firefox 140+).
  const appMatches = m.externally_connectable.matches;
  delete m.externally_connectable;
  m.background = { scripts: ['background.js'] };
  m.content_scripts = [
    { matches: appMatches, js: ['bridge.js'], run_at: 'document_start' },
  ];
  m.browser_specific_settings = {
    gecko: {
      id: staging ? 'extension-staging@viralgenhub.com' : 'extension@viralgenhub.com',
      strict_min_version: '140.0',
      data_collection_permissions: {
        // The Skool sign-in cookies, sent to ViralGenHub at the user's request.
        required: ['authenticationInfo'],
      },
    },
    // Android only got data_collection_permissions in 142 (web-ext lint warns otherwise).
    // Not tested on Android: leave Android unticked on AMO until it is.
    gecko_android: { strict_min_version: '142.0' },
  };
  if (!fs.existsSync('dist/bridge.js')) {
    console.error('dist/bridge.js missing: build with EXT_BROWSER=firefox');
    process.exit(1);
  }
} else if (fs.existsSync('dist/bridge.js')) {
  console.error('dist/bridge.js present in a Chromium build: rebuild without EXT_BROWSER=firefox');
  process.exit(1);
}

fs.writeFileSync('dist/manifest.json', JSON.stringify(m, null, 2) + '\n');
console.log(`manifest written (${browser}, ${staging ? 'staging' : 'production'})`);
