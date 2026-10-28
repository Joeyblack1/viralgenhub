jest.mock('bcrypt', () => ({ hashSync: jest.fn(), compareSync: jest.fn() }));

import { LinkedinPageProvider } from './linkedin.page.provider';

// No network: global fetch is replaced per test. The LinkedIn app behind this
// provider has only the Community Management API product, so there is no
// openid scope, no /v2/userinfo and no /v2/me.
describe('LinkedinPageProvider (Community Management API only)', () => {
  const provider = new LinkedinPageProvider();
  let fetchMock: jest.SpyInstance;
  const urls = () => fetchMock.mock.calls.map((c) => String(c[0]));

  const route = (url: string) => {
    if (url.includes('/oauth/v2/accessToken')) {
      return {
        access_token: 'AT',
        refresh_token: 'RT',
        expires_in: 5000,
        scope:
          'rw_organization_admin,w_organization_social,r_organization_social',
      };
    }
    if (url.includes('/rest/organizationAcls')) {
      return {
        elements: [
          {
            role: 'ADMINISTRATOR',
            state: 'APPROVED',
            organization: 'urn:li:organization:111',
            roleAssignee: 'urn:li:person:abc',
          },
          {
            role: 'ANALYST',
            state: 'APPROVED',
            organization: 'urn:li:organization:222',
            roleAssignee: 'urn:li:person:abc',
          },
        ],
      };
    }
    if (url.includes('/v2/organizations/111')) {
      return {
        id: 111,
        localizedName: 'Acme',
        vanityName: 'acme',
        logoV2: {
          'original~': {
            elements: [{ identifiers: [{ identifier: 'https://img/logo' }] }],
          },
        },
      };
    }
    return {};
  };

  beforeEach(() => {
    process.env.FRONTEND_URL = 'https://app.test';
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(
        async (u: any) => ({ json: async () => route(String(u)) } as any)
      );
  });
  afterEach(() => fetchMock.mockRestore());

  it('requests only Community Management scopes', async () => {
    const { url } = await provider.generateAuthUrl();
    const scope = new URL(url).searchParams.get('scope')!.split(' ');
    expect(scope).not.toContain('openid');
    expect(scope).not.toContain('profile');
    expect(scope).not.toContain('w_member_social');
    expect(scope).not.toContain('r_basicprofile');
    expect(scope).toEqual(
      expect.arrayContaining([
        'rw_organization_admin',
        'w_organization_social',
        'r_organization_social',
      ])
    );
  });

  it('authenticate makes no userinfo or /v2/me call and keys the row on the ACL member', async () => {
    const res: any = await provider.authenticate({
      code: 'c',
      codeVerifier: 'v',
    });
    expect(res.id).toBe('linkedin-page_abc');
    expect(res.accessToken).toBe('AT');
    expect(res.refreshToken).toBe('RT');
    expect(urls().some((u) => u.includes('userinfo'))).toBe(false);
    expect(urls().some((u) => u.includes('/v2/me'))).toBe(false);
  });

  it('refreshToken makes no userinfo or /v2/me call', async () => {
    const res = await provider.refreshToken('RT');
    expect(res.accessToken).toBe('AT');
    expect(urls().some((u) => /userinfo|\/v2\/me/.test(u))).toBe(false);
  });

  it('lists the administered pages from organizationAcls', async () => {
    const pages = await provider.companies('AT');
    expect(pages).toEqual([
      {
        id: '111',
        page: '111',
        username: 'acme',
        name: 'Acme',
        picture: 'https://img/logo',
      },
    ]);
    const acl = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes('/rest/organizationAcls')
    )!;
    expect(acl[1].headers['X-Restli-Protocol-Version']).toBe('2.0.0');
    expect(acl[1].headers['LinkedIn-Version']).toBeDefined();
  });
});
