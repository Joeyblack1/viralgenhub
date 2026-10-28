import 'reflect-metadata';
import { generateKeyPairSync, KeyObject } from 'crypto';
import { decode, sign, verify } from 'jsonwebtoken';
import {
  AppleProvider,
  normalizeApplePrivateKey,
} from '@gitroom/backend/services/auth/providers/apple.provider';

// Throwaway keys made per run: the .p8-style EC key signs our client secret,
// the RSA key stands in for Apple's id_token signing key.
const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const p8 = ec.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test-kid';
const jwk = { ...(rsa.publicKey as KeyObject).export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' };

const ENV = {
  APPLE_CLIENT_ID: 'com.viralgenhub.web',
  APPLE_TEAM_ID: 'ABCDE12345',
  APPLE_KEY_ID: 'KEY1234567',
  APPLE_PRIVATE_KEY: p8.trim().replace(/\n/g, '\\n'),
  NEXT_PUBLIC_BACKEND_URL: 'https://staging.viralgenhub.com/api',
};

const idToken = (claims: Record<string, unknown>, opts: { aud?: string; kid?: string; iss?: string } = {}) =>
  sign(
    { email: 'abc123@privaterelay.appleid.com', ...claims },
    rsa.privateKey,
    {
      algorithm: 'RS256',
      keyid: opts.kid ?? KID,
      audience: opts.aud ?? ENV.APPLE_CLIENT_ID,
      issuer: opts.iss ?? 'https://appleid.apple.com',
      subject: '001234.abcdef.0123',
      expiresIn: '10m',
    }
  );

describe('AppleProvider (Sign in with Apple)', () => {
  const saved = { ...process.env };
  let fetchMock: jest.Mock;

  beforeEach(() => {
    Object.assign(process.env, ENV);
    delete process.env.APPLE_APP_BUNDLE_ID;
    fetchMock = jest.fn(async (url: string, init?: any) => {
      if (url === 'https://appleid.apple.com/auth/keys') {
        return { ok: true, json: async () => ({ keys: [jwk] }) };
      }
      if (url === 'https://appleid.apple.com/auth/token') {
        return { ok: true, json: async () => ({ id_token: idToken({ email_verified: 'true' }) }) };
      }
      throw new Error(`unexpected fetch ${url} ${init?.method}`);
    });
    (global as any).fetch = fetchMock;
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it('builds the authorize link: form_post, name + email, our return URL and state', () => {
    const url = new URL(new AppleProvider().generateLink({ state: 'login-xyz' }));
    expect(url.origin + url.pathname).toBe('https://appleid.apple.com/auth/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'com.viralgenhub.web',
      redirect_uri: 'https://staging.viralgenhub.com/api/auth/oauth/apple/redirect',
      response_type: 'code',
      response_mode: 'form_post',
      scope: 'name email',
      state: 'login-xyz',
    });
  });

  it('exchanges the code with a client secret signed by the .p8 key (ES256, 5 min)', async () => {
    const token = await new AppleProvider().getToken('auth-code');
    expect(typeof token).toBe('string');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://appleid.apple.com/auth/token');
    const body = new URLSearchParams(init.body);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('auth-code');
    expect(body.get('client_id')).toBe('com.viralgenhub.web');
    expect(body.get('redirect_uri')).toBe(
      'https://staging.viralgenhub.com/api/auth/oauth/apple/redirect'
    );
    const secret = body.get('client_secret')!;
    const header = (decode(secret, { complete: true }) as any).header;
    expect(header).toMatchObject({ alg: 'ES256', kid: 'KEY1234567' });
    const claims = verify(secret, ec.publicKey, {
      algorithms: ['ES256'],
      audience: 'https://appleid.apple.com',
      issuer: 'ABCDE12345',
      subject: 'com.viralgenhub.web',
    }) as any;
    expect(claims.exp - claims.iat).toBe(300);
  });

  it('refuses to start without all four APPLE_* settings', () => {
    delete process.env.APPLE_KEY_ID;
    expect(() => new AppleProvider().generateLink()).toThrow(
      'APPLE environment variables are not set'
    );
  });

  it('a Hide My Email relay address signs in but is never used to link accounts', async () => {
    const user = await new AppleProvider().getUser(
      idToken({ email_verified: 'true', is_private_email: 'true' })
    );
    expect(user).toEqual({
      id: '001234.abcdef.0123',
      email: 'abc123@privaterelay.appleid.com',
      emailVerified: false,
    });
  });

  it('a real, Apple-verified address may link (boolean or string claims)', async () => {
    for (const claims of [
      { email: 'person@example.com', email_verified: true },
      { email: 'person@example.com', email_verified: 'true', is_private_email: 'false' },
    ]) {
      const user = await new AppleProvider().getUser(idToken(claims));
      expect(user).toMatchObject({ email: 'person@example.com', emailVerified: true });
    }
    const unverified = await new AppleProvider().getUser(
      idToken({ email: 'person@example.com', email_verified: 'false' })
    );
    expect(unverified).toMatchObject({ emailVerified: false });
  });

  it('rejects tokens for another client, another issuer or an unknown key', async () => {
    const p = new AppleProvider();
    await expect(p.getUser(idToken({}, { aud: 'com.someone.else' }))).rejects.toThrow();
    await expect(p.getUser(idToken({}, { iss: 'https://evil.example' }))).rejects.toThrow();
    await expect(p.getUser(idToken({}, { kid: 'other' }))).rejects.toThrow('Invalid provider token');
  });

  it('accepts the native app bundle ID as audience only when APPLE_APP_BUNDLE_ID is set', async () => {
    const native = idToken({}, { aud: 'com.viralgenhub.app' });
    await expect(new AppleProvider().getUser(native)).rejects.toThrow();
    process.env.APPLE_APP_BUNDLE_ID = 'com.viralgenhub.app';
    await expect(new AppleProvider().getUser(native)).resolves.toMatchObject({
      id: '001234.abcdef.0123',
    });
  });
});

describe('normalizeApplePrivateKey', () => {
  const pem = p8.trim() + '\n';
  const body = p8.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');

  it.each([
    ['one line with literal \\n', p8.trim().replace(/\n/g, '\\n')],
    ['real newlines', p8],
    ['quoted', `"${p8.trim().replace(/\n/g, '\\n')}"`],
    ['the whole file base64-encoded', Buffer.from(p8).toString('base64')],
  ])('%s', (_name, raw) => {
    expect(normalizeApplePrivateKey(raw)).toBe(pem);
  });

  it('just the key body (64-character lines rebuilt) still signs', () => {
    const key = normalizeApplePrivateKey(body);
    expect(key.startsWith('-----BEGIN PRIVATE KEY-----\n')).toBe(true);
    const jwt = sign({}, key, { algorithm: 'ES256' });
    expect(() => verify(jwt, ec.publicKey, { algorithms: ['ES256'] })).not.toThrow();
  });
});
