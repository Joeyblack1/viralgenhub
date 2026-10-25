// Writes dist/manifest.json from manifest.json. The staging build adds the
// staging origin and a visible name suffix; production is manifest.json as is.
import fs from 'node:fs';

const m = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (process.env.EXT_ENV === 'staging') {
  m.name = 'ViralGenHub (staging)';
  m.host_permissions.push('https://staging.viralgenhub.com/*');
  m.externally_connectable.matches.push('https://staging.viralgenhub.com/*');
}
fs.writeFileSync('dist/manifest.json', JSON.stringify(m, null, 2) + '\n');
console.log(`manifest written (${process.env.EXT_ENV || 'production'})`);
