import { BadRequestException } from '@nestjs/common';
import { pipeline, Readable, Transform } from 'stream';
import { IUploadProvider } from './upload.interface';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fileTypeStream } = require('file-type');

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
// stream cap is what really enforces the limit
export async function uploadStreamToStorage(
  storage: IUploadProvider,
  webStream: ReadableStream,
  declaredSize = 0
) {
  let sniffed: ReadableStream & { fileType?: { mime: string; ext: string } };
  try {
    sniffed = await fileTypeStream(webStream);
  } catch (err) {
    throw new BadRequestException('Failed to read file', { cause: err });
  }
  const detected = sniffed.fileType;
  if (!detected || !UPLOAD_ALLOWED_MIME.has(detected.mime)) {
    await sniffed.cancel();
    throw new BadRequestException('Unsupported file type.');
  }

  const maxSize = getMaxSize(detected.mime);
  if (declaredSize > maxSize) {
    await sniffed.cancel();
    throw new BadRequestException('File is too large.');
  }

  // pipeline (not pipe) so failing the cap also tears down the source.
  // Remember the cap's own rejection: tearing down the web stream can raise a
  // Node webstreams TypeError that would otherwise reach the caller as a 500.
  let capError: Error | undefined;
  const body = pipeline(
    Readable.fromWeb(sniffed as any),
    maxSizeStream(maxSize),
    (err) => {
      if (err instanceof BadRequestException) capError = err;
    }
  );

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
      // the source is already gone; nothing to clean up
    }
    if (err instanceof BadRequestException) throw err;
    if (capError) throw capError;
    throw err;
  }
}
