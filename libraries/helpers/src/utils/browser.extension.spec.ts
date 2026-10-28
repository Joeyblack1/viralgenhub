import {
  BRIDGE_REQUEST,
  BRIDGE_RESPONSE,
  BridgeWindowLike,
  createExtensionClient,
  detectBrowser,
  hasExtension,
  installTarget,
  messagingIds,
  parseExtensionIds,
  RuntimeLike,
} from './browser.extension';

const CHROME = 'coagigbelglppjcbopmeaapehmgjbffe';
const EDGE = 'abcdefghijklmnopabcdefghijklmnop';

const UA = {
  chrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
  opera:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 OPR/125.0.0.0',
  firefox:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:144.0) Gecko/20100101 Firefox/144.0',
  safari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
};

describe('parseExtensionIds', () => {
  it('keeps the old single EXTENSION_ID working as the Chrome ID', () => {
    const t = parseExtensionIds('', CHROME);
    expect(t.chrome).toEqual([CHROME]);
    expect(t.edge).toEqual([]);
    expect(hasExtension(t)).toBe(true);
  });

  it('reads prefixed per-store values, in any order, with spaces', () => {
    const t = parseExtensionIds(
      ` edge:${EDGE} , CHROME : ${CHROME},firefox:viralgenhub `,
      ''
    );
    expect(t).toEqual({
      chrome: [CHROME],
      edge: [EDGE],
      firefox: ['viralgenhub'],
      safari: [],
      safariApp: [],
    });
  });

  it('treats a bare ID as Chrome and does not duplicate EXTENSION_ID', () => {
    expect(parseExtensionIds(CHROME, CHROME).chrome).toEqual([CHROME]);
  });

  it('drops malformed values instead of trusting them', () => {
    const t = parseExtensionIds(
      'chrome:not-an-id,edge:ABCDEFGHIJKLMNOPABCDEFGHIJKLMNOP,firefox:has space,unknown:x,safari:nope',
      'zzzz'
    );
    expect(hasExtension(t)).toBe(false);
  });

  it('accepts a Safari "bundle (team)" identifier', () => {
    expect(
      parseExtensionIds('safari:com.viralgenhub.Extension (ABCDE12345)').safari
    ).toEqual(['com.viralgenhub.Extension (ABCDE12345)']);
  });

  it('reads the Mac App Store app ID for the Safari install link', () => {
    const t = parseExtensionIds(
      'safari:com.viralgenhub.extension.Extension (ABCDE12345), Safari-App: 6740000000,safari-app:not-a-number'
    );
    expect(t.safari).toEqual(['com.viralgenhub.extension.Extension (ABCDE12345)']);
    expect(t.safariApp).toEqual(['6740000000']);
    expect(t.chrome).toEqual([]);
  });

  it('is empty when nothing is set', () => {
    expect(hasExtension(parseExtensionIds(undefined, undefined))).toBe(false);
  });
});

describe('detectBrowser', () => {
  it.each(Object.entries(UA))('%s', (name, ua) => {
    expect(detectBrowser(ua)).toBe(name);
  });
  it('unknown agents are other', () => {
    expect(detectBrowser('curl/8')).toBe('other');
    expect(detectBrowser('')).toBe('other');
  });
});

describe('messagingIds and installTarget', () => {
  const both = parseExtensionIds(`chrome:${CHROME},edge:${EDGE},firefox:viralgenhub`);
  const chromeOnly = parseExtensionIds('', CHROME);

  it('Chrome tries the Chrome ID first and links the Chrome Web Store', () => {
    expect(messagingIds(both, 'chrome')).toEqual([CHROME, EDGE]);
    expect(installTarget(both, 'chrome')?.url).toBe(
      `https://chromewebstore.google.com/detail/${CHROME}`
    );
  });

  it('Edge tries its own ID first and links Edge Add-ons', () => {
    expect(messagingIds(both, 'edge')).toEqual([EDGE, CHROME]);
    expect(installTarget(both, 'edge')).toEqual({
      store: 'edge',
      storeName: 'Microsoft Edge Add-ons',
      url: `https://microsoftedge.microsoft.com/addons/detail/${EDGE}`,
    });
  });

  it('Edge falls back to the Chrome Web Store until the Edge item exists', () => {
    expect(installTarget(chromeOnly, 'edge')?.store).toBe('chrome');
    expect(messagingIds(chromeOnly, 'edge')).toEqual([CHROME]);
  });

  it('Opera, Vivaldi and other Chromium browsers use the Chrome Web Store', () => {
    for (const b of ['opera', 'vivaldi', 'other'] as const) {
      expect(installTarget(both, b)?.store).toBe('chrome');
    }
  });

  it('Firefox never messages by ID and links AMO only once listed', () => {
    expect(messagingIds(both, 'firefox')).toEqual([]);
    expect(installTarget(both, 'firefox')?.url).toBe(
      'https://addons.mozilla.org/firefox/addon/viralgenhub/'
    );
    expect(installTarget(chromeOnly, 'firefox')).toBeNull();
  });

  it('Safari has no install target until both Safari values are set', () => {
    expect(installTarget(both, 'safari')).toBeNull();
    expect(
      installTarget(parseExtensionIds('safari-app:6740000000'), 'safari')
    ).toBeNull();
  });

  it('Safari messages its bundle ID and links the Mac App Store', () => {
    const safari = parseExtensionIds(
      `chrome:${CHROME},safari:com.viralgenhub.extension.Extension (ABCDE12345),safari-app:6740000000`
    );
    expect(messagingIds(safari, 'safari')).toEqual([
      'com.viralgenhub.extension.Extension (ABCDE12345)',
    ]);
    expect(installTarget(safari, 'safari')).toEqual({
      store: 'safari',
      storeName: 'Mac App Store',
      url: 'https://apps.apple.com/app/id6740000000',
    });
    // Chrome users still get the Chrome Web Store
    expect(installTarget(safari, 'chrome')?.store).toBe('chrome');
  });
});

// ---- messaging ----

function fakeRuntime(installed: Record<string, (msg: any) => any>) {
  const calls: string[] = [];
  const rt: RuntimeLike & { calls: string[] } = {
    calls,
    lastError: undefined,
    sendMessage(id, msg, cb) {
      calls.push(id);
      setTimeout(() => {
        if (installed[id]) {
          rt.lastError = undefined;
          cb(installed[id](msg));
        } else {
          rt.lastError = { message: 'Could not establish connection.' };
          cb(undefined);
          rt.lastError = undefined;
        }
      }, 0);
    },
  };
  return rt;
}

function fakeWindow(origin: string) {
  const listeners = new Set<(e: any) => void>();
  const posted: any[] = [];
  const win: BridgeWindowLike & {
    posted: any[];
    emit: (data: any, from?: string) => void;
    listenerCount: () => number;
  } = {
    location: { origin },
    posted,
    postMessage(message, targetOrigin) {
      posted.push({ message, targetOrigin });
    },
    addEventListener(_t, l) {
      listeners.add(l);
    },
    removeEventListener(_t, l) {
      listeners.delete(l);
    },
    emit(data, from = origin) {
      for (const l of [...listeners]) l({ source: win, origin: from, data });
    },
    listenerCount: () => listeners.size,
  };
  return win;
}

describe('createExtensionClient: runtime (Chromium)', () => {
  it('finds the installed ID, then goes straight to it', async () => {
    const rt = fakeRuntime({ [CHROME]: () => ({ status: 'ok', version: '1.0.2' }) });
    const client = createExtensionClient({ runtime: rt, ids: [EDGE, CHROME] });
    await expect(client.send({ type: 'PING' })).resolves.toEqual({
      status: 'ok',
      version: '1.0.2',
    });
    expect(rt.calls).toEqual([EDGE, CHROME]);
    await client.send({ type: 'PING' });
    expect(rt.calls).toEqual([EDGE, CHROME, CHROME]);
  });

  it('rejects when no known ID answers', async () => {
    const client = createExtensionClient({
      runtime: fakeRuntime({}),
      ids: [CHROME],
    });
    await expect(client.send({ type: 'PING' })).rejects.toThrow(
      'Could not establish connection.'
    );
  });

  it('times out a silent extension', async () => {
    const rt: RuntimeLike = { sendMessage: () => undefined };
    const client = createExtensionClient({ runtime: rt, ids: [CHROME] });
    await expect(client.send({ type: 'PING' }, 20)).rejects.toThrow(
      'Extension did not answer'
    );
  });

  it('a synchronous throw (bad ID in old Chrome) moves on to the next ID', async () => {
    const good = fakeRuntime({ [CHROME]: () => ({ ok: 1 }) });
    const rt: RuntimeLike = {
      get lastError() {
        return good.lastError;
      },
      sendMessage(id, msg, cb) {
        if (id === EDGE) throw new Error('Invalid extension id');
        good.sendMessage(id, msg, cb);
      },
    };
    const client = createExtensionClient({ runtime: rt, ids: [EDGE, CHROME] });
    await expect(client.send({ type: 'X' })).resolves.toEqual({ ok: 1 });
  });
});

describe('createExtensionClient: runtime (Safari)', () => {
  const SAFARI = 'com.viralgenhub.extension.Extension (ABCDE12345)';

  it('takes the answer from a returned promise when the callback stays silent', async () => {
    const rt: RuntimeLike = {
      sendMessage: (id, msg: any) =>
        Promise.resolve(id === SAFARI ? { status: 'ok', echo: msg.type } : undefined),
    };
    const client = createExtensionClient({ runtime: rt, ids: [SAFARI] });
    await expect(client.send({ type: 'PING' }, 200)).resolves.toEqual({
      status: 'ok',
      echo: 'PING',
    });
  });

  it('answers once when both the callback and the promise answer', async () => {
    let calls = 0;
    const rt: RuntimeLike = {
      sendMessage: (_id, _msg, cb) => {
        calls++;
        cb({ via: 'callback' });
        return Promise.resolve({ via: 'promise' });
      },
    };
    const client = createExtensionClient({ runtime: rt, ids: [SAFARI] });
    await expect(client.send({ type: 'PING' })).resolves.toEqual({ via: 'callback' });
    expect(calls).toBe(1);
  });

  it('a rejected promise (extension gone) is a failure, not a hang', async () => {
    const rt: RuntimeLike = {
      sendMessage: () => Promise.reject(new Error('Invalid extension identifier')),
    };
    const client = createExtensionClient({ runtime: rt, ids: [SAFARI] });
    await expect(client.send({ type: 'PING' }, 5000)).rejects.toThrow(
      'Invalid extension identifier'
    );
  });
});

describe('createExtensionClient: bridge (Firefox)', () => {
  const origin = 'https://app.viralgenhub.com';

  it('posts a request to its own origin and resolves the matching answer', async () => {
    const win = fakeWindow(origin);
    const client = createExtensionClient({
      runtime: null,
      ids: [],
      bridge: win,
      newId: () => 'r1',
    });
    const p = client.send({ type: 'GET_COOKIES', provider: 'skool' });
    expect(win.posted).toEqual([
      {
        message: {
          type: BRIDGE_REQUEST,
          id: 'r1',
          message: { type: 'GET_COOKIES', provider: 'skool' },
        },
        targetOrigin: origin,
      },
    ]);
    // ignored: other id, other origin, other type
    win.emit({ type: BRIDGE_RESPONSE, id: 'other', response: 1 });
    win.emit({ type: BRIDGE_RESPONSE, id: 'r1', response: 2 }, 'https://evil.example');
    win.emit({ type: BRIDGE_REQUEST, id: 'r1', message: {} });
    win.emit({ type: BRIDGE_RESPONSE, id: 'r1', response: { success: true } });
    await expect(p).resolves.toEqual({ success: true });
    expect(win.listenerCount()).toBe(0);
  });

  it('passes the extension error through', async () => {
    const win = fakeWindow(origin);
    const client = createExtensionClient({ ids: [], bridge: win, newId: () => 'r2' });
    const p = client.send({ type: 'PING' });
    win.emit({ type: BRIDGE_RESPONSE, id: 'r2', error: 'Unauthorized origin' });
    await expect(p).rejects.toThrow('Unauthorized origin');
  });

  it('times out when no extension is installed and cleans up', async () => {
    const win = fakeWindow(origin);
    const client = createExtensionClient({ ids: [], bridge: win });
    await expect(client.send({ type: 'PING' }, 20)).rejects.toThrow(
      'Extension not reachable'
    );
    expect(win.listenerCount()).toBe(0);
  });

  it('uses the bridge when the page has runtime but no configured ID', async () => {
    const win = fakeWindow(origin);
    const rt = fakeRuntime({});
    const client = createExtensionClient({
      runtime: rt,
      ids: [],
      bridge: win,
      newId: () => 'r3',
    });
    const p = client.send({ type: 'PING' });
    win.emit({ type: BRIDGE_RESPONSE, id: 'r3', response: { status: 'ok' } });
    await expect(p).resolves.toEqual({ status: 'ok' });
    expect(rt.calls).toEqual([]);
  });

  it('with neither path it fails at once', async () => {
    await expect(
      createExtensionClient({ ids: [CHROME] }).send({ type: 'PING' })
    ).rejects.toThrow('Extension not reachable');
  });
});
