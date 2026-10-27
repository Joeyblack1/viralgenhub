import 'reflect-metadata';
import { BadBody } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { TiktokProvider } from './tiktok.provider';

// TIKTOK_AUDITED: until TikTok audits the API client, Direct Post only works
// from private accounts with SELF_ONLY viewership. No network: fetch is stubbed.
describe('TiktokProvider while unaudited', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    jest.restoreAllMocks();
  });

  // recorded shape of /v2/post/publish/creator_info/query/ for a public account
  const creatorInfo = (token: string) => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            creator_nickname: 'ViralGenHub',
            creator_username: 'viralgenhub',
            creator_avatar_url: 'https://p16.example/a.jpg',
            privacy_level_options: [
              'PUBLIC_TO_EVERYONE',
              'MUTUAL_FOLLOW_FRIENDS',
              'SELF_ONLY',
            ],
            comment_disabled: false,
            duet_disabled: false,
            stitch_disabled: true,
            max_video_post_duration_sec: 600,
          },
          error: { code: 'ok', message: '', log_id: 'x' },
        }),
        { status: 200 }
      )
    );
    return new TiktokProvider().creatorInfo(token);
  };

  const body = (privacy_level: string, extra: object = {}) =>
    (new TiktokProvider() as any).buildTikokPostInfoBody({
      id: 'p',
      message: 'Launch video',
      media: [{ path: 'https://app.test/uploads/v.mp4' }],
      settings: {
        content_posting_method: 'DIRECT_POST',
        privacy_level,
        duet: false,
        stitch: false,
        comment: true,
        brand_content_toggle: false,
        brand_organic_toggle: false,
        ...extra,
      },
    });

  it('unaudited (default): composer is offered "Only me" only', async () => {
    delete process.env.TIKTOK_AUDITED;
    const info = await creatorInfo('token-unaudited');
    expect(info.audited).toBe(false);
    expect(info.privacyLevelOptions).toEqual(['SELF_ONLY']);
    expect(info.nickname).toBe('ViralGenHub');
    expect(info.stitchDisabled).toBe(true);
  });

  it('audited: every option TikTok returns is offered', async () => {
    process.env.TIKTOK_AUDITED = 'true';
    const info = await creatorInfo('token-audited');
    expect(info.audited).toBe(true);
    expect(info.privacyLevelOptions).toEqual([
      'PUBLIC_TO_EVERYONE',
      'MUTUAL_FOLLOW_FRIENDS',
      'SELF_ONLY',
    ]);
  });

  it('unaudited: a post saved as public is sent as SELF_ONLY', () => {
    delete process.env.TIKTOK_AUDITED;
    expect(body('PUBLIC_TO_EVERYONE').post_info.privacy_level).toBe('SELF_ONLY');
    expect(body('SELF_ONLY').post_info.privacy_level).toBe('SELF_ONLY');
  });

  it('audited: the creator\'s choice is sent unchanged', () => {
    process.env.TIKTOK_AUDITED = 'true';
    expect(body('PUBLIC_TO_EVERYONE').post_info.privacy_level).toBe(
      'PUBLIC_TO_EVERYONE'
    );
  });

  it('still requires a privacy choice (no default)', () => {
    delete process.env.TIKTOK_AUDITED;
    expect(() => body('')).toThrow(BadBody);
  });

  it('unaudited: branded content is refused (it cannot be private)', () => {
    delete process.env.TIKTOK_AUDITED;
    expect(() =>
      body('PUBLIC_TO_EVERYONE', { brand_content_toggle: true })
    ).toThrow(/Branded content cannot be posted to TikTok yet/);
  });

  it('maps unaudited_client_can_only_post_to_private_accounts to the cause and fix', () => {
    const res = new TiktokProvider().handleErrors(
      JSON.stringify({
        error: {
          code: 'unaudited_client_can_only_post_to_private_accounts',
          message: 'Please review our integration guidelines',
        },
      })
    );
    expect(res?.type).toBe('bad-body');
    expect(res?.value).toMatch(/private TikTok accounts/);
    expect(res?.value).toMatch(/Private account/);
    expect(res?.value).not.toMatch(/contact support/);
  });

  it('maps privacy_level_option_mismatch with the unaudited rule', () => {
    delete process.env.TIKTOK_AUDITED;
    const res = new TiktokProvider().handleErrors(
      '{"error":{"code":"privacy_level_option_mismatch"}}'
    );
    expect(res?.value).toMatch(/Only me/);
  });
});
