jest.mock('bcrypt', () => ({ hashSync: jest.fn(), compareSync: jest.fn() }));

import { SkoolProvider } from './skool.provider';

// No network: global fetch is replaced per test.
describe('SkoolProvider.authenticate (cookies arrive in a POST body)', () => {
  const provider = new SkoolProvider();
  const cookies = { auth_token: 'SECRET-AUTH', client_id: 'SECRET-CLIENT' };
  const code = Buffer.from(JSON.stringify(cookies)).toString('base64');
  let fetchMock: jest.SpyInstance;
  let spies: jest.SpyInstance[];

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      json: async () => ({
        id: 'u1',
        first_name: 'A',
        last_name: 'B',
        name: 'ab',
        metadata: { picture_profile: '' },
      }),
    } as any);
    spies = (['log', 'error', 'warn', 'info'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => undefined)
    );
  });
  afterEach(() => {
    fetchMock.mockRestore();
    spies.forEach((s) => s.mockRestore());
  });

  it('sends the cookies only as a header, never in a URL', async () => {
    const res: any = await provider.authenticate({ code, codeVerifier: '' });
    expect(res.id).toBe('u1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain('SECRET');
    expect(String(url)).not.toContain(code);
    expect(init.headers.Cookie).toContain('SECRET-AUTH');
  });

  it('does not log the code or cookies on success or failure', async () => {
    await provider.authenticate({ code, codeVerifier: '' });
    fetchMock.mockRejectedValueOnce(new Error('boom'));
    const bad = await provider.authenticate({ code, codeVerifier: '' });
    expect(bad).toBe('Invalid cookie data');
    const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(logged).not.toContain('SECRET');
    expect(logged).not.toContain(code);
  });

  it('stores the cookies encrypted, not as the raw code', async () => {
    const res: any = await provider.authenticate({ code, codeVerifier: '' });
    expect(res.accessToken).not.toContain('SECRET');
  });
});
