import {
  UploadPartCommand,
  S3Client,
  ListPartsCommand,
  CreateMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Request, Response } from 'express';
import crypto from 'crypto';
import path from 'path';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import {
  r2BucketUrl,
  r2Endpoint,
  r2ForcePathStyle,
} from '@gitroom/nestjs-libraries/upload/r2.config';
import {
  MAX_MULTIPART_PARTS,
  isValidPartNumber,
  isWithinMaxSize,
} from '@gitroom/nestjs-libraries/upload/custom.upload.validation';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fileTypeFromBuffer } = require('file-type');

const ALLOWED_EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.mp4': 'video/mp4',
};

// Multipart uploads go through the normalizer, so they may also carry
// QuickTime, which it turns into an mp4; simple uploads never do
function multipartExtToMime(): Record<string, string> {
  return {
    ...ALLOWED_EXT_TO_MIME,
    ...(UploadFactory.processorEnabled() ? { '.mov': 'video/quicktime' } : {}),
  };
}

function normalizeExtension(filename: string): string | null {
  const ext = path.extname(filename || '').toLowerCase();
  return multipartExtToMime()[ext] ? ext : null;
}

const { CLOUDFLARE_ACCESS_KEY, CLOUDFLARE_SECRET_ACCESS_KEY, CLOUDFLARE_BUCKETNAME } =
  process.env;
const CLOUDFLARE_BUCKET_URL = r2BucketUrl();

// Built on first use: this module is imported by the media controller even on
// local storage, where there is no account and a bad jurisdiction must not
// stop the app from starting
let r2Client: S3Client | undefined;
const r2 = () =>
  (r2Client ||= new S3Client({
    region: 'auto',
    endpoint: r2Endpoint(),
    forcePathStyle: r2ForcePathStyle(),
    credentials: {
      accessKeyId: CLOUDFLARE_ACCESS_KEY!,
      secretAccessKey: CLOUDFLARE_SECRET_ACCESS_KEY!,
    },
  }));

// Function to generate a random string
function generateRandomString() {
  return makeId(20);
}

export default async function handleR2Upload(
  endpoint: string,
  req: Request,
  res: Response
) {
  switch (endpoint) {
    case 'create-multipart-upload':
      return createMultipartUpload(req, res);
    case 'prepare-upload-parts':
      return prepareUploadParts(req, res);
    case 'complete-multipart-upload':
      return completeMultipartUpload(req, res);
    case 'list-parts':
      return listParts(req, res);
    case 'abort-multipart-upload':
      return abortMultipartUpload(req, res);
    case 'sign-part':
      return signPart(req, res);
  }
  return res.status(404).end();
}

export async function simpleUpload(
  data: Buffer,
  originalFilename: string,
  _contentType: string
) {
  const detected = await fileTypeFromBuffer(data);
  if (!detected || !Object.values(ALLOWED_EXT_TO_MIME).includes(detected.mime)) {
    throw new Error('Unsupported file type.');
  }
  const fileExtension = `.${detected.ext}`;
  const safeContentType = detected.mime;
  const randomFilename = generateRandomString() + fileExtension;

  const params = {
    Bucket: CLOUDFLARE_BUCKETNAME,
    Key: randomFilename,
    Body: data,
    ContentType: safeContentType,
  };

  const command = new PutObjectCommand({ ...params });
  await r2().send(command);

  return CLOUDFLARE_BUCKET_URL + '/' + randomFilename;
}

export async function createMultipartUpload(req: Request, res: Response) {
  const { file, fileHash } = req.body;
  const safeExt = normalizeExtension(file?.name || '');
  if (!safeExt) {
    return res.status(400).json({ message: 'Unsupported file type.' });
  }
  const safeContentType = multipartExtToMime()[safeExt];
  // The client's own figure, so only a first gate: the real length is checked
  // against the same cap when the parts are joined
  if (!isWithinMaxSize(safeContentType, file?.size)) {
    return res.status(400).json({ message: 'File is too large.' });
  }
  const randomFilename = generateRandomString() + safeExt;

  try {
    const params = {
      Bucket: CLOUDFLARE_BUCKETNAME,
      Key: `${randomFilename}`,
      ContentType: safeContentType,
      Metadata: {
        'x-amz-meta-file-hash': fileHash,
      },
    };

    const command = new CreateMultipartUploadCommand({ ...params });
    const response = await r2().send(command);
    return res.status(200).json({
      uploadId: response.UploadId,
      key: response.Key,
    });
  } catch (err) {
    console.log('Error', err);
    return res.status(500).json({ source: { status: 500 } });
  }
}

export async function prepareUploadParts(req: Request, res: Response) {
  const { partData } = req.body;

  const parts = partData?.parts;
  if (
    !Array.isArray(parts) ||
    parts.length > MAX_MULTIPART_PARTS ||
    parts.some((part) => !isValidPartNumber(part?.number))
  ) {
    return res.status(400).json({ message: 'Invalid upload parts.' });
  }

  const response = {
    presignedUrls: {},
  };

  for (const part of parts) {
    try {
      const params = {
        Bucket: CLOUDFLARE_BUCKETNAME,
        Key: partData.key,
        PartNumber: part.number,
        UploadId: partData.uploadId,
      };
      const command = new UploadPartCommand({ ...params });
      const url = await getSignedUrl(r2(), command, { expiresIn: 3600 });

      // @ts-ignore
      response.presignedUrls[part.number] = url;
    } catch (err) {
      console.log('Error', err);
      return res.status(500).json(err);
    }
  }

  return res.status(200).json(response);
}

export async function listParts(req: Request, res: Response) {
  const { key, uploadId } = req.body;

  try {
    const params = {
      Bucket: CLOUDFLARE_BUCKETNAME,
      Key: key,
      UploadId: uploadId,
    };
    const command = new ListPartsCommand({ ...params });
    const response = await r2().send(command);

    return res.status(200).json(response['Parts']);
  } catch (err) {
    console.log('Error', err);
    return res.status(500).json(err);
  }
}

export async function completeMultipartUpload(req: Request, res: Response) {
  const { key, uploadId, parts } = req.body;
  if (
    !Array.isArray(parts) ||
    parts.length > MAX_MULTIPART_PARTS ||
    parts.some((part) => !isValidPartNumber(part?.PartNumber))
  ) {
    // the parts already uploaded would otherwise sit in the bucket
    try {
      await r2().send(
        new AbortMultipartUploadCommand({
          Bucket: CLOUDFLARE_BUCKETNAME,
          Key: key,
          UploadId: uploadId,
        })
      );
    } catch (err) {
      console.log('Error', err);
    }
    return res.status(400).json({ message: 'Invalid upload parts.' });
  }

  try {
    const command = new CompleteMultipartUploadCommand({
      Bucket: CLOUDFLARE_BUCKETNAME,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    });
    const response = await r2().send(command);

    const safeExt = normalizeExtension(key || '');
    if (!safeExt) {
      await r2().send(
        new DeleteObjectCommand({ Bucket: CLOUDFLARE_BUCKETNAME, Key: key })
      );
      return res.status(400).json({ message: 'Unsupported file type.' });
    }
    const expectedMime = multipartExtToMime()[safeExt];

    const head = await r2().send(
      new GetObjectCommand({
        Bucket: CLOUDFLARE_BUCKETNAME,
        Key: key,
        Range: 'bytes=0-4100',
      })
    );
    const chunks: Buffer[] = [];
    // @ts-ignore
    for await (const chunk of head.Body as AsyncIterable<Buffer>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const prefix = Buffer.concat(chunks);
    const detected = await fileTypeFromBuffer(prefix);

    // .mov and .mp4 are the same ISO BMFF family: a .mov with an ISO brand
    // sniffs as video/mp4 and a QuickTime-brand file is often named .mp4.
    // The normalizer reads both and always writes an mp4, so accept both
    // for either extension whenever it is on; without it .mp4 stays strict.
    const acceptedMimes =
      UploadFactory.processorEnabled() &&
      (safeExt === '.mov' || safeExt === '.mp4')
        ? ['video/quicktime', 'video/mp4']
        : [expectedMime];
    if (!detected || !acceptedMimes.includes(detected.mime)) {
      await r2().send(
        new DeleteObjectCommand({ Bucket: CLOUDFLARE_BUCKETNAME, Key: key })
      );
      return res
        .status(400)
        .json({ message: 'File contents do not match declared type.' });
    }

    // The joined object's real length, against the cap for the sniffed type;
    // the size declared at create time was the client's word only
    const totalSize = await multipartObjectSize(key, head.ContentRange);
    if (!isWithinMaxSize(detected.mime, totalSize)) {
      await r2().send(
        new DeleteObjectCommand({ Bucket: CLOUDFLARE_BUCKETNAME, Key: key })
      );
      return res.status(400).json({ message: 'File is too large.' });
    }

    response.Location =
      CLOUDFLARE_BUCKET_URL +
      '/' +
      response?.Location?.split('/').at(-1);
    return response;
  } catch (err) {
    console.log('Error', err);
    return res.status(500).json(err);
  }
}

// The ranged GetObject used for sniffing answers with
// `Content-Range: bytes 0-4100/<total>`, so the total usually comes for free;
// a HEAD is the fallback when the header is missing
async function multipartObjectSize(key: string, contentRange?: string) {
  const fromRange = /\/(\d+)$/.exec(contentRange || '');
  if (fromRange) {
    return Number(fromRange[1]);
  }
  const head = await r2().send(
    new HeadObjectCommand({ Bucket: CLOUDFLARE_BUCKETNAME, Key: key })
  );
  return head.ContentLength;
}

export async function abortMultipartUpload(req: Request, res: Response) {
  const { key, uploadId } = req.body;

  try {
    const params = {
      Bucket: CLOUDFLARE_BUCKETNAME,
      Key: key,
      UploadId: uploadId,
    };
    const command = new AbortMultipartUploadCommand({ ...params });
    const response = await r2().send(command);

    return res.status(200).json(response);
  } catch (err) {
    console.log('Error', err);
    return res.status(500).json(err);
  }
}

export async function signPart(req: Request, res: Response) {
  const { key, uploadId } = req.body;
  const partNumber = parseInt(req.body.partNumber);
  if (!isValidPartNumber(partNumber)) {
    return res.status(400).json({ message: 'Invalid upload parts.' });
  }

  const params = {
    Bucket: CLOUDFLARE_BUCKETNAME,
    Key: key,
    PartNumber: partNumber,
    UploadId: uploadId,
    Expires: 3600,
  };

  const command = new UploadPartCommand({ ...params });
  const url = await getSignedUrl(r2(), command, { expiresIn: 3600 });

  return res.status(200).json({
    url: url,
  });
}
