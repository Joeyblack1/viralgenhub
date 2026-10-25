import 'reflect-metadata';
import { DevToProvider } from './dev.to.provider';
import { BadBody } from '../social.abstract';

// No network: global fetch is replaced per test, so this.fetch's own status
// handling is what is under test.
describe('DevToProvider.post', () => {
  const provider = new DevToProvider();
  const post = (settings: any = { title: 'Hello' }) =>
    provider.post(
      'user-id',
      'api-key',
      [{ id: 'post-1', message: 'Body', settings } as any],
      {} as any
    );

  let fetchMock: jest.SpyInstance;
  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('returns the created article', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ id: 42, url: 'https://dev.to/u/hello-42' }),
        { status: 201 }
      )
    );

    await expect(post()).resolves.toEqual([
      {
        id: 'post-1',
        status: 'completed',
        postId: '42',
        releaseURL: 'https://dev.to/u/hello-42',
      },
    ]);
  });

  it('fails the post when dev.to rejects the article', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error: 'Title can\'t be blank', status: 422 }),
        { status: 422 }
      )
    );

    const err = await post().catch((e) => e);
    expect(err).toBeInstanceOf(BadBody);
    expect(err.details[0].json).toContain("Title can't be blank");
  });

  it('keeps the canonical url message for that rejection', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'Canonical url has already been taken',
          status: 422,
        }),
        { status: 422 }
      )
    );

    const err = await post().catch((e) => e);
    expect(err).toBeInstanceOf(BadBody);
    expect(err.message).toBe('Canonical URL already exists');
  });

  it('sends an absolute cover image url', async () => {
    const env = { ...process.env };
    process.env.NEXT_PUBLIC_BACKEND_URL = 'https://api.example.com';
    process.env.NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY = 'uploads';
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ id: 1, url: 'u' }), { status: 201 })
    );

    try {
      await post({ title: 'Hello', main_image: { path: '/2026/a.png' } });
      await post({
        title: 'Hello',
        main_image: { path: 'https://cdn.example.com/b.png' },
      });
    } finally {
      process.env = env;
    }

    const covers = fetchMock.mock.calls.map(
      ([, init]) => JSON.parse(init.body).article.main_image
    );
    expect(covers).toEqual([
      'https://api.example.com/uploads/2026/a.png',
      'https://cdn.example.com/b.png',
    ]);
  });
});
