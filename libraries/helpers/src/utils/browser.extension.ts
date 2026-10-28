// The ViralGenHub browser extension (Skool connection) ships per store, and every
// store gives it a different ID:
//   chrome  - Chrome Web Store item ID (32 letters a-p). Opera, Brave and Vivaldi
//             install from the Chrome Web Store, so they use this ID too.
//   edge    - Microsoft Edge Add-ons item ID (also 32 letters a-p, but different).
//   firefox - AMO listing slug, only for the install link: Firefox pages cannot
//             message an extension by ID (no externally_connectable,
//             https://bugzil.la/1319168), so the Firefox build answers through a
//             content-script bridge on window.postMessage instead.
//   safari  - "<extension bundle id> (<team id>)", e.g.
//             "com.viralgenhub.extension.Extension (ABCDE12345)": the ID a Safari
//             page messages (externally_connectable, Safari 15.4+). The Safari
//             build lives in apps/extension-safari (a Mac app from the App Store).
//   safari-app - the Mac App Store app's numeric Apple ID (App Store Connect >
//             App Information), only for the install link.
//
// Config: EXTENSION_IDS="chrome:<id>,edge:<id>,firefox:<amo slug>,
// safari:<bundle id> (<team id>),safari-app:<apple id>" (any order, any subset).
// A bare value counts as chrome. The older EXTENSION_ID (Chrome) is still read,
// so existing deployments keep working unchanged.

export type ExtensionStore = 'chrome' | 'edge' | 'firefox' | 'safari';

export interface ExtensionTargets {
  chrome: string[];
  edge: string[];
  firefox: string[];
  safari: string[];
  // Mac App Store Apple ID of the app that carries the Safari extension
  safariApp: string[];
}

export type BrowserKind =
  | 'chrome' // Chrome and unbranded Chromium (incl. Brave, which looks like Chrome)
  | 'edge'
  | 'opera'
  | 'vivaldi'
  | 'firefox'
  | 'safari'
  | 'other';

const CHROMIUM_ID = /^[a-p]{32}$/;
const AMO_SLUG = /^[A-Za-z0-9._@{}-]{1,100}$/;

type TargetKey = keyof ExtensionTargets;

const validFor: Record<TargetKey, (v: string) => boolean> = {
  chrome: (v) => CHROMIUM_ID.test(v),
  edge: (v) => CHROMIUM_ID.test(v),
  firefox: (v) => AMO_SLUG.test(v),
  safari: (v) => /^[A-Za-z0-9.-]+ \([A-Z0-9]{10}\)$/.test(v),
  safariApp: (v) => /^[0-9]{6,12}$/.test(v),
};

export function emptyTargets(): ExtensionTargets {
  return { chrome: [], edge: [], firefox: [], safari: [], safariApp: [] };
}

export function parseExtensionIds(
  raw?: string | null,
  legacyChromeId?: string | null
): ExtensionTargets {
  const out = emptyTargets();
  const add = (store: TargetKey, value: string) => {
    const v = value.trim();
    if (v && validFor[store](v) && !out[store].includes(v)) {
      out[store].push(v);
    }
  };
  for (const part of (raw || '').split(',')) {
    const item = part.trim();
    if (!item) continue;
    const m = item.match(/^(chrome|edge|firefox|safari-app|safari)\s*:\s*(.+)$/i);
    if (m) {
      const key = m[1].toLowerCase();
      add(key === 'safari-app' ? 'safariApp' : (key as ExtensionStore), m[2]);
    } else {
      add('chrome', item);
    }
  }
  if (legacyChromeId) add('chrome', legacyChromeId);
  return out;
}

export function hasExtension(t: ExtensionTargets): boolean {
  return (
    t.chrome.length + t.edge.length + t.firefox.length + t.safari.length > 0
  );
}

export function detectBrowser(userAgent: string): BrowserKind {
  const ua = userAgent || '';
  if (/\bEdg(A|iOS)?\//.test(ua)) return 'edge';
  if (/\b(OPR|Opera)\//.test(ua)) return 'opera';
  if (/\bVivaldi\//.test(ua)) return 'vivaldi';
  if (/\b(Firefox|FxiOS)\//.test(ua)) return 'firefox';
  if (/\b(Chrome|Chromium|CriOS)\//.test(ua)) return 'chrome';
  if (/\bSafari\//.test(ua) && /\bVersion\//.test(ua)) return 'safari';
  return 'other';
}

export function browserLabel(b: BrowserKind): string {
  return {
    chrome: 'Chrome',
    edge: 'Microsoft Edge',
    opera: 'Opera',
    vivaldi: 'Vivaldi',
    firefox: 'Firefox',
    safari: 'Safari',
    other: 'this browser',
  }[b];
}

const uniq = (list: string[]) => list.filter((v, i) => list.indexOf(v) === i);

// IDs to try with runtime.sendMessage, most likely first. Edge can also install
// from the Chrome Web Store ("Allow extensions from other stores"), so it tries
// its own ID, then Chrome's. Firefox has none (bridge only).
export function messagingIds(t: ExtensionTargets, b: BrowserKind): string[] {
  switch (b) {
    case 'firefox':
      return [];
    case 'safari':
      return [...t.safari];
    case 'edge':
      return uniq([...t.edge, ...t.chrome]);
    default:
      return uniq([...t.chrome, ...t.edge]);
  }
}

export interface InstallTarget {
  store: ExtensionStore;
  storeName: string;
  url: string;
}

const chromeStore = (id: string): InstallTarget => ({
  store: 'chrome',
  storeName: 'Chrome Web Store',
  url: `https://chromewebstore.google.com/detail/${id}`,
});

// Where this browser installs the extension; null = not available for it yet.
export function installTarget(
  t: ExtensionTargets,
  b: BrowserKind
): InstallTarget | null {
  switch (b) {
    case 'firefox':
      return t.firefox[0]
        ? {
            store: 'firefox',
            storeName: 'Firefox Add-ons',
            url: `https://addons.mozilla.org/firefox/addon/${encodeURIComponent(
              t.firefox[0]
            )}/`,
          }
        : null;
    case 'edge':
      if (t.edge[0]) {
        return {
          store: 'edge',
          storeName: 'Microsoft Edge Add-ons',
          url: `https://microsoftedge.microsoft.com/addons/detail/${t.edge[0]}`,
        };
      }
      return t.chrome[0] ? chromeStore(t.chrome[0]) : null;
    case 'safari':
      // Only with a page-messaging ID too: an install the app cannot talk to
      // would not help.
      return t.safariApp[0] && t.safari[0]
        ? {
            store: 'safari',
            storeName: 'Mac App Store',
            url: `https://apps.apple.com/app/id${t.safariApp[0]}`,
          }
        : null;
    default:
      // Chrome, Brave, Opera, Vivaldi, other Chromium: Chrome Web Store.
      return t.chrome[0] ? chromeStore(t.chrome[0]) : null;
  }
}

// ---- Messaging -----------------------------------------------------------

export const BRIDGE_REQUEST = 'vgh-ext-request';
export const BRIDGE_RESPONSE = 'vgh-ext-response';

export interface RuntimeLike {
  lastError?: { message?: string } | undefined;
  // Chrome answers through the callback; Safari's promise-based `browser`
  // namespace documents the callback too, but may also return a promise.
  sendMessage(
    extensionId: string,
    message: unknown,
    callback: (response: any) => void
  ): void | PromiseLike<any>;
}

export interface BridgeWindowLike {
  location: { origin: string };
  postMessage(message: unknown, targetOrigin: string): void;
  addEventListener(type: 'message', listener: (e: any) => void): void;
  removeEventListener(type: 'message', listener: (e: any) => void): void;
}

export interface ExtensionClientOptions {
  // runtime.sendMessage from the page (Chromium, Safari); null when absent
  runtime?: RuntimeLike | null;
  ids: string[];
  // the page window, for the Firefox bridge; null to disable it
  bridge?: BridgeWindowLike | null;
  timeoutMs?: number;
  newId?: () => string;
}

export interface ExtensionClient {
  send<T = any>(message: unknown, timeoutMs?: number): Promise<T>;
}

export function createExtensionClient(
  opts: ExtensionClientOptions
): ExtensionClient {
  const defaultTimeout = opts.timeoutMs ?? 10000;
  const newId =
    opts.newId ||
    (() => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
  let preferred: string | null = null;

  const viaRuntime = (id: string, message: unknown, timeoutMs: number) =>
    new Promise<any>((resolve, reject) => {
      const runtime = opts.runtime!;
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      const timer = setTimeout(
        () => finish(() => reject(new Error('Extension did not answer'))),
        timeoutMs
      );
      const fail = (e: unknown) =>
        finish(() => reject(e instanceof Error ? e : new Error(String(e))));
      try {
        const returned = runtime.sendMessage(id, message, (response) => {
          const err = runtime.lastError;
          if (err || response === undefined) {
            fail(new Error(err?.message || 'Extension not reachable'));
          } else {
            finish(() => resolve(response));
          }
        });
        if (returned && typeof (returned as PromiseLike<any>).then === 'function') {
          (returned as PromiseLike<any>).then(
            (response) => {
              if (response !== undefined) finish(() => resolve(response));
            },
            fail
          );
        }
      } catch (e) {
        fail(e);
      }
    });

  const viaBridge = (message: unknown, timeoutMs: number) =>
    new Promise<any>((resolve, reject) => {
      const win = opts.bridge!;
      const id = newId();
      const done = () => {
        clearTimeout(timer);
        win.removeEventListener('message', onMessage);
      };
      const onMessage = (e: any) => {
        if (e?.source !== undefined && e.source !== win) return;
        if (e?.origin !== win.location.origin) return;
        const d = e?.data;
        if (!d || d.type !== BRIDGE_RESPONSE || d.id !== id) return;
        done();
        if (d.error) reject(new Error(String(d.error)));
        else resolve(d.response);
      };
      const timer = setTimeout(() => {
        done();
        reject(new Error('Extension not reachable'));
      }, timeoutMs);
      win.addEventListener('message', onMessage);
      win.postMessage(
        { type: BRIDGE_REQUEST, id, message },
        win.location.origin
      );
    });

  return {
    async send(message, timeoutMs = defaultTimeout) {
      if (opts.runtime && opts.ids.length) {
        const order = preferred
          ? [preferred, ...opts.ids.filter((i) => i !== preferred)]
          : opts.ids;
        let lastErr: unknown = new Error('Extension not reachable');
        for (const id of order) {
          try {
            const response = await viaRuntime(id, message, timeoutMs);
            preferred = id;
            return response;
          } catch (e) {
            lastErr = e;
          }
        }
        throw lastErr;
      }
      if (opts.bridge) {
        return viaBridge(message, timeoutMs);
      }
      throw new Error('Extension not reachable');
    },
  };
}
