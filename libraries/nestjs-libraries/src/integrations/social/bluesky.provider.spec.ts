import 'reflect-metadata';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { BadBody } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import {
  BlueskyProvider,
  parseVideoUploadResponse,
} from './bluesky.provider';

// Bodies recorded from video.bsky.app on 27 Oct 2026 (see the comment above
// parseVideoUploadResponse), plus the 409 already_exists shape Bluesky's docs
// and client describe. No network: fetch is replaced per test.
const CID = 'bafkreibme22gw2h7y2h7tg2fhqotaqjucnbc24deqo72b6mkl2egezxhvy';
const BLOB = {
  $type: 'blob',
  ref: { $link: CID },
  mimeType: 'video/mp4',
  size: 16100000,
};
const UNCONFIRMED = {
  canUpload: false,
  error: 'unconfirmed_email',
  message: 'Confirm your email address to upload videos',
};

const caught = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error('expected a throw');
};

describe('parseVideoUploadResponse', () => {
  it('returns the job of a fresh upload (flat body)', () => {
    expect(
      parseVideoUploadResponse(
        200,
        JSON.stringify({ did: 'did:plc:x', jobId: 'job1', state: 'JOB_STATE_CREATED' })
      )
    ).toEqual({ jobId: 'job1' });
  });

  it('accepts the lexicon shape {jobStatus: {...}}', () => {
    expect(
      parseVideoUploadResponse(
        200,
        JSON.stringify({ jobStatus: { jobId: 'job2', state: 'JOB_STATE_CREATED' } })
      )
    ).toEqual({ jobId: 'job2' });
  });

  it('409 already_exists with the earlier jobId: reuses that job', () => {
    expect(
      parseVideoUploadResponse(
        409,
        JSON.stringify({
          did: 'did:plc:x',
          error: 'already_exists',
          jobId: 'job3',
          message: 'Video already processed',
          state: 'JOB_STATE_COMPLETED',
        })
      )
    ).toEqual({ jobId: 'job3' });
  });

  it('409 already_exists with a blob and no jobId: uses the blob', () => {
    expect(
      parseVideoUploadResponse(
        409,
        JSON.stringify({ did: 'did:plc:x', error: 'already_exists', jobId: '', state: 'JOB_STATE_FAILED', blob: BLOB })
      )
    ).toEqual({ jobId: '', blob: BLOB });
  });

  it('unconfirmed email: names the cause and the fix, does not retry', () => {
    const err: any = caught(() =>
      parseVideoUploadResponse(
        401,
        JSON.stringify({ did: '', jobId: '', state: '', ...UNCONFIRMED })
      )
    );
    expect(err).toBeInstanceOf(BadBody);
    expect(err.nonRetryable).toBe(true);
    expect(err.message).toMatch(/confirmed email address/);
    expect(err.message).toMatch(/Settings > Account/);
    expect(err.message).toMatch(/Nothing was published/);
  });

  it('daily limit: names the limit and keeps Bluesky\'s own words', () => {
    const err: any = caught(() =>
      parseVideoUploadResponse(
        429,
        JSON.stringify({ did: '', jobId: '', state: '', error: 'upload_limit_exceeded', message: 'Daily video limit reached' })
      )
    );
    expect(err).toBeInstanceOf(BadBody);
    expect(err.message).toMatch(/daily video upload limit/);
    expect(err.message).toMatch(/Daily video limit reached/);
  });

  it('any other refusal with an empty jobId fails clearly (was "missing jobId")', () => {
    const err: any = caught(() =>
      parseVideoUploadResponse(
        400,
        JSON.stringify({ did: '', error: 'missing token', jobId: '', state: '' })
      )
    );
    expect(err).toBeInstanceOf(BadBody);
    expect(err.message).toBe(
      "Bluesky's video service refused the upload (missing token). Nothing was published."
    );
  });

  it('a non-JSON 5xx is transient (plain Error, retried by the activity)', () => {
    const err: any = caught(() =>
      parseVideoUploadResponse(502, '<html>Bad gateway</html>')
    );
    expect(err).not.toBeInstanceOf(BadBody);
    expect(err.message).toMatch(/HTTP 502/);
  });

  it('a non-JSON 4xx is a definite refusal', () => {
    const err: any = caught(() =>
      parseVideoUploadResponse(413, 'Request Entity Too Large')
    );
    expect(err).toBeInstanceOf(BadBody);
    expect(err.message).toMatch(/HTTP 413/);
  });

  it('a failed job (not already_exists) fails with the reason', () => {
    const err: any = caught(() =>
      parseVideoUploadResponse(
        200,
        JSON.stringify({ jobId: 'job4', state: 'JOB_STATE_FAILED', error: 'bad_codec', message: 'Unsupported codec' })
      )
    );
    expect(err).toBeInstanceOf(BadBody);
    expect(err.message).toMatch(/Unsupported codec/);
  });
});

describe('BlueskyProvider video posts', () => {
  const env = { ...process.env };
  let fetchMock: jest.SpyInstance;
  let videoUrl: string;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'bsky-spec-'));
    writeFileSync(join(dir, 'clip.mp4'), Buffer.alloc(1024));
    process.env.STORAGE_PROVIDER = 'local';
    process.env.UPLOAD_DIRECTORY = dir;
    process.env.FRONTEND_URL = 'https://app.test';
    videoUrl = 'https://app.test/uploads/clip.mp4';
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = { ...env };
    jest.restoreAllMocks();
  });

  const json = (status: number, body: object) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  // routes each video-service call to a recorded body
  const routeFetch = (routes: Record<string, () => Response>) => {
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (input: any) => {
        const url = String(input?.url ?? input);
        const key = Object.keys(routes).find((k) => url.includes(k));
        if (!key) throw new Error('unexpected fetch ' + url);
        return routes[key]();
      });
  };

  const provider = () => {
    const p = new BlueskyProvider();
    jest.spyOn(p as any, 'getAgent').mockResolvedValue({
      dispatchUrl: new URL('https://pds.example'),
      session: { did: 'did:plc:test' },
      com: {
        atproto: {
          server: {
            getServiceAuth: jest.fn().mockResolvedValue({ data: { token: 't' } }),
          },
        },
      },
    });
    return p;
  };

  const post = (p: BlueskyProvider) =>
    p.postPending(
      'id',
      'token',
      [{ id: 'post-1', message: 'Launch', media: [{ path: videoUrl }] } as any],
      {} as any
    );

  it('unconfirmed email: fails before uploading, with the fix in the message', async () => {
    routeFetch({
      'app.bsky.video.getUploadLimits': () => json(401, UNCONFIRMED),
    });
    await expect(post(provider())).rejects.toThrow(/confirmed email address/);
    expect(
      fetchMock.mock.calls.some((c) => String(c[0]).includes('uploadVideo'))
    ).toBe(false);
  });

  it('limits reached (canUpload false, no error code): names the daily limit', async () => {
    routeFetch({
      'app.bsky.video.getUploadLimits': () =>
        json(200, { canUpload: false, remainingDailyVideos: 0, message: 'You have reached your daily limit' }),
    });
    await expect(post(provider())).rejects.toThrow(/daily video upload limit/);
  });

  it('409 already_exists: carries the earlier jobId into the checks', async () => {
    routeFetch({
      'app.bsky.video.getUploadLimits': () =>
        json(200, { canUpload: true, remainingDailyVideos: 100 }),
      'app.bsky.video.uploadVideo': () =>
        json(409, { did: 'did:plc:test', error: 'already_exists', jobId: 'job-old', message: 'Video already processed', state: 'JOB_STATE_COMPLETED' }),
    });
    const [res] = await post(provider());
    expect((res as any).pendingData.jobId).toBe('job-old');
  });

  it('409 with a blob and no jobId: the blob rides in pendingData as JSON', async () => {
    routeFetch({
      'app.bsky.video.getUploadLimits': () => json(200, { canUpload: true }),
      'app.bsky.video.uploadVideo': () =>
        json(409, { error: 'already_exists', jobId: '', state: 'JOB_STATE_COMPLETED', blob: BLOB }),
    });
    const [res] = await post(provider());
    const pending = (res as any).pendingData;
    expect(pending.videoBlob).toEqual(BLOB);
    expect(JSON.parse(JSON.stringify(pending)).videoBlob).toEqual(BLOB);
    // nothing to poll: the next check is ready straight away
    const check = await provider().checkPostStatus('t', pending, {} as any);
    expect(check.status).toBe('ready');
  });

  it('a limits check that cannot be made does not block the upload', async () => {
    routeFetch({
      'app.bsky.video.getUploadLimits': () => new Response('oops', { status: 502 }),
      'app.bsky.video.uploadVideo': () =>
        json(200, { did: 'did:plc:test', jobId: 'job-new', state: 'JOB_STATE_CREATED' }),
    });
    const [res] = await post(provider());
    expect((res as any).pendingData.jobId).toBe('job-new');
  });

  it('status check: an already_exists job with a blob is ready, not failed', async () => {
    routeFetch({
      'app.bsky.video.getJobStatus': () =>
        json(200, {
          jobStatus: { did: 'did:plc:test', jobId: 'job-old', state: 'JOB_STATE_FAILED', error: 'already_exists', message: 'Video already processed', blob: BLOB },
        }),
    });
    const check = await provider().checkPostStatus(
      't',
      { jobId: 'job-old', message: 'Launch', media: [] },
      {} as any
    );
    expect(check.status).toBe('ready');
  });
});
