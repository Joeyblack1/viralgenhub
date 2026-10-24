// The streaming upload path: type sniffed from the first bytes, size cap
// enforced mid-stream, and an oversized file is rejected with the cap's own
// 400 on both the result and the source stream (#230: a webstreams teardown
// error used to win and surface as a 500)
jest.mock(
  'file-type',
  () => ({
    fileTypeFromBuffer: jest.fn(async (buf: Buffer) =>
      buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
        ? { mime: 'image/png', ext: 'png' }
        : undefined
    ),
  }),
  { virtual: true }
);

import { BadRequestException } from '@nestjs/common';
import { PassThrough, Readable, Writable } from 'stream';
import { pipeline } from 'stream/promises';
import { uploadStreamToStorage } from './custom.upload.validation';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngSource(totalBytes: number, chunk = 1024 * 1024) {
  let sent = 0;
  return new Readable({
    read() {
      if (sent >= totalBytes) return this.push(null);
      const n = Math.min(chunk, totalBytes - sent);
      const buf = Buffer.alloc(n, 1);
      if (sent === 0) PNG.copy(buf);
      sent += n;
      this.push(buf);
    },
  });
}

function sinkStorage() {
  const written = { bytes: 0 };
  const storage = {
    uploadStream: async (stream: Readable, mimetype: string, ext: string) => {
      await pipeline(
        stream,
        new Writable({
          write(c, _e, cb) {
            written.bytes += c.length;
            cb();
          },
        })
      );
      return { filename: `f.${ext}`, path: `/f.${ext}`, mimetype, originalname: 'f' };
    },
  } as any;
  return { storage, written };
}

describe('uploadStreamToStorage', () => {
  it('stores an image under the cap with its sniffed type', async () => {
    const { storage, written } = sinkStorage();
    const size = 3 * 1024 * 1024 + 7;
    const out = await uploadStreamToStorage(storage, pngSource(size));
    expect(out.ext).toBe('png');
    expect(out.mimetype).toBe('image/png');
    expect(written.bytes).toBe(size);
  });

  it('rejects an image one byte over the cap with the 400', async () => {
    const { storage } = sinkStorage();
    await expect(
      uploadStreamToStorage(storage, pngSource(30 * 1024 * 1024 + 1))
    ).rejects.toMatchObject({ status: 400, message: 'File is too large.' });
  });

  it('ends a source still streaming past the cap with the same 400', async () => {
    const { storage } = sinkStorage();
    // far over the cap, so the cap fires while bytes are still coming
    const src = pngSource(400 * 1024 * 1024);
    const srcError = new Promise<Error>((resolve) => src.on('error', resolve));
    await expect(uploadStreamToStorage(storage, src)).rejects.toMatchObject({
      status: 400,
      message: 'File is too large.',
    });
    const err = await srcError;
    expect(err).toBeInstanceOf(BadRequestException);
    expect(src.destroyed).toBe(true);
  });

  it('rejects an unknown type before touching storage', async () => {
    const { storage, written } = sinkStorage();
    const src = new PassThrough();
    src.end(Buffer.from('plain text, not an image'));
    await expect(uploadStreamToStorage(storage, src)).rejects.toMatchObject({
      status: 400,
      message: 'Unsupported file type.',
    });
    expect(written.bytes).toBe(0);
  });

  it('accepts a web ReadableStream source (URL uploads)', async () => {
    const { storage, written } = sinkStorage();
    const size = 70 * 1024;
    const web = Readable.toWeb(pngSource(size, 16 * 1024)) as any;
    const out = await uploadStreamToStorage(storage, web, size);
    expect(out.ext).toBe('png');
    expect(written.bytes).toBe(size);
  });
});
