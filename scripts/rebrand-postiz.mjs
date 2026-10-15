#!/usr/bin/env node
// ViralGenHub rebrand helper. Re-run after every upstream (gitroomhq/postiz-app) sync:
//   node scripts/rebrand-postiz.mjs
// Replaces the standalone, capitalised word "Postiz" with the product name in user-visible
// strings only. It never touches lowercase identifiers/URLs/packages/env vars (postiz,
// POSTIZ_*, @postiz/*), comment lines, the footer attribution, SDK, extension or testimonials.
// Idempotent. Afterwards run: git diff --stat, and check `git grep -n Postiz` for new upstream strings.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const NAME = 'ViralGenHub';
const roots = [
  'apps/frontend/src',
  'apps/orchestrator/src',
  'apps/backend/src',
  'libraries/nestjs-libraries/src',
  'libraries/helpers/src',
  'libraries/react-shared-libraries/src/translation/locales',
];
const skip = [
  /source\.footer\.tsx$/, // AGPL attribution: "Built on Postiz"
  /testomonials\.tsx$/, // third-party quotes about Postiz (unused on our site)
  /initialize\.sentry/, // internal
  /revenuecat\.provider/, // internal comments
  /(^|\/)chat\/ui\//, // widget ids
];
const files = execSync(`git ls-files ${roots.join(' ')}`, { encoding: 'utf8' })
  .split('\n')
  .filter((f) => /\.(tsx?|json)$/.test(f) && !skip.some((r) => r.test(f)));

let changed = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const out = src
    .split('\n')
    .map((line) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return line; // comments
      return line.replace(/(?<![\w@./]|[A-Za-z0-9]-)Postiz(?![\w/]|-app|\.(?:com|pro|io)\b)/g, NAME);
    })
    .join('\n');
  if (out !== src) {
    writeFileSync(f, out);
    changed++;
    console.log('updated', f);
  }
}
console.log(`${changed} files updated`);
