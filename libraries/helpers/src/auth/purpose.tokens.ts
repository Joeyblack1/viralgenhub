import { sign, verify } from 'jsonwebtoken';

// ViralGenHub: the rules for every JWT the server signs for a user.
// Purpose tokens (this half of the file): every token that is not a login
// session carries a single `purpose` and expires: emailed links (account
// activation, password reset), team-invite links and the subscription-change
// token of the public API. Session tokens never have `purpose`, and the auth
// middleware refuses any token that does, so none of these can be used as a
// login, and a session can never be used as a reset link, an invite or a plan
// change. The session rules (30-day life, tokenVersion revocation) are at the
// bottom.
export type TokenPurpose =
  | 'activate'
  | 'reset'
  | 'invite'
  | 'modify-subscription';

// Invite and subscription tokens were plain server-signed JWTs (no `purpose`)
// before security release S2. Those still in flight at the deploy are accepted
// until this date; after it only purpose-bearing tokens pass. Invite links
// live 2 days and a plan change is applied within minutes, so a week covers
// every token signed before the change.
export const LEGACY_NO_PURPOSE_UNTIL = new Date('2026-11-07T00:00:00Z');

export const PURPOSES: Record<
  TokenPurpose,
  {
    // how long a token signed here lives
    ttl: string;
    // the claim a token must carry to be about anything at all
    subject: string;
    // accept a pre-S2 token without `purpose` until this date
    legacyUntil?: Date;
  }
> = {
  activate: { ttl: '72h', subject: 'id' },
  reset: { ttl: '20m', subject: 'id' },
  invite: { ttl: '2d', subject: 'id', legacyUntil: LEGACY_NO_PURPOSE_UNTIL },
  'modify-subscription': {
    ttl: '1h',
    subject: 'orgId',
    legacyUntil: LEGACY_NO_PURPOSE_UNTIL,
  },
};

export const signPurposeToken = <T extends object>(
  purpose: TokenPurpose,
  data: T
) =>
  sign({ ...data, purpose }, process.env.JWT_SECRET!, {
    expiresIn: PURPOSES[purpose].ttl,
  } as any);

// A token with no `purpose` at all, signed before the purpose claim existed
// for this use, inside the grace window. Both the clock and the token's own
// issue time must be inside it, so nothing minted later ever qualifies.
const isLegacyWithoutPurpose = (
  payload: Record<string, unknown>,
  legacyUntil: Date | undefined,
  now: number
) =>
  !!legacyUntil &&
  !('purpose' in payload) &&
  now < legacyUntil.getTime() &&
  (typeof payload.iat !== 'number' || payload.iat * 1000 < legacyUntil.getTime());

// Returns the payload (without the purpose / iat / exp bookkeeping) only if the
// signature is valid, it has not expired, it was issued for this purpose and
// it names its subject. Otherwise null.
export const verifyPurposeToken = <
  T extends object = { id: string; email?: string }
>(
  token: string,
  purpose: TokenPurpose,
  now = Date.now()
): T | null => {
  try {
    const payload = verify(token, process.env.JWT_SECRET!) as any;
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    const { subject, legacyUntil } = PURPOSES[purpose];
    if (
      payload.purpose !== purpose &&
      !isLegacyWithoutPurpose(payload, legacyUntil, now)
    ) {
      return null;
    }
    if (typeof payload[subject] !== 'string' || !payload[subject]) {
      return null;
    }
    const { purpose: _purpose, iat: _iat, exp: _exp, ...data } = payload;
    return data as T;
  } catch {
    return null;
  }
};

export const isPurposeToken = (payload: unknown) =>
  !!payload && typeof payload === 'object' && 'purpose' in (payload as object);

// Login sessions. The cookie and the JWT inside it expire together after 30
// days (sessions signed before S2 carry no exp and live until the user's
// tokenVersion moves). The JWT carries the user's tokenVersion at sign time;
// a password reset or account deletion bumps the column, and every token
// signed before the bump is refused. A token without the claim was signed
// before the column existed and counts as version 0, so existing sessions
// keep working until that user's version first moves.
export const AUTH_SESSION_TTL = '30d';
export const AUTH_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const sessionTokenVersion = (payload: unknown) => {
  const claim = (payload as { tokenVersion?: unknown } | null)?.tokenVersion;
  return typeof claim === 'number' && Number.isInteger(claim) && claim >= 0
    ? claim
    : 0;
};

export const isSessionTokenRevoked = (
  payload: unknown,
  currentVersion: number | null | undefined
) => sessionTokenVersion(payload) < (currentVersion || 0);
