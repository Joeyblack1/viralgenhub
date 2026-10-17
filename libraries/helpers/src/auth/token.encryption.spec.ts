import crypto from 'crypto';
import {
  decryptIntegrationRelation,
  decryptIntegrationTokens,
  decryptToken,
  encryptToken,
  isEncryptedToken,
} from './token.encryption';

const KEY = crypto.randomBytes(32).toString('base64');
const OTHER_KEY = crypto.randomBytes(32).toString('base64');

describe('token encryption', () => {
  const original = process.env.TOKEN_ENCRYPTION_KEY;
  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = KEY;
  });
  afterAll(() => {
    if (original === undefined) {
      delete process.env.TOKEN_ENCRYPTION_KEY;
    } else {
      process.env.TOKEN_ENCRYPTION_KEY = original;
    }
  });

  it('round trips and uses the enc:v1 format', () => {
    const enc = encryptToken('secret-access-token');
    expect(enc).toMatch(/^enc:v1:[^:]+:[^:]+:[^:]+$/);
    expect(enc).not.toContain('secret-access-token');
    expect(decryptToken(enc)).toBe('secret-access-token');
  });

  it('round trips unicode and long values', () => {
    const value = 'tökén-✓-'.repeat(500);
    expect(decryptToken(encryptToken(value))).toBe(value);
  });

  it('uses a random 12-byte IV per value', () => {
    const a = encryptToken('same') as string;
    const b = encryptToken('same') as string;
    expect(a).not.toBe(b);
    const iv = Buffer.from(a.split(':')[2], 'base64');
    expect(iv.length).toBe(12);
    expect(a.split(':')[2]).not.toBe(b.split(':')[2]);
  });

  it('does not double encrypt', () => {
    const enc = encryptToken('abc') as string;
    expect(encryptToken(enc)).toBe(enc);
  });

  it('fails on a tampered ciphertext, tag or IV', () => {
    const [p1, p2, iv, tag, data] = (encryptToken('abc') as string).split(':');
    const flip = (b64: string) => {
      const buf = Buffer.from(b64, 'base64');
      buf[0] ^= 1;
      return buf.toString('base64');
    };
    for (const parts of [
      [iv, tag, flip(data)],
      [iv, flip(tag), data],
      [flip(iv), tag, data],
    ]) {
      expect(() => decryptToken([p1, p2, ...parts].join(':'))).toThrow(
        'Could not decrypt token'
      );
    }
  });

  it('fails with the wrong key, without leaking the value', () => {
    const enc = encryptToken('abc') as string;
    process.env.TOKEN_ENCRYPTION_KEY = OTHER_KEY;
    expect(() => decryptToken(enc)).toThrow('Could not decrypt token');
    try {
      decryptToken(enc);
    } catch (err: any) {
      expect(err.message).not.toContain(enc);
    }
  });

  it('rejects a malformed value and a key of the wrong size', () => {
    expect(() => decryptToken('enc:v1:onlyone')).toThrow('Malformed');
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(16).toString('base64');
    expect(() => encryptToken('abc')).toThrow('32 bytes');
  });

  it('passes plaintext through on decrypt', () => {
    expect(decryptToken('plain-token')).toBe('plain-token');
    expect(decryptToken('')).toBe('');
    expect(decryptToken(null)).toBe(null);
    expect(decryptToken(undefined)).toBe(undefined);
    expect(isEncryptedToken('plain-token')).toBe(false);
  });

  it('leaves empty values alone on encrypt', () => {
    expect(encryptToken('')).toBe('');
    expect(encryptToken(null)).toBe(null);
    expect(encryptToken(undefined)).toBe(undefined);
  });

  describe('without TOKEN_ENCRYPTION_KEY', () => {
    beforeEach(() => {
      delete process.env.TOKEN_ENCRYPTION_KEY;
    });

    it('stores and reads plaintext as before', () => {
      expect(encryptToken('abc')).toBe('abc');
      expect(decryptToken('abc')).toBe('abc');
    });

    it('refuses to hand back an encrypted value it cannot read', () => {
      process.env.TOKEN_ENCRYPTION_KEY = KEY;
      const enc = encryptToken('abc') as string;
      delete process.env.TOKEN_ENCRYPTION_KEY;
      expect(() => decryptToken(enc)).toThrow('TOKEN_ENCRYPTION_KEY is not set');
    });
  });

  describe('row helpers', () => {
    it('decrypts token and refreshToken, keeps the other fields', () => {
      const row = {
        id: '1',
        name: 'n',
        token: encryptToken('t'),
        refreshToken: encryptToken('r'),
      };
      expect(decryptIntegrationTokens(row)).toEqual({
        id: '1',
        name: 'n',
        token: 't',
        refreshToken: 'r',
      });
      // input is not mutated
      expect(isEncryptedToken(row.token)).toBe(true);
    });

    it('handles null rows, plaintext rows and null refresh tokens', () => {
      expect(decryptIntegrationTokens(null)).toBe(null);
      const plain = { token: 'a', refreshToken: null };
      expect(decryptIntegrationTokens(plain)).toBe(plain);
      expect(
        decryptIntegrationTokens({ token: encryptToken('a'), refreshToken: null })
      ).toEqual({ token: 'a', refreshToken: null });
    });

    it('decrypts the integration of a post-like row', () => {
      const post = { id: 'p', integration: { token: encryptToken('t') } };
      expect(decryptIntegrationRelation(post)).toEqual({
        id: 'p',
        integration: { token: 't' },
      });
      expect(decryptIntegrationRelation({ id: 'p' })).toEqual({ id: 'p' });
      expect(decryptIntegrationRelation(null)).toBe(null);
    });
  });
});
