import { sign, verify } from 'jsonwebtoken';
import {
  isPurposeToken,
  signPurposeToken,
  verifyPurposeToken,
} from './purpose.tokens';

// Same as AuthService.signJWT / verifyJWT (plain HS256 with JWT_SECRET);
// inlined so the test does not load bcrypt's native module.
const AuthService = {
  signJWT: (v: object) => sign(v, process.env.JWT_SECRET!),
  verifyJWT: (t: string) => verify(t, process.env.JWT_SECRET!),
};

describe('purpose tokens (activation / reset links)', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret';
  });

  it('activation token verifies only as activate', () => {
    const t = signPurposeToken('activate', { id: 'u1', email: 'a@b.c' });
    expect(verifyPurposeToken(t, 'activate')).toEqual({ id: 'u1', email: 'a@b.c' });
    expect(verifyPurposeToken(t, 'reset')).toBeNull();
  });

  it('reset token verifies only as reset', () => {
    const t = signPurposeToken('reset', { id: 'u1' });
    expect(verifyPurposeToken(t, 'reset')?.id).toBe('u1');
    expect(verifyPurposeToken(t, 'activate')).toBeNull();
  });

  it('a session token (no purpose) is not accepted as a reset or activation link', () => {
    const session = AuthService.signJWT({ id: 'u1', email: 'a@b.c' });
    expect(verifyPurposeToken(session, 'reset')).toBeNull();
    expect(verifyPurposeToken(session, 'activate')).toBeNull();
  });

  it('emailed tokens are recognised so the auth middleware can refuse them as sessions', () => {
    const t = signPurposeToken('activate', { id: 'u1', email: 'a@b.c' });
    expect(isPurposeToken(AuthService.verifyJWT(t))).toBe(true);
    expect(isPurposeToken(AuthService.verifyJWT(AuthService.signJWT({ id: 'u1' })))).toBe(false);
  });

  it('expired tokens are rejected', () => {
    const expired = sign(
      { id: 'u1', purpose: 'reset', exp: Math.floor(Date.now() / 1000) - 10 },
      'test-secret'
    );
    expect(verifyPurposeToken(expired, 'reset')).toBeNull();
  });

  it('tokens signed with another secret are rejected', () => {
    const forged = sign({ id: 'u1', purpose: 'reset' }, 'other-secret');
    expect(verifyPurposeToken(forged, 'reset')).toBeNull();
  });
});
