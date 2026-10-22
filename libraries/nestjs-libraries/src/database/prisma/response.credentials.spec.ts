// #148: nothing that goes out over HTTP / MCP / webhooks may carry a platform
// token or another stored credential. Mocked Prisma, nothing connects.
import crypto from 'crypto';
import { IntegrationRepository } from './integrations/integration.repository';
import { ThirdPartyRepository } from './third-party/third-party.repository';
import { OAuthRepository } from './oauth/oauth.repository';
import { OAuthService } from './oauth/oauth.service';
import { FacebookProvider } from '../../integrations/social/facebook.provider';
import { encryptToken } from '@gitroom/helpers/auth/token.encryption';

// bcrypt's native binding is not what is under test
jest.mock('bcrypt', () => ({ hashSync: jest.fn(), compareSync: jest.fn() }));
// the storage backends pull in an ESM-only dependency jest cannot load
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({}) },
}));

const SECRET_KEYS = [
  'token',
  'refreshToken',
  'customInstanceDetails',
  'accessToken',
  'access_token',
  'clientSecret',
  'authorizationCode',
  'apiKey',
  'password',
];

// every key of the object at any depth
const keysDeep = (value: any, found = new Set<string>()): Set<string> => {
  if (Array.isArray(value)) {
    value.forEach((v) => keysDeep(v, found));
  } else if (value && typeof value === 'object') {
    Object.keys(value).forEach((k) => {
      found.add(k);
      keysDeep(value[k], found);
    });
  }
  return found;
};

const expectNoSecretKeys = (value: any) => {
  const keys = keysDeep(value);
  for (const secret of SECRET_KEYS) {
    expect(keys.has(secret)).toBe(false);
  }
};

// A Prisma double that behaves like the real one for `select`: it returns only
// the selected fields of the full (secret-holding) row.
const applySelect = (row: any, select?: Record<string, any>) => {
  if (!select) {
    return row;
  }
  return Object.keys(select)
    .filter((k) => select[k])
    .reduce((all, k) => ({ ...all, [k]: row[k] }), {} as any);
};

describe('#148 integration repository responses', () => {
  const original = process.env.TOKEN_ENCRYPTION_KEY;
  beforeAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
  });
  afterAll(() => {
    if (original === undefined) {
      delete process.env.TOKEN_ENCRYPTION_KEY;
    } else {
      process.env.TOKEN_ENCRYPTION_KEY = original;
    }
  });

  const row = () => ({
    id: 'i1',
    name: 'Channel',
    picture: 'p.png',
    customName: null,
    providerIdentifier: 'x',
    profile: 'me',
    type: 'social',
    disabled: false,
    refreshNeeded: false,
    inBetweenSteps: false,
    customerId: null,
    organizationId: 'org',
    token: encryptToken('platform-access-token'),
    refreshToken: encryptToken('platform-refresh-token'),
    customInstanceDetails: 'secret-details',
  });

  const build = () => {
    const integration: any = {
      update: jest.fn(async ({ select }: any) => applySelect(row(), select)),
      findFirst: jest.fn(async () => row()),
    };
    const customer: any = {
      findFirst: jest.fn(async () => ({ id: 'c1', name: 'g' })),
      create: jest.fn(),
    };
    const repo = new IntegrationRepository(
      { model: { integration } } as any,
      { model: { post: {} } } as any,
      { model: { plugs: {} } } as any,
      { model: {} } as any,
      { model: { customer } } as any,
      { model: {} } as any
    );
    return { repo, integration };
  };

  it.each([
    ['updateNameAndUrl', (r: IntegrationRepository) => r.updateNameAndUrl('i1', 'n', 'u')],
    ['updateOnCustomerName', (r: IntegrationRepository) => r.updateOnCustomerName('org', 'i1', 'g')],
    ['updateIntegrationGroup (set)', (r: IntegrationRepository) => r.updateIntegrationGroup('org', 'i1', 'c1')],
    ['updateIntegrationGroup (clear)', (r: IntegrationRepository) => r.updateIntegrationGroup('org', 'i1', '')],
  ])('%s returns a channel without token, refreshToken or details', async (_n, call) => {
    const { repo } = build();
    const res: any = await call(repo);
    expectNoSecretKeys(res);
    expect(res.id).toBe('i1');
    expect(JSON.stringify(res)).not.toContain('platform-');
  });

  it('the internal read used by providers still gets the plaintext token', async () => {
    const { repo } = build();
    const res: any = await repo.getIntegrationById('org', 'i1');
    expect(res.token).toBe('platform-access-token');
    expect(res.refreshToken).toBe('platform-refresh-token');
  });
});

describe('#148 third-party delete', () => {
  it('returns only the id, never the stored apiKey', async () => {
    const update = jest.fn(async ({ select }: any) =>
      applySelect({ id: 't1', name: 'n', identifier: 'x', apiKey: 'enc' }, select)
    );
    const repo = new ThirdPartyRepository({ model: { thirdParty: { update } } } as any);
    const res: any = await repo.deleteIntegration('org', 't1');
    expect(res).toEqual({ id: 't1' });
    expectNoSecretKeys(res);
  });
});

describe('#148 OAuth app responses', () => {
  const appRow = {
    id: 'a1',
    organizationId: 'org',
    name: 'App',
    description: null,
    pictureId: null,
    redirectUrl: 'https://x.test/cb',
    clientId: 'pca_1',
    clientSecret: 'hashed-secret',
    picture: null,
  };

  it('approved apps list has no accessToken / authorizationCode / clientSecret', async () => {
    const authRow = {
      id: 'auth1',
      userId: 'u1',
      accessToken: 'oauth-access-token',
      authorizationCode: 'code',
      createdAt: new Date(),
      oauthApp: appRow,
    };
    const findMany = jest.fn(async ({ select }: any) => {
      // apply the select recursively one level like Prisma would
      const out: any = applySelect(authRow, select);
      if (select.oauthApp?.select) {
        out.oauthApp = applySelect(appRow, select.oauthApp.select);
      }
      return [out];
    });
    const repo = new OAuthRepository(
      {} as any,
      { model: { oAuthAuthorization: { findMany } } } as any,
      {} as any
    );
    const res = await new OAuthService(repo).getApprovedApps('u1');
    expect(res).toHaveLength(1);
    expectNoSecretKeys(res);
    expect(res[0].oauthApp.name).toBe('App');
    expect(res[0].id).toBe('auth1');
    expect(res[0].createdAt).toBeInstanceOf(Date);
  });

  it('updateApp response has no clientSecret', async () => {
    const repo: any = { updateApp: jest.fn(async () => appRow) };
    const res: any = await new OAuthService(repo).updateApp('org', {
      name: 'App',
    } as any);
    expectNoSecretKeys(res);
    expect(res.name).toBe('App');
  });

  it('updateApp keeps returning null when there is no app', async () => {
    const repo: any = { updateApp: jest.fn(async () => null) };
    expect(await new OAuthService(repo).updateApp('org', {} as any)).toBeNull();
  });
});

describe('#148 Facebook page picker', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('pages() lists pages without their access tokens', async () => {
    global.fetch = jest.fn(async (url: any) => {
      const body = String(url).includes('/me/accounts')
        ? {
            data: [
              { id: '1', name: 'P1', username: 'p1', access_token: 'page-token-1' },
              { id: '2', name: 'P2', access_token: 'page-token-2' },
            ],
          }
        : { data: [] };
      return { json: async () => body } as any;
    }) as any;
    const res = await new FacebookProvider().pages('user-token');
    expect(res.map((p: any) => p.id)).toEqual(['1', '2']);
    expectNoSecretKeys(res);
    expect(JSON.stringify(res)).not.toContain('page-token');
  });
});
