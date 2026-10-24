import { BadRequestException } from '@nestjs/common';
import { pipeline, Readable, Transform } from 'stream';
import { IUploadProvider } from './upload.interface';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fileTypeFromBuffer } = require('file-type');

// What users may put in the media library, whether by multipart upload or
// from a remote URL; narrower than what storage itself accepts, no audio
export const UPLOAD_ALLOWED_MIME = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/tiff',
  'video/mp4',
]);

export function getMaxSize(mimeType: string): number {
  if (mimeType.startsWith('image/')) {
    // what the composer's uploader promises (new.uploader.tsx); the R2
    // multipart path accepted images of this size long before it had a cap
    return 30 * 1024 * 1024; // 30 MB
  } else if (mimeType.startsWith('video/')) {
    return 1024 * 1024 * 1024; // 1 GB
  } else {
    throw new BadRequestException('Unsupported file type.');
  }
}

// Multipart (R2) uploads: the client declares the size up front and the joined
// object's real length is checked once the parts are complete. Uppy cuts a
// file into parts of at least 5 MiB, so the 1 GB video cap never needs more
// than 205 parts; a client asking for more is not uploading a file we accept.
export const MAX_MULTIPART_PARTS = 300;

export function isValidPartNumber(value: unknown): value is number {
  const n = typeof value === 'string' ? Number(value) : value;
  return (
    typeof n === 'number' &&
    Number.isInteger(n) &&
    n >= 1 &&
    n <= MAX_MULTIPART_PARTS
  );
}

// A size is acceptable only when it is a real byte count within the cap for
// the type; a missing, negative or non-numeric size is rejected, never waved
// through
export function isWithinMaxSize(mimeType: string, size: unknown): boolean {
  const n = typeof size === 'string' ? Number(size) : size;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) {
    return false;
  }
  try {
    return n <= getMaxSize(mimeType);
  } catch (err) {
    return false;
  }
}

// Passes bytes through and fails once they exceed maxSize, so a body with a
// missing or lying Content-Length cannot be streamed into storage unbounded
export function maxSizeStream(maxSize: number) {
  let total = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += chunk.length;
      if (total > maxSize) {
        return callback(new BadRequestException('File is too large.'));
      }
      callback(null, chunk);
    },
  });
}

// Sniffs the real type from the first bytes, applies the per-type size cap
// and streams the rest into storage, so only the sniffing prefix and a few
// upload parts are ever in memory. Rejections are BadRequestException with
// the same messages the old buffer validation used. `declaredSize` is the
// Content-Length when the sender gave one; it may be absent or wrong, so the
// stream cap is what really enforces the limit.
//
// Everything here stays on Node streams: an earlier version sniffed the type
// through file-type's web-stream wrapper, and tearing that wrapper down when
// the cap fired raised a webstreams TypeError that became the reason multer's
// file stream was destroyed with, so the client saw a 500 instead of the 400.

// Bytes file-type needs to recognise every type we accept
const SNIFF_BYTES = 4100;

// Reads up to `want` bytes without taking the stream out of paused mode, so
// the rest can still be piped afterwards
function readHead(src: Readable, want: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const cleanup = () => {
      src.off('readable', onReadable);
      src.off('end', onEnd);
      src.off('error', onError);
    };
    const onEnd = () => {
      cleanup();
      resolve(Buffer.concat(chunks));
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const onReadable = () => {
      let chunk: Buffer | null;
      while (size < want && (chunk = src.read()) !== null) {
        chunks.push(chunk);
        size += chunk.length;
      }
      if (size >= want) {
        onEnd();
      }
    };
    src.on('readable', onReadable);
    src.on('end', onEnd);
    src.on('error', onError);
  });
}

export async function uploadStreamToStorage(
  storage: IUploadProvider,
  source: Readable | ReadableStream,
  declaredSize = 0
) {
  const src: Readable =
    source instanceof Readable ? source : Readable.fromWeb(source as any);

  let head: Buffer;
  let detected: { mime: string; ext: string } | undefined;
  try {
    head = await readHead(src, SNIFF_BYTES);
    detected = await fileTypeFromBuffer(head);
  } catch (err) {
    src.destroy();
    throw new BadRequestException('Failed to read file', { cause: err });
  }
  if (!detected || !UPLOAD_ALLOWED_MIME.has(detected.mime)) {
    src.destroy();
    throw new BadRequestException('Unsupported file type.');
  }

  const maxSize = getMaxSize(detected.mime);
  if (declaredSize > maxSize) {
    src.destroy();
    throw new BadRequestException('File is too large.');
  }

  // The head goes first, then whatever is still to come from the source.
  // destroyOnReturn: false keeps the source alive when the joined stream is
  // torn down, so the pipeline callback below ends it with the real error
  const joined = Readable.from(
    (async function* () {
      yield head;
      // readable.iterator() exists since Node 16.3; the repo's @types/node is older
      const chunks: AsyncIterable<Buffer> = (src as any).iterator({
        destroyOnReturn: false,
      });
      for await (const chunk of chunks) {
        yield chunk;
      }
    })()
  );

  // pipeline (not pipe) so failing the cap also tears down the joined stream;
  // the source is then ended with the same error, which is what multer (or
  // the URL fetch) reports: a 400, never a teardown error
  let failure: Error | undefined;
  const body = pipeline(joined, maxSizeStream(maxSize), (err) => {
    if (err) {
      failure = failure || err;
      if (!src.destroyed) {
        src.destroy(err);
      }
    }
  });

  try {
    const uploaded = await storage.uploadStream(
      body,
      detected.mime,
      detected.ext
    );
    return { ...uploaded, ext: detected.ext };
  } catch (err) {
    // The size cap rejects mid-upload with its own BadRequestException
    try {
      body.destroy();
    } catch {
      // already gone
    }
    if (err instanceof BadRequestException) throw err;
    if (failure instanceof BadRequestException) throw failure;
    throw err;
  }
}
