import crypto from 'crypto';

// Encryption at rest for customers' platform tokens (Integration.token and
// Integration.refreshToken). AES-256-GCM, a random 12-byte IV per value, stored
// as  enc:v1:<iv b64>:<tag b64>:<ciphertext b64>.
//
// Unlike AuthService.fixedEncryption (deterministic, built for lookups) the
// output differs on every call, so it must never be used to compare values.
//
// - TOKEN_ENCRYPTION_KEY: 32 bytes, base64 (openssl rand -base64 32).
// - Key unset: nothing is encrypted and plaintext flows as before, so the app
//   keeps working on a deploy that lands before the key is set.
// - Values without the prefix are plaintext (rows written before the key).
const PREFIX = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

let warned = false;

function getKey(): Buffer | undefined {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    return undefined;
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_LENGTH) {
    // a typo must not silently fall back to plaintext
    throw new Error(
      'TOKEN_ENCRYPTION_KEY must be 32 bytes, base64 encoded (openssl rand -base64 32)'
    );
  }
  return key;
}

export function isTokenEncryptionEnabled() {
  return !!process.env.TOKEN_ENCRYPTION_KEY;
}

export function isEncryptedToken(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

// One warning per process, called when the data layer starts.
export function warnIfTokenEncryptionDisabled() {
  if (!isTokenEncryptionEnabled() && !warned) {
    warned = true;
    console.warn(
      'TOKEN_ENCRYPTION_KEY is not set: platform tokens are stored unencrypted'
    );
  }
}

export function encryptToken<T extends string | null | undefined>(
  value: T
): T | string {
  const key = getKey();
  // nothing to protect, no key, or already encrypted (keeps writes idempotent)
  if (!value || !key || isEncryptedToken(value)) {
    return value;
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${data.toString('base64')}`;
}

export function decryptToken<T extends string | null | undefined>(
  value: T
): T | string {
  if (!isEncryptedToken(value)) {
    return value;
  }
  const key = getKey();
  if (!key) {
    throw new Error('Encrypted token found but TOKEN_ENCRYPTION_KEY is not set');
  }
  const [iv, tag, data] = value.slice(PREFIX.length).split(':');
  if (!iv || !tag || !data) {
    throw new Error('Malformed encrypted token');
  }
  try {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(data, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // never echo the value or the crypto error detail
    throw new Error('Could not decrypt token (wrong key or tampered value)');
  }
}

// Decrypts token/refreshToken on an Integration row (or anything shaped like
// one); other fields and null/undefined pass through. Returns a copy.
export function decryptIntegrationTokens<T>(row: T): T {
  if (!row || typeof row !== 'object') {
    return row;
  }
  const r = row as any;
  if (!isEncryptedToken(r.token) && !isEncryptedToken(r.refreshToken)) {
    return row;
  }
  return {
    ...r,
    ...(isEncryptedToken(r.token) ? { token: decryptToken(r.token) } : {}),
    ...(isEncryptedToken(r.refreshToken)
      ? { refreshToken: decryptToken(r.refreshToken) }
      : {}),
  };
}

// Same, for a row that carries its integration (post.integration, plug.integration).
export function decryptIntegrationRelation<T>(row: T): T {
  if (!row || typeof row !== 'object' || !(row as any).integration) {
    return row;
  }
  return {
    ...(row as any),
    integration: decryptIntegrationTokens((row as any).integration),
  };
}
