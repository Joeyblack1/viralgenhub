import 'reflect-metadata';
import { YoutubeProvider } from './youtube.provider';

// No network: the provider's fetch and media-size lookup are replaced per test.
describe('YoutubeProvider.postPending, status sent to YouTube', () => {
  const sessionBody = async (settings: object) => {
    const provider = new YoutubeProvider();
    jest.spyOn(provider as any, 'youtubeMediaSize').mockResolvedValue(1234);
    const fetchMock = jest.spyOn(provider as any, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: { location: 'https://upload.example/session' },
      })
    );
    await provider.postPending(
      'id',
      'token',
      [
        {
          id: 'post-1',
          message: 'Description',
          media: [{ path: '/uploads/video.mp4' }],
          settings: {
            title: 'A title',
            type: 'public',
            selfDeclaredMadeForKids: 'no',
            ...settings,
          },
        } as any,
      ],
      {} as any
    );
    return JSON.parse((fetchMock.mock.calls[0][1] as any).body);
  };

  it('discloses altered or synthetic content when ticked', async () => {
    const body = await sessionBody({ containsSyntheticMedia: true });
    expect(body.status).toEqual({
      privacyStatus: 'public',
      selfDeclaredMadeForKids: false,
      containsSyntheticMedia: true,
    });
  });

  it('sends false when not ticked or not set', async () => {
    expect(
      (await sessionBody({ containsSyntheticMedia: false })).status
        .containsSyntheticMedia
    ).toBe(false);
    expect((await sessionBody({})).status.containsSyntheticMedia).toBe(false);
  });
});
