import { sign, verify } from 'jsonwebtoken';

// ViralGenHub: emailed links (account activation, password reset) carry a
// single-purpose, expiring token. Session tokens never have `purpose`, and the
// auth middleware refuses any token that does, so an emailed link can never
// be used as a login, and a session can never be used as a reset link.
export type TokenPurpose = 'activate' | 'reset';

export const PURPOSE_TTL: Record<TokenPurpose, string> = {
  activate: '72h',
  reset: '20m',
};

export const signPurposeToken = (
  purpose: TokenPurpose,
  data: { id: string; email?: string }
) =>
  sign({ ...data, purpose }, process.env.JWT_SECRET!, {
    expiresIn: PURPOSE_TTL[purpose],
  } as any);

// Returns the payload only if the signature is valid, it has not expired and
// it was issued for this purpose. Otherwise null.
export const verifyPurposeToken = (
  token: string,
  purpose: TokenPurpose
): { id: string; email?: string } | null => {
  try {
    const payload = verify(token, process.env.JWT_SECRET!) as any;
    if (!payload || payload.purpose !== purpose || !payload.id) {
      return null;
    }
    return { id: payload.id, email: payload.email };
  } catch {
    return null;
  }
};

export const isPurposeToken = (payload: unknown) =>
  !!payload && typeof payload === 'object' && 'purpose' in (payload as object);
