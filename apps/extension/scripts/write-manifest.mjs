// Writes dist/manifest.json from manifest.json. The staging build adds the
// staging origin and a visible name suffix; production is manifest.json as is.
import fs from 'node:fs';

const m = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));

// Each provider's hostPermission must be covered by manifest.json. 1.0.0 shipped with
// www.skool.com only while Skool sets its sign-in cookies on skool.com, so every connect failed.
const hostOf = (pattern) => pattern.split('://')[1].split('/')[0];
for (const f of fs.readdirSync('src/providers/list')) {
  const src = fs.readFileSync(`src/providers/list/${f}`, 'utf8');
  const want = src.match(/hostPermission:\s*'([^']+)'/)?.[1];
  if (want && !m.host_permissions.some((h) => hostOf(h) === hostOf(want))) {
    console.error(`${f}: manifest.json host_permissions must cover ${want}`);
    process.exit(1);
  }
}
if (process.env.EXT_ENV === 'staging') {
  m.name = 'ViralGenHub (staging)';
  m.host_permissions.push('https://staging.viralgenhub.com/*');
  m.externally_connectable.matches.push('https://staging.viralgenhub.com/*');
}
fs.writeFileSync('dist/manifest.json', JSON.stringify(m, null, 2) + '\n');
console.log(`manifest written (${process.env.EXT_ENV || 'production'})`);
