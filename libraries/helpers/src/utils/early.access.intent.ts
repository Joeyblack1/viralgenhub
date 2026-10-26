// "Join the waitlist" deep links: the marketing site links every preview and
// coming-soon platform to /launches?early=<provider identifier>. The app keeps
// that intent across sign-up / log-in (in localStorage, because email
// activation opens a new tab) and, back on the calendar, opens the Add Channel
// dialog for that platform once. Nothing here submits anything: the user still
// clicks the button in the dialog.
//
// Pure functions so they can be unit-tested without a browser.

export const EARLY_PARAM = 'early';
export const EARLY_STORAGE_KEY = 'vgh_early_intent';
// Long enough to sign up, wait for the activation email and come back.
export const EARLY_TTL_MS = 24 * 60 * 60 * 1000;

const EARLY_ID = /^[a-z0-9-]{1,40}$/;

// A provider identifier as it appears in socialIntegrationList, or null.
export const validEarlyId = (raw: unknown): string | null =>
  typeof raw === 'string' && EARLY_ID.test(raw) ? raw : null;

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// Storage can be missing or throw (private mode, blocked site data).
const safe = <T>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

// window.localStorage, or undefined on the server or when the browser blocks
// site data (merely reading the property can throw there).
export const browserStore = (): KeyValueStore | undefined =>
  safe(
    () => (typeof window === 'undefined' ? undefined : window.localStorage),
    undefined
  );

export const stashEarlyIntent = (
  store: KeyValueStore | undefined,
  raw: unknown,
  now = Date.now()
): string | null => {
  const id = validEarlyId(raw);
  if (!id || !store) {
    return null;
  }
  safe(
    () => store.setItem(EARLY_STORAGE_KEY, JSON.stringify({ id, at: now })),
    undefined
  );
  return id;
};

export const peekEarlyIntent = (
  store: KeyValueStore | undefined,
  now = Date.now()
): string | null => {
  if (!store) {
    return null;
  }
  const raw = safe(() => store.getItem(EARLY_STORAGE_KEY), null);
  if (!raw) {
    return null;
  }
  const parsed = safe(() => JSON.parse(raw), null) as {
    id?: unknown;
    at?: unknown;
  } | null;
  const id = validEarlyId(parsed?.id);
  const at = typeof parsed?.at === 'number' ? parsed.at : NaN;
  if (!id || !(now - at >= 0 && now - at < EARLY_TTL_MS)) {
    clearEarlyIntent(store);
    return null;
  }
  return id;
};

export const clearEarlyIntent = (store: KeyValueStore | undefined) => {
  if (store) {
    safe(() => store.removeItem(EARLY_STORAGE_KEY), undefined);
  }
};

// Read and clear in one go, so the intent is acted on once.
export const takeEarlyIntent = (
  store: KeyValueStore | undefined,
  now = Date.now()
): string | null => {
  const id = peekEarlyIntent(store, now);
  clearEarlyIntent(store);
  return id;
};

export interface EarlyIntentTile {
  identifier: string;
  preview?: boolean;
  testerAccess?: boolean;
  comingSoon?: boolean;
  myRequest?: string;
}

export type EarlyIntentAction<T extends EarlyIntentTile> =
  // locked platform, nothing asked yet: the request / waitlist form
  | { kind: 'request'; item: T }
  // locked platform this workspace already asked for: show where it stands
  | { kind: 'status'; item: T }
  // live, or a preview this workspace may already connect: point at the tile
  | { kind: 'connect'; item: T }
  // not a platform this server offers: do nothing
  | { kind: 'none' };

// `social` is the list the Add Channel dialog shows (/integrations plus
// /integrations/preview), so only identifiers the server lists can act.
export const decideEarlyIntent = <T extends EarlyIntentTile>(
  raw: unknown,
  social: T[]
): EarlyIntentAction<T> => {
  const id = validEarlyId(raw);
  const item = id ? social.find((p) => p.identifier === id) : undefined;
  if (!item) {
    return { kind: 'none' };
  }
  const locked =
    !!item.comingSoon || (!!item.preview && item.testerAccess === false);
  if (!locked) {
    return { kind: 'connect', item };
  }
  return item.myRequest ? { kind: 'status', item } : { kind: 'request', item };
};

// The query string without `early`, for router.replace after it is captured.
export const searchWithoutEarly = (search: string) => {
  const params = new URLSearchParams(search);
  params.delete(EARLY_PARAM);
  const rest = params.toString();
  return rest ? `?${rest}` : '';
};
