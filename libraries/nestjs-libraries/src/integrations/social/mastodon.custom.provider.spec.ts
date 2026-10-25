// bcrypt's native binding is not what is under test
jest.mock('bcrypt', () => ({ hashSync: jest.fn(), compareSync: jest.fn() }));

import { MastodonCustomProvider } from './mastodon.custom.provider';
import { MastodonProvider } from './mastodon.provider';

// No network: global fetch is replaced per test.
describe('MastodonCustomProvider', () => {
  const provider = new MastodonCustomProvider();
  const env = { ...process.env };
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    process.env.FRONTEND_URL = 'https://app.example.com';
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => {
    fetchMock.mockRestore();
    process.env = { ...env };
  });

  const redirectOf = (url: string) =>
    new URL(url).searchParams.get('redirect_uri');

  it('sends the user to their instance with its own callback', async () => {
    const { url } = await provider.generateAuthUrl({
      client_id: 'client',
      client_secret: 'secret',
      instanceUrl: ' fosstodon.org/ ',
    });

    expect(url.startsWith('https://fosstodon.org/oauth/authorize?')).toBe(true);
    expect(new URL(url).searchParams.get('client_id')).toBe('client');
    expect(redirectOf(url)).toBe(
      'https://app.example.com/integrations/social/mastodon-custom'
    );
  });

  it('keeps the default provider on its existing callback', async () => {
    const { url } = await new MastodonProvider().generateAuthUrl();
    expect(redirectOf(url)).toBe(
      'https://app.example.com/integrations/social/mastodon'
    );
  });

  it('registers the app with the same callback', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ client_id: 'c', client_secret: 's' }))
    );

    await expect(provider.externalUrl('https://fosstodon.org/')).resolves.toEqual(
      { client_id: 'c', client_secret: 's' }
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://fosstodon.org/api/v1/apps');
    expect(init.body.get('redirect_uris')).toBe(
      'https://app.example.com/integrations/social/mastodon-custom'
    );
  });

  it('fails the connect when the instance gives no client', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Validation failed' }))
    );

    await expect(provider.externalUrl('https://example.com')).rejects.toThrow(
      'Could not register the app on this Mastodon instance'
    );
  });

  it('prefixes the account id with the instance host', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'token' }))
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: '1', username: 'admin', display_name: 'Admin' })
        )
      );

    const auth: any = await provider.authenticate(
      { code: 'code', codeVerifier: '' },
      {
        client_id: 'c',
        client_secret: 's',
        instanceUrl: 'https://fosstodon.org/',
      }
    );

    expect(auth.id).toBe('fosstodon.org_1');
    expect(fetchMock.mock.calls[0][0]).toBe('https://fosstodon.org/oauth/token');
    expect(fetchMock.mock.calls[0][1].body.get('redirect_uri')).toBe(
      'https://app.example.com/integrations/social/mastodon-custom'
    );
  });
});
