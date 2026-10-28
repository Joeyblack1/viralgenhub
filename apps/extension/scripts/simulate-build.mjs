// Runs a built extension's background.js in Node with a fake browser API and
// checks the page-facing behaviour, without a real browser:
//   node scripts/simulate-build.mjs [dist]      (default: dist)
// Works for the Chromium and Safari builds (page -> runtime.onMessageExternal).
// The Firefox build talks through bridge.js instead and is not covered here.
// Exit 0 only when every check passes.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const dist = path.resolve(process.argv[2] || 'dist');
const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.json'), 'utf8'));
const code = fs.readFileSync(path.join(dist, 'background.js'), 'utf8');
const isSafari = !!manifest.browser_specific_settings?.safari;
let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
  if (!ok) failed++;
};

check('manifest is MV3', manifest.manifest_version === 3);
check('externally_connectable matches app origin',
  (manifest.externally_connectable?.matches || []).includes('https://app.viralgenhub.com/*'));
check('no externally_connectable ids (Safari does not support them)', !manifest.externally_connectable?.ids);
if (isSafari) {
  check('Safari: background page, no service worker',
    Array.isArray(manifest.background?.scripts) && !manifest.background.service_worker);
  check('Safari: no "persistent" key (MV3 pages are non-persistent)', !('persistent' in manifest.background));
  check('Safari: no bridge.js', !fs.existsSync(path.join(dist, 'bridge.js')));
  for (const s of ['48', '96', '128', '256', '512']) {
    check(`Safari: icon ${s}`, !!manifest.icons[s] && fs.existsSync(path.join(dist, manifest.icons[s])));
  }
}
check('background.js has no import/export (loads as a classic script)', !/^\s*(import|export)\s/m.test(code));

// ---- fake browser API ----
const cookieJar = [
  { name: 'client_id', value: 'cid-123', domain: '.skool.com' },
  { name: 'auth_token', value: 'tok-456', domain: '.skool.com' },
  { name: 'other', value: 'nope', domain: '.skool.com' },
];
const store = {};
const alarms = {};
let externalListener = null;
let internalListener = null;
const fetches = [];
const api = {
  runtime: {
    id: 'self',
    getManifest: () => manifest,
    onMessageExternal: { addListener: (f) => (externalListener = f) },
    onMessage: { addListener: (f) => (internalListener = f) },
  },
  cookies: { getAll: async () => cookieJar.map((c) => ({ ...c })) },
  storage: {
    local: {
      get: async (k) => ({ [k]: store[k] }),
      set: async (o) => Object.assign(store, o),
    },
  },
  alarms: {
    get: async (n) => alarms[n],
    create: (n, o) => (alarms[n] = o),
    clear: async (n) => delete alarms[n],
    onAlarm: { addListener: () => {} },
  },
};
const ctx = vm.createContext({
  browser: api,
  chrome: api,
  navigator: {
    userAgent: isSafari
      ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
      : 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  },
  fetch: async (url, init) => (fetches.push({ url, init }), { ok: true }),
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  URL,
  console,
});
vm.runInContext(code, ctx, { filename: 'background.js' });
check('onMessageExternal listener registered', typeof externalListener === 'function');
check('no onMessage listener (bridge path is Firefox only)', internalListener === null);

const send = (message, sender) =>
  new Promise((resolve) => {
    const keep = externalListener(message, sender, resolve);
    if (keep !== true) resolve(undefined);
  });
// Safari gives sender.url (and may omit origin); Chromium gives origin.
const page = isSafari
  ? { url: 'https://app.viralgenhub.com/launches' }
  : { origin: 'https://app.viralgenhub.com', url: 'https://app.viralgenhub.com/launches' };

const ping = await send({ type: 'PING' }, page);
check('PING answers with the manifest version', ping?.status === 'ok' && ping.version === manifest.version, JSON.stringify(ping));
const cookies = await send({ type: 'GET_COOKIES', provider: 'skool' }, page);
check('GET_COOKIES returns only the two Skool sign-in cookies',
  cookies?.success === true && JSON.stringify(Object.keys(cookies.cookies).sort()) === '["auth_token","client_id"]',
  JSON.stringify(cookies && Object.keys(cookies.cookies || {})));
const foreign = await send({ type: 'PING' }, { url: 'https://evil.example/x', origin: 'https://evil.example' });
check('another origin is refused', foreign?.error === 'Unauthorized origin');
const lookalike = await send({ type: 'PING' }, { url: 'https://app.viralgenhub.com.evil.example/' });
check('look-alike origin is refused', lookalike?.error === 'Unauthorized origin');
const untrusted = await send({ type: 'STORE_REFRESH_TOKEN', provider: 'skool', integrationId: 'i1', jwt: 'j', backendUrl: 'https://evil.example/api' }, page);
check('refresh URL on another origin is refused', untrusted?.success === false && Object.keys(store).length === 0);
const trusted = await send({ type: 'STORE_REFRESH_TOKEN', provider: 'skool', integrationId: 'i1', jwt: 'j', backendUrl: 'https://app.viralgenhub.com/api' }, page);
check('refresh entry stored for the app origin and alarm set', trusted?.success === true && !!alarms['cookie-refresh']);
const removed = await send({ type: 'REMOVE_REFRESH_TOKEN', integrationId: 'i1' }, page);
check('refresh entry removed and alarm cleared', removed?.success === true && !alarms['cookie-refresh']);

cookieJar.length = 0;
const missing = await send({ type: 'GET_COOKIES', provider: 'skool' }, page);
const hint = isSafari ? 'Safari > Settings > Extensions' : 'chrome://extensions';
check(`signed-out error names ${isSafari ? 'Safari' : 'Chrome'} settings`,
  missing?.success === false && String(missing.error).includes(hint), missing?.error);

console.log(failed ? `${failed} check(s) FAILED` : 'all checks passed');
process.exit(failed ? 1 : 0);
