import {
  EARLY_STORAGE_KEY,
  EARLY_TTL_MS,
  decideEarlyIntent,
  peekEarlyIntent,
  searchWithoutEarly,
  stashEarlyIntent,
  takeEarlyIntent,
  validEarlyId,
} from './early.access.intent';

const memoryStore = () => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
};

describe('validEarlyId', () => {
  it.each(['tiktok-business', 'gmb', 'mastodon-custom', 'x', 'vk'])(
    'accepts provider identifier %s',
    (id) => expect(validEarlyId(id)).toBe(id)
  );

  it.each([
    '',
    'TikTok',
    'tiktok business',
    '../admin',
    'gmb?x=1',
    '<script>',
    'a'.repeat(41),
    'javascript:alert(1)',
    'reddit%20',
    null,
    undefined,
    42,
    ['reddit'],
  ])('rejects %p', (raw) => expect(validEarlyId(raw)).toBeNull());
});

describe('stash / take', () => {
  it('stores a valid id and takes it once', () => {
    const store = memoryStore();
    expect(stashEarlyIntent(store, 'reddit', 1000)).toBe('reddit');
    expect(peekEarlyIntent(store, 2000)).toBe('reddit');
    expect(takeEarlyIntent(store, 2000)).toBe('reddit');
    expect(takeEarlyIntent(store, 2000)).toBeNull();
  });

  it('never stores an invalid id', () => {
    const store = memoryStore();
    expect(stashEarlyIntent(store, '../evil', 1000)).toBeNull();
    expect(store.data.size).toBe(0);
  });

  it('expires after the TTL', () => {
    const store = memoryStore();
    stashEarlyIntent(store, 'vk', 0);
    expect(peekEarlyIntent(store, EARLY_TTL_MS)).toBeNull();
    expect(store.data.size).toBe(0);
  });

  it('drops tampered or corrupt storage', () => {
    const store = memoryStore();
    store.setItem(EARLY_STORAGE_KEY, JSON.stringify({ id: 'A B', at: 1 }));
    expect(peekEarlyIntent(store, 2)).toBeNull();
    store.setItem(EARLY_STORAGE_KEY, '{not json');
    expect(peekEarlyIntent(store, 2)).toBeNull();
    store.setItem(EARLY_STORAGE_KEY, JSON.stringify({ id: 'vk', at: 'x' }));
    expect(peekEarlyIntent(store, 2)).toBeNull();
  });

  it('survives storage that throws or is missing', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(stashEarlyIntent(broken, 'vk')).toBe('vk');
    expect(takeEarlyIntent(broken)).toBeNull();
    expect(takeEarlyIntent(undefined)).toBeNull();
  });
});

describe('decideEarlyIntent', () => {
  const social = [
    { identifier: 'tiktok' },
    { identifier: 'reddit', comingSoon: true },
    { identifier: 'vk', comingSoon: true, myRequest: 'requested' },
    { identifier: 'threads', preview: true, testerAccess: false },
    {
      identifier: 'pinterest',
      preview: true,
      testerAccess: false,
      myRequest: 'requested',
    },
    { identifier: 'whop', preview: true, testerAccess: true },
  ];

  it('opens the waitlist form for a coming-soon platform', () =>
    expect(decideEarlyIntent('reddit', social)).toEqual({
      kind: 'request',
      item: social[1],
    }));

  it('opens the tester form for a locked preview platform', () =>
    expect(decideEarlyIntent('threads', social).kind).toBe('request'));

  it('shows the status when the workspace already asked', () => {
    expect(decideEarlyIntent('vk', social).kind).toBe('status');
    expect(decideEarlyIntent('pinterest', social).kind).toBe('status');
  });

  it('points at the tile when the platform can be connected', () => {
    expect(decideEarlyIntent('tiktok', social).kind).toBe('connect');
    expect(decideEarlyIntent('whop', social).kind).toBe('connect');
  });

  it('ignores ids the server does not list, and invalid ids', () => {
    expect(decideEarlyIntent('myspace', social)).toEqual({ kind: 'none' });
    expect(decideEarlyIntent('Reddit', social)).toEqual({ kind: 'none' });
    expect(decideEarlyIntent(undefined, social)).toEqual({ kind: 'none' });
  });
});

describe('searchWithoutEarly', () => {
  it('removes only the early parameter', () => {
    expect(searchWithoutEarly('?early=reddit')).toBe('');
    expect(searchWithoutEarly('?onboarding=true&early=vk')).toBe(
      '?onboarding=true'
    );
    expect(searchWithoutEarly('')).toBe('');
  });
});
