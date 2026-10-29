// Run: node apps/frontend/scripts/check-security-headers.mjs
// Fails when the headers() config loses a required header, or when the CSP
// turns enforcing / gains a reporting endpoint by accident.
import assert from 'node:assert/strict';
import { securityHeaders, cspReportOnly } from '../security-headers.mjs';

const h = Object.fromEntries(securityHeaders.map((x) => [x.key, x.value]));
for (const k of [
  'Strict-Transport-Security',
  'X-Content-Type-Options',
  'Referrer-Policy',
  'X-Frame-Options',
  'Permissions-Policy',
  'Content-Security-Policy-Report-Only',
  'Document-Policy',
]) {
  assert.ok(h[k], `missing header ${k}`);
}
assert.ok(!('Content-Security-Policy' in h), 'CSP must stay report-only until Joseph enforces it');
assert.match(h['Strict-Transport-Security'], /max-age=31536000/);
assert.equal(h['X-Content-Type-Options'], 'nosniff');
assert.equal(h['X-Frame-Options'], 'SAMEORIGIN');
assert.match(h['Permissions-Policy'], /camera=\(\)/);
assert.match(h['Permissions-Policy'], /microphone=\(\)/);
assert.match(h['Permissions-Policy'], /geolocation=\(\)/);
assert.ok(!/report-(uri|to)/.test(cspReportOnly), 'CSP must not send reports to a third party');
for (const need of ['https://media.viralgenhub.com', 'js.stripe.com', 'google.com/recaptcha', "frame-ancestors 'self'", "object-src 'none'"]) {
  assert.ok(cspReportOnly.includes(need), `CSP lacks ${need}`);
}
console.log('security headers config OK');
