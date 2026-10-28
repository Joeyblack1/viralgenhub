import { decode, sign, verify } from 'jsonwebtoken';
import { createPublicKey } from 'crypto';
import {
  AuthProvider,
  AuthProviderAbstract,
} from '@gitroom/backend/services/auth/providers.interface';

const getConfig = () => {
  const { APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY } =
    process.env;

  if (
    !APPLE_CLIENT_ID ||
    !APPLE_TEAM_ID ||
    !APPLE_KEY_ID ||
    !APPLE_PRIVATE_KEY
  ) {
    throw new Error('APPLE environment variables are not set');
  }

  return {
    clientId: APPLE_CLIENT_ID,
    teamId: APPLE_TEAM_ID,
    keyId: APPLE_KEY_ID,
    privateKey: normalizeApplePrivateKey(APPLE_PRIVATE_KEY),
  };
};

// The .p8 key reaches the env in whatever shape the deploy tool kept it: one
// line with literal \n (deploy/staging/set-apple-keys.sh), real newlines, the
// whole file base64-encoded (safe through any env editor), or just the key body.
export const normalizeApplePrivateKey = (raw: string): string => {
  let value = raw.trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
  if (!value.includes('-----BEGIN')) {
    const decoded = Buffer.from(value.replace(/\s+/g, ''), 'base64').toString('utf8');
    if (decoded.includes('-----BEGIN')) {
      value = decoded;
    } else {
      const body = value.replace(/\s+/g, '').match(/.{1,64}/g) || [];
      value = ['-----BEGIN PRIVATE KEY-----', ...body, '-----END PRIVATE KEY-----'].join('\n');
    }
  }
  return value.trim() + '\n';
};

const defaultRedirect = () =>
  `${
    process?.env?.NEXT_PUBLIC_BACKEND_URL?.indexOf('https') === -1
      ? 'https://redirectmeto.com/'
      : ''
  }${process.env.NEXT_PUBLIC_BACKEND_URL}/auth/oauth/apple/redirect`;

const clientSecret = () => {
  const { clientId, teamId, keyId, privateKey } = getConfig();
  return sign({}, privateKey, {
    algorithm: 'ES256',
    expiresIn: '5m',
    audience: 'https://appleid.apple.com',
    issuer: teamId,
    subject: clientId,
    keyid: keyId,
  });
};

@AuthProvider({ provider: 'APPLE' })
export class AppleProvider extends AuthProviderAbstract {
  generateLink(query?: { redirect_uri?: string; state?: string }) {
    const { clientId } = getConfig();
    const url = new URL('https://appleid.apple.com/auth/authorize');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set(
      'redirect_uri',
      query?.redirect_uri || defaultRedirect()
    );
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('response_mode', 'form_post');
    url.searchParams.set('scope', 'name email');
    url.searchParams.set('state', query?.state || 'login');
    return url.toString();
  }

  async getToken(code: string, redirectUri?: string): Promise<string> {
    // the native iOS flow has no code exchange - the app sends the id_token
    // directly, which getUser verifies against Apple's public keys
    const decoded = decode(code);
    if (
      decoded &&
      typeof decoded === 'object' &&
      decoded.iss === 'https://appleid.apple.com'
    ) {
      return code;
    }

    const { clientId } = getConfig();
    const response = await fetch('https://appleid.apple.com/auth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri || defaultRedirect(),
        client_id: clientId,
        client_secret: clientSecret(),
      }).toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token request failed: ${error}`);
    }

    const { id_token } = await response.json();
    if (!id_token) {
      throw new Error('Invalid provider token');
    }

    return id_token;
  }

  async getUser(providerToken: string) {
    const { clientId } = getConfig();
    const decoded = decode(providerToken, { complete: true });
    const { keys } = await (
      await fetch('https://appleid.apple.com/auth/keys')
    ).json();

    const key = keys.find(
      (k: { kid: string }) => k.kid === decoded?.header?.kid
    );
    if (!key) {
      throw new Error('Invalid provider token');
    }

    // native tokens carry the app bundle id as audience instead of the
    // web services id
    const audience: [string, ...string[]] = process.env.APPLE_APP_BUNDLE_ID
      ? [clientId, process.env.APPLE_APP_BUNDLE_ID]
      : [clientId];

    // the id_token must be verified against Apple's public keys because it is
    // sent back from the client as the providerToken during registration
    const payload = verify(
      providerToken,
      createPublicKey({ key, format: 'jwk' }),
      {
        algorithms: ['RS256'],
        audience,
        issuer: 'https://appleid.apple.com',
      }
    ) as unknown as {
      sub: string;
      email: string;
      email_verified?: boolean | string;
      is_private_email?: boolean | string;
    };

    // Apple sends these claims as booleans or the strings 'true'/'false'.
    // A "Hide My Email" relay address is unique to this app, so it can never
    // match an account made elsewhere and must not be used for linking.
    const isTrue = (value?: boolean | string) =>
      value === true || value === 'true';

    return {
      id: payload.sub,
      email: payload.email,
      emailVerified:
        isTrue(payload.email_verified) && !isTrue(payload.is_private_email),
    };
  }
}
