import 'reflect-metadata';
import { WordpressProvider } from './wordpress.provider';

// No network: global fetch is replaced per test.
describe('WordpressProvider.post', () => {
  let fetchMock: jest.SpyInstance;
  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => {
    fetchMock.mockRestore();
  });

  // the stored token keeps the domain exactly as the user typed it
  const token = (domain: string) =>
    Buffer.from(
      JSON.stringify({ domain, username: 'user', password: 'app pass' })
    ).toString('base64');

  it.each([
    [' https://site.example.com/ ', 'https://site.example.com'],
    ['https://site.example.com//', 'https://site.example.com'],
    ['site.example.com', 'https://site.example.com'],
    ['http://site.example.com/blog/', 'http://site.example.com/blog'],
  ])('publishes to a clean url for %j', async (domain, base) => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 7, link: `${base}/hello` }), {
        status: 201,
      })
    );

    const [result] = await new WordpressProvider().post(
      'id',
      token(domain),
      [
        {
          id: 'post-1',
          message: '<p>Hi</p>',
          settings: { title: 'Hello', type: 'posts' },
        } as any,
      ],
      {} as any
    );

    expect(fetchMock.mock.calls[0][0]).toBe(`${base}/wp-json/wp/v2/posts`);
    expect(result.postId).toBe('7');
  });
});
