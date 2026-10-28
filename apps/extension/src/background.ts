import { ExtensionRequest, GetCookiesResponse, ProviderInfo, StoredRefreshEntry } from './types/messages';
import { getAllProviders, getProvider } from './providers/provider.registry';
import { CookieProvider } from './providers/cookie-provider.interface';

// Injected at build time by vite.config.ts (see EXT_ENV). Production: only
// https://app.viralgenhub.com. The staging build also allows staging.
declare const __ALLOWED_ORIGINS__: string[];
// 'chromium' (Chrome Web Store, Edge Add-ons; also Opera/Brave/Vivaldi via the
// Chrome Web Store), 'firefox' (AMO) or 'safari' (Mac App Store, inside the
// apps/extension-safari app). Set by EXT_BROWSER, see vite.config.ts.
declare const __BROWSER__: 'chromium' | 'firefox' | 'safari';

// Firefox exposes the promise-based `browser` namespace; Chrome MV3 returns
// promises from `chrome.*`. Both have the same shape for the calls used here.
const ext: typeof chrome = (globalThis as any).browser ?? chrome;

// Read from the packaged manifest, so PING always reports the shipped version
// (1.0.1 still answered '1.0.0' from a hard-coded constant).
const EXTENSION_VERSION = ext.runtime.getManifest().version;
const REFRESH_ALARM_NAME = 'cookie-refresh';
const STORAGE_KEY = 'refreshEntries';

// sender.origin where the browser gives it, else the sender's page URL
// (Firefox content scripts); either way compare the bare origin.
function originOf(value: string | undefined): string {
  if (!value) return '';
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

function isOriginAllowed(origin: string | undefined): boolean {
  return __ALLOWED_ORIGINS__.includes(originOf(origin));
}

// Where the user re-allows site access, in this browser's own words.
function siteAccessHint(): string {
  if (__BROWSER__ === 'firefox') {
    return 'about:addons > ViralGenHub > Permissions';
  }
  if (__BROWSER__ === 'safari') {
    // Safari grants website access per site and can take it back at any time.
    return 'Safari > Settings > Extensions > ViralGenHub > Edit Websites: allow skool.com and app.viralgenhub.com';
  }
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/\bEdg\//.test(ua)) return 'edge://extensions > ViralGenHub > Details > Site access';
  if (/\bOPR\//.test(ua)) return 'opera://extensions > ViralGenHub > Details > Site access';
  return 'chrome://extensions > ViralGenHub > Details > Site access';
}

async function extractCookies(provider: CookieProvider): Promise<GetCookiesResponse> {
  const allCookies = await ext.cookies.getAll({ url: provider.url });

  const extracted: Record<string, string> = {};
  const missingRequired: string[] = [];

  for (const def of provider.cookies) {
    const found = allCookies.find((c) => c.name === def.name);
    if (found) {
      extracted[def.name] = found.value;
    } else if (def.required) {
      missingRequired.push(def.name);
    }
  }

  if (missingRequired.length > 0) {
    return {
      success: false,
      provider: provider.identifier,
      error: `Could not read your ${provider.name} sign-in (${missingRequired.join(', ')}). Sign in to ${provider.name} in this browser, and check the ViralGenHub extension is allowed on ${provider.name} (${siteAccessHint()}).`,
      missingCookies: missingRequired,
    };
  }

  return {
    success: true,
    provider: provider.identifier,
    cookies: extracted,
  };
}

// --- Refresh Token Storage Helpers ---

async function getStoredEntries(): Promise<Record<string, StoredRefreshEntry>> {
  const result = await ext.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || {};
}

async function setStoredEntries(entries: Record<string, StoredRefreshEntry>): Promise<void> {
  await ext.storage.local.set({ [STORAGE_KEY]: entries });
}

async function ensureAlarm(): Promise<void> {
  const existing = await ext.alarms.get(REFRESH_ALARM_NAME);
  if (!existing) {
    ext.alarms.create(REFRESH_ALARM_NAME, { periodInMinutes: 1440 });
  }
}

async function clearAlarmIfEmpty(): Promise<void> {
  const entries = await getStoredEntries();
  if (Object.keys(entries).length === 0) {
    await ext.alarms.clear(REFRESH_ALARM_NAME);
  }
}

// --- Background Cookie Refresh ---

async function refreshAllCookies(): Promise<void> {
  const entries = await getStoredEntries();
  for (const [integrationId, entry] of Object.entries(entries)) {
    try {
      const provider = getProvider(entry.provider);
      if (!provider) continue;

      const cookieResult = await extractCookies(provider);
      if (!cookieResult.success) continue;

      const base64Cookies = btoa(JSON.stringify(cookieResult.cookies));

      await fetch(`${entry.backendUrl}/integrations/extension-refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jwt: entry.jwt, cookies: base64Cookies }),
      });
    } catch {
      // Silently skip — will retry next cycle
    }
  }
}

// --- Alarm Listener ---

ext.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM_NAME) {
    refreshAllCookies();
  }
});

// --- Ensure alarm on startup ---

(async () => {
  const entries = await getStoredEntries();
  if (Object.keys(entries).length > 0) {
    await ensureAlarm();
  }
})();

// --- Message handling ---
// The page talks to the extension in two ways:
//  - Chromium and Safari: runtime.sendMessage(<extension id>, ...) from the page,
//    allowed by externally_connectable -> runtime.onMessageExternal. Safari's ID is
//    "<extension bundle id> (<team id>)" and it supports externally_connectable
//    matches (not ids) since Safari 15.4.
//  - Firefox: web pages cannot message an extension (externally_connectable is not
//    supported, https://bugzil.la/1319168). bridge.ts, a content script injected
//    only on the allowed origins, relays window.postMessage requests -> runtime.onMessage.
// Both paths run the same handler after the same origin check.

function handleMessage(
  message: ExtensionRequest,
  origin: string | undefined,
  sendResponse: (response: unknown) => void
): boolean {
  if (!isOriginAllowed(origin)) {
    sendResponse({ error: 'Unauthorized origin' });
    return true;
  }

  switch (message?.type) {
    case 'PING': {
      sendResponse({ status: 'ok', version: EXTENSION_VERSION });
      break;
    }

    case 'GET_PROVIDERS': {
      const providers = getAllProviders();
      const providerInfos: ProviderInfo[] = providers.map((p) => ({
        identifier: p.identifier,
        name: p.name,
        url: p.url,
        cookieNames: p.cookies.map((c) => c.name),
      }));
      sendResponse({ providers: providerInfos });
      break;
    }

    case 'GET_COOKIES': {
      const provider = getProvider(message.provider);
      if (!provider) {
        sendResponse({
          success: false,
          provider: message.provider,
          error: `Unknown provider: ${message.provider}`,
        });
        break;
      }

      extractCookies(provider)
        .then((result) => sendResponse(result))
        .catch((err) =>
          sendResponse({
            success: false,
            provider: message.provider,
            error: `Failed to extract cookies: ${err.message}`,
          })
        );

      return true;
    }

    case 'STORE_REFRESH_TOKEN': {
      // The refresh call sends the saved login token to backendUrl, so it may
      // only ever point at an origin this build trusts.
      let backendOrigin = '';
      try {
        backendOrigin = new URL(message.backendUrl).origin;
      } catch {
        // falls through to the check below
      }
      if (!__ALLOWED_ORIGINS__.includes(backendOrigin)) {
        sendResponse({ success: false, error: 'Untrusted backend URL' });
        break;
      }
      (async () => {
        const entries = await getStoredEntries();
        entries[message.integrationId] = {
          jwt: message.jwt,
          backendUrl: message.backendUrl,
          provider: message.provider,
        };
        await setStoredEntries(entries);
        await ensureAlarm();
        sendResponse({ success: true });
      })().catch(() => sendResponse({ success: false }));

      return true;
    }

    case 'REMOVE_REFRESH_TOKEN': {
      (async () => {
        const entries = await getStoredEntries();
        delete entries[message.integrationId];
        await setStoredEntries(entries);
        await clearAlarmIfEmpty();
        sendResponse({ success: true });
      })().catch(() => sendResponse({ success: false }));

      return true;
    }

    default: {
      sendResponse({ error: `Unknown message type: ${(message as any)?.type}` });
      break;
    }
  }

  return true;
}

if (__BROWSER__ === 'firefox') {
  // Only our own content script (bridge.ts) may use this path, and only from a
  // tab on an allowed origin.
  ext.runtime.onMessage.addListener(
    (
      message: ExtensionRequest,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response: unknown) => void
    ) => {
      if (sender.id !== ext.runtime.id || !sender.tab) {
        return false;
      }
      return handleMessage(message, sender.url, sendResponse);
    }
  );
} else {
  ext.runtime.onMessageExternal.addListener(
    (
      message: ExtensionRequest,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response: unknown) => void
    ) => handleMessage(message, sender.origin ?? sender.url, sendResponse)
  );
}
