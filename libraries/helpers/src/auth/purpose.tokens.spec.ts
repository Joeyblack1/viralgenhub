import { sign, verify } from 'jsonwebtoken';
import {
  LEGACY_NO_PURPOSE_UNTIL,
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

  it('a token without its subject claim is rejected', () => {
    expect(verifyPurposeToken(signPurposeToken('reset', {}), 'reset')).toBeNull();
    expect(
      verifyPurposeToken(signPurposeToken('modify-subscription', { billing: 'PRO' }), 'modify-subscription')
    ).toBeNull();
  });
});

describe('purpose tokens (team invites / plan change)', () => {
  const inviteData = {
    email: 'new@b.c',
    role: 'USER',
    sendEmail: true,
    orgId: 'org1',
    timeLimit: '2099-01-01 00:00:00',
    id: 'abcde',
  };
  // a week before the grace window closes: a pre-S2 token is still accepted
  const inGrace = LEGACY_NO_PURPOSE_UNTIL.getTime() - 7 * 24 * 3600 * 1000;
  const afterGrace = LEGACY_NO_PURPOSE_UNTIL.getTime() + 1000;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret';
  });

  it('an invite carries its data and is only an invite', () => {
    const t = signPurposeToken('invite', inviteData);
    expect(verifyPurposeToken(t, 'invite')).toEqual(inviteData);
    expect(verifyPurposeToken(t, 'activate')).toBeNull();
    expect(verifyPurposeToken(t, 'reset')).toBeNull();
    expect(verifyPurposeToken(t, 'modify-subscription')).toBeNull();
    expect(isPurposeToken(AuthService.verifyJWT(t))).toBe(true);
  });

  it('a plan-change token is only a plan change and names its organisation', () => {
    const t = signPurposeToken('modify-subscription', { orgId: 'org1', billing: 'PRO' });
    expect(verifyPurposeToken(t, 'modify-subscription')).toEqual({ orgId: 'org1', billing: 'PRO' });
    expect(verifyPurposeToken(t, 'invite')).toBeNull();
  });

  it('a session token is never an invite or a plan change', () => {
    const session = AuthService.signJWT({ id: 'u1', email: 'a@b.c', orgId: 'org1' });
    // the subject is there but a session has no purpose and is not legacy once the window closes
    expect(verifyPurposeToken(session, 'invite', afterGrace)).toBeNull();
    expect(verifyPurposeToken(session, 'modify-subscription', afterGrace)).toBeNull();
  });

  it('a pre-S2 invite (no purpose) is accepted inside the grace window only', () => {
    const legacy = sign(
      { ...inviteData, iat: Math.floor(inGrace / 1000) - 3600 },
      'test-secret'
    );
    expect(verifyPurposeToken(legacy, 'invite', inGrace)).toEqual(inviteData);
    expect(verifyPurposeToken(legacy, 'invite', afterGrace)).toBeNull();
  });

  it('a pre-S2 plan-change token (no purpose) is accepted inside the grace window only', () => {
    const legacy = sign(
      { orgId: 'org1', billing: 'PRO', iat: Math.floor(inGrace / 1000) - 60 },
      'test-secret'
    );
    expect(verifyPurposeToken(legacy, 'modify-subscription', inGrace)).toEqual({
      orgId: 'org1',
      billing: 'PRO',
    });
    expect(verifyPurposeToken(legacy, 'modify-subscription', afterGrace)).toBeNull();
  });

  it('a purpose-less token issued after the window is never accepted, even while the clock is inside it', () => {
    const late = sign(
      { ...inviteData, iat: Math.floor(afterGrace / 1000) },
      'test-secret'
    );
    expect(verifyPurposeToken(late, 'invite', inGrace)).toBeNull();
  });

  it('activation and reset never had a legacy window', () => {
    const noPurpose = sign({ id: 'u1', email: 'a@b.c', iat: Math.floor(inGrace / 1000) }, 'test-secret');
    expect(verifyPurposeToken(noPurpose, 'activate', inGrace)).toBeNull();
    expect(verifyPurposeToken(noPurpose, 'reset', inGrace)).toBeNull();
  });

  it('a token for another purpose is not rescued by the legacy window', () => {
    const reset = signPurposeToken('reset', { id: 'u1', orgId: 'org1' });
    expect(verifyPurposeToken(reset, 'invite', inGrace)).toBeNull();
  });
});
