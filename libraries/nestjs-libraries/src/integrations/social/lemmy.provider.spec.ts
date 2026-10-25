import 'reflect-metadata';

// bcrypt's native binding is not what is under test
jest.mock('bcrypt', () => ({ hashSync: jest.fn(), compareSync: jest.fn() }));

import { LemmyProvider } from './lemmy.provider';
import { AuthService } from '@gitroom/helpers/auth/auth.service';

// No network: global fetch is replaced per test.
describe('LemmyProvider', () => {
  const provider = new LemmyProvider();
  let fetchMock: jest.SpyInstance;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret';
  });
  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => {
    fetchMock.mockRestore();
  });

  const json = (body: object) => new Response(JSON.stringify(body));
  const code = (fields: object) =>
    Buffer.from(
      JSON.stringify({
        service: 'https://lemmy.world',
        identifier: 'me@example.com',
        password: 'pw',
        ...fields,
      })
    ).toString('base64');
  const site = {
    my_user: {
      local_user_view: {
        person: { id: 7, name: 'ViralGenHub', display_name: 'VGH' },
      },
    },
  };

  it('sends the 2-factor code and reads the profile from the token', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ jwt: 'token' }))
      .mockResolvedValueOnce(json(site));

    const auth: any = await provider.authenticate({
      code: code({ totp: '123456' }),
      codeVerifier: '',
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      username_or_email: 'me@example.com',
      password: 'pw',
      totp_2fa_token: '123456',
    });
    expect(fetchMock.mock.calls[1][0]).toBe('https://lemmy.world/api/v3/site');
    expect(auth).toMatchObject({
      accessToken: 'token',
      id: '7',
      name: 'VGH',
      username: 'ViralGenHub',
    });
  });

  it('asks for the code when the account has 2-factor on', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'missing_totp_token' }), {
        status: 400,
      })
    );

    await expect(
      provider.authenticate({ code: code({}), codeVerifier: '' })
    ).resolves.toContain('2-factor authentication on');
  });

  it('posts with the saved token instead of logging in again', async () => {
    fetchMock
      .mockResolvedValueOnce(json(site))
      .mockResolvedValueOnce(json({ post_view: { post: { id: 99 } } }));

    const integration: any = {
      customInstanceDetails: AuthService.fixedEncryption(
        JSON.stringify({
          service: 'https://lemmy.world',
          identifier: 'ViralGenHub',
          password: 'pw',
        })
      ),
    };
    const [result] = await provider.post(
      'id',
      'saved-token',
      [
        {
          id: 'post-1',
          message: 'Hello Lemmy',
          settings: { subreddit: [{ value: { id: '5', title: 'Hi' } }] },
        } as any,
      ],
      integration
    );

    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls).toEqual([
      'https://lemmy.world/api/v3/site',
      'https://lemmy.world/api/v3/post',
    ]);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe(
      'Bearer saved-token'
    );
    expect(result.releaseURL).toBe('https://lemmy.world/post/99');
  });
});
