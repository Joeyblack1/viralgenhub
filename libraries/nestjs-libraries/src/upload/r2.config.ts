// Where the R2 S3 API lives for this bucket, and how public URLs map to keys.
//
// A bucket created with a jurisdiction (EU for ViralGenHub, so files stay in
// the EU) answers only on that jurisdiction's endpoint,
// https://<account>.eu.r2.cloudflarestorage.com; the default endpoint says the
// bucket does not exist. CLOUDFLARE_JURISDICTION picks it. CLOUDFLARE_ENDPOINT
// overrides the whole endpoint (an S3-compatible test server such as MinIO),
// and then path-style addressing is used, which those servers expect.
// https://developers.cloudflare.com/r2/reference/data-location/
const JURISDICTIONS = new Set(['eu', 'fedramp', 'us']);

type Env = Record<string, string | undefined>;

export const r2Endpoint = (env: Env = process.env) => {
  const custom = (env.CLOUDFLARE_ENDPOINT || '').trim();
  if (custom) {
    return custom.replace(/\/+$/, '');
  }
  const jurisdiction = (env.CLOUDFLARE_JURISDICTION || '').trim().toLowerCase();
  if (jurisdiction && !JURISDICTIONS.has(jurisdiction)) {
    throw new Error(
      `CLOUDFLARE_JURISDICTION must be one of ${[...JURISDICTIONS].join(
        ', '
      )} or empty`
    );
  }
  return `https://${env.CLOUDFLARE_ACCOUNT_ID}${
    jurisdiction ? `.${jurisdiction}` : ''
  }.r2.cloudflarestorage.com`;
};

export const r2ForcePathStyle = (env: Env = process.env) =>
  !!(env.CLOUDFLARE_ENDPOINT || '').trim();

// The public base of the bucket (custom domain), without a trailing slash, so
// `${base}/${key}` never has a double slash (.env.example shows one).
export const r2BucketUrl = (env: Env = process.env) =>
  (env.CLOUDFLARE_BUCKET_URL || '').trim().replace(/\/+$/, '');

// The object key behind a public URL of this bucket. Keys made by the app are
// at the bucket root; files moved from local storage keep their folders
// (2026/10/26/<name>.mp4), so a URL on the bucket maps to everything after the
// base. A bare key passes through; any other URL falls back to its last
// segment, as before.
export const r2KeyFromUrl = (value: string, env: Env = process.env) => {
  const input = (value || '').split(/[?#]/)[0];
  const base = r2BucketUrl(env);
  if (base && input.startsWith(base + '/')) {
    return safeKey(decodeURIComponent(input.slice(base.length + 1)));
  }
  if (/^https?:\/\//i.test(input)) {
    return safeKey(decodeURIComponent(input.split('/').pop() || ''));
  }
  return safeKey(input.replace(/^\/+/, ''));
};

const safeKey = (key: string) =>
  !key || key.split('/').some((part) => part === '..' || part === '')
    ? undefined
    : key;
