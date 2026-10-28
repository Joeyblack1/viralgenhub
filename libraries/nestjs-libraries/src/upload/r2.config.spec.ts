// file-type is ESM-only; these specs never sniff a file
jest.mock('file-type', () => ({ fileTypeFromBuffer: jest.fn() }), {
  virtual: true,
});

import {
  r2BucketUrl,
  r2Endpoint,
  r2ForcePathStyle,
  r2KeyFromUrl,
} from './r2.config';
import { CloudflareStorage } from './cloudflare.storage';

describe('R2 config (EU bucket, moved local files)', () => {
  it('uses the default endpoint without a jurisdiction', () => {
    expect(r2Endpoint({ CLOUDFLARE_ACCOUNT_ID: 'acc' })).toBe(
      'https://acc.r2.cloudflarestorage.com'
    );
  });

  it('uses the jurisdiction endpoint for an EU bucket', () => {
    expect(
      r2Endpoint({ CLOUDFLARE_ACCOUNT_ID: 'acc', CLOUDFLARE_JURISDICTION: 'EU ' })
    ).toBe('https://acc.eu.r2.cloudflarestorage.com');
  });

  it('refuses an unknown jurisdiction instead of guessing a host', () => {
    expect(() =>
      r2Endpoint({ CLOUDFLARE_ACCOUNT_ID: 'acc', CLOUDFLARE_JURISDICTION: 'uk' })
    ).toThrow(/CLOUDFLARE_JURISDICTION/);
  });

  it('lets a test server override the endpoint, path-style', () => {
    const env = { CLOUDFLARE_ENDPOINT: 'http://minio:9000/' };
    expect(r2Endpoint(env)).toBe('http://minio:9000');
    expect(r2ForcePathStyle(env)).toBe(true);
    expect(r2ForcePathStyle({})).toBe(false);
  });

  it('drops trailing slashes from the bucket URL', () => {
    expect(
      r2BucketUrl({ CLOUDFLARE_BUCKET_URL: 'https://media.example.com//' })
    ).toBe('https://media.example.com');
  });

  it('maps bucket URLs to keys, keeping folders of moved files', () => {
    const env = { CLOUDFLARE_BUCKET_URL: 'https://media.example.com/' };
    expect(r2KeyFromUrl('https://media.example.com/abc.png', env)).toBe(
      'abc.png'
    );
    expect(
      r2KeyFromUrl('https://media.example.com/2026/10/26/abc.mp4?x=1', env)
    ).toBe('2026/10/26/abc.mp4');
    expect(r2KeyFromUrl('abc.png', env)).toBe('abc.png');
    expect(r2KeyFromUrl('https://other.example.com/a/b.png', env)).toBe(
      'b.png'
    );
    expect(r2KeyFromUrl('https://media.example.com/../x', env)).toBe(
      undefined
    );
    expect(r2KeyFromUrl('', env)).toBe(undefined);
  });
});

describe('CloudflareStorage.removeFile', () => {
  it('deletes the full key of a moved file and builds clean public URLs', async () => {
    const storage = new CloudflareStorage(
      'acc',
      'key',
      'secret',
      'auto',
      'bucket',
      'https://media.example.com/'
    );
    const send = jest.fn().mockResolvedValue({});
    (storage as any)._client = { send };
    await storage.removeFile('https://media.example.com/2026/10/26/abc.mp4');
    await storage.removeFile('def.png');
    expect(send.mock.calls.map((c) => c[0].input)).toEqual([
      { Bucket: 'bucket', Key: '2026/10/26/abc.mp4' },
      { Bucket: 'bucket', Key: 'def.png' },
    ]);
    expect(storage.publicUrl('x.png')).toBe('https://media.example.com/x.png');
  });
});
