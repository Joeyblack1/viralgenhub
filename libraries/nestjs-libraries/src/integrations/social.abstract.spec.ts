import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { localUploadPath, SocialAbstract } from './social.abstract';

describe('localUploadPath', () => {
  const env = { ...process.env };
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'vgh-uploads-'));
    mkdirSync(join(root, '2026', '10', '25'), { recursive: true });
    writeFileSync(join(root, '2026', '10', '25', 'clip.mp4'), 'video');
    process.env.STORAGE_PROVIDER = 'local';
    process.env.UPLOAD_DIRECTORY = root;
    process.env.FRONTEND_URL = 'https://app.example.com';
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it('maps a public upload URL to the file on disk', () => {
    expect(
      localUploadPath('https://app.example.com/uploads/2026/10/25/clip.mp4')
    ).toBe(join(root, '2026', '10', '25', 'clip.mp4'));
  });

  it('ignores query strings', () => {
    expect(
      localUploadPath('https://app.example.com/uploads/2026/10/25/clip.mp4?v=1')
    ).toBe(join(root, '2026', '10', '25', 'clip.mp4'));
  });

  it('leaves other hosts, other storage and missing files alone', () => {
    expect(localUploadPath('https://cdn.other.com/uploads/2026/10/25/clip.mp4')).toBeUndefined();
    expect(localUploadPath('https://app.example.com/uploads/2026/10/25/none.mp4')).toBeUndefined();
    process.env.STORAGE_PROVIDER = 'cloudflare';
    expect(localUploadPath('https://app.example.com/uploads/2026/10/25/clip.mp4')).toBeUndefined();
  });

  it('never resolves outside the upload directory', () => {
    writeFileSync(join(root, '..', 'secret.txt'), 'x');
    expect(localUploadPath('https://app.example.com/uploads/../secret.txt')).toBeUndefined();
    expect(localUploadPath('https://app.example.com/uploads/%2e%2e/secret.txt')).toBeUndefined();
  });
});

// The shared media reads go to disk for our own uploads: the CDN in front of
// them drops content-length on HEAD and ignores Range (IMPROVEMENTS #316).
describe('media reads (mediaSize, mediaStream, mediaChunk, readOrFetch)', () => {
  class TestProvider extends SocialAbstract {
    identifier = 'test';
    size = (path: string) => this.mediaSize(path, this.identifier);
    stream = (path: string) => this.mediaStream(path, this.identifier);
    chunk = (path: string, start: number, end: number) =>
      this.mediaChunk(path, start, end, this.identifier);
    read = (path: string) => this.readOrFetch(path);
  }

  const env = { ...process.env };
  const own = 'https://app.example.com/uploads/2026/10/25/clip.mp4';
  const provider = new TestProvider();
  let root: string;
  let fetchMock: jest.SpyInstance;

  const readAll = async (stream: NodeJS.ReadableStream) => {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk as Buffer));
    }
    return Buffer.concat(chunks).toString();
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'vgh-uploads-'));
    mkdirSync(join(root, '2026', '10', '25'), { recursive: true });
    writeFileSync(join(root, '2026', '10', '25', 'clip.mp4'), 'video-bytes');
    process.env.STORAGE_PROVIDER = 'local';
    process.env.UPLOAD_DIRECTORY = root;
    process.env.FRONTEND_URL = 'https://app.example.com';
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response('remote-bytes', {
        status: 200,
        headers: { 'content-length': '42' },
      }) as any
    );
  });
  afterEach(() => {
    fetchMock.mockRestore();
    process.env = { ...env };
  });

  it('reads our own upload from disk, without any HTTP request', async () => {
    expect(await provider.size(own)).toBe('video-bytes'.length);
    expect(await readAll(await provider.stream(own))).toBe('video-bytes');
    expect((await provider.chunk(own, 2, 6)).toString()).toBe('deo-b');
    expect((await provider.read(own)).toString()).toBe('video-bytes');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to HTTP when the upload is not on disk', async () => {
    const missing = 'https://app.example.com/uploads/2026/10/25/none.mp4';
    expect(await provider.size(missing)).toBe(42);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(missing);
    expect(fetchMock.mock.calls[0][1].method).toBe('HEAD');
  });

  it('uses HTTP for a URL that is not ours', async () => {
    const remote = 'https://cdn.other.com/uploads/2026/10/25/clip.mp4';
    expect(await provider.size(remote)).toBe(42);
    expect(await readAll(await provider.stream(remote))).toBe('remote-bytes');
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([remote, remote]);
  });

  it('uses HTTP for our URL when storage is not local', async () => {
    process.env.STORAGE_PROVIDER = 'cloudflare';
    expect(await provider.size(own)).toBe(42);
    expect(fetchMock.mock.calls[0][0]).toBe(own);
  });

  it('still refuses a remote size it cannot read', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }) as any);
    await expect(
      provider.size('https://cdn.other.com/uploads/clip.mp4')
    ).rejects.toThrow('Could not determine the media size for upload');
  });
});
