// ViralGenHub security headers (IMPROVEMENTS "security headers"). Pure data so
// scripts/check-security-headers.mjs can test it without building Next.
//
// The Content-Security-Policy is REPORT-ONLY on purpose: it never blocks
// anything, and it has no report-uri/report-to, so no violation data leaves the
// browser (read violations in the DevTools console). Tighten, then enforce,
// only after a week of clean console on prod.

const MEDIA = 'https://media.viralgenhub.com';

export const cspReportOnly = [
  "default-src 'self'",
  // Next.js needs inline bootstrap scripts; no 'unsafe-eval' (production Next does not use eval).
  [
    "script-src 'self' 'unsafe-inline'",
    'https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/',
    'https://js.stripe.com',
    'https://accounts.google.com/gsi/client https://appleid.cdn-apple.com',
    'https://www.googletagmanager.com https://connect.facebook.net https://*.posthog.com',
  ].join(' '),
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  // Channel avatars and previews come from many platform CDNs, hence https:.
  `img-src 'self' data: blob: https: ${MEDIA}`,
  `media-src 'self' blob: https: ${MEDIA}`,
  [
    "connect-src 'self' blob: data:",
    MEDIA, // browser PUT of uploads (presigned) and media reads
    'https://*.r2.cloudflarestorage.com', // S3 endpoint, if a presigned URL points there
    'https://api.stripe.com https://*.stripe.com',
    'https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/',
    'https://*.sentry.io https://*.ingest.sentry.io https://*.posthog.com',
    'https://www.googletagmanager.com https://*.google-analytics.com https://www.facebook.com',
    'https://accounts.google.com https://appleid.apple.com',
  ].join(' '),
  [
    "frame-src 'self'",
    'https://www.google.com/recaptcha/ https://recaptcha.google.com',
    'https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com',
    'https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com https://www.loom.com',
    'https://accounts.google.com https://appleid.apple.com https://www.googletagmanager.com',
  ].join(' '),
  "worker-src 'self' blob:", // Sentry Replay worker
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://appleid.apple.com https://accounts.google.com https://checkout.stripe.com",
  "frame-ancestors 'self'",
].join('; ');

export const securityHeaders = [
  // No includeSubDomains: postiz.viralgenhub.com (legacy box) and other
  // subdomains are not all HTTPS-only. The apex site sets the same value.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // The app is never framed by other sites (it frames only its own pages).
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // No camera/microphone/geolocation/usb anywhere in the app. payment stays
  // available to Stripe's embedded checkout frame (Apple Pay / Google Pay).
  {
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(), geolocation=(), usb=(), payment=(self "https://js.stripe.com" "https://checkout.stripe.com")',
  },
  { key: 'Content-Security-Policy-Report-Only', value: cspReportOnly },
  // Needed by Sentry's browserProfilingIntegration (initialize.sentry.client.ts).
  { key: 'Document-Policy', value: 'js-profiling' },
];
