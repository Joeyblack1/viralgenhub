#!/usr/bin/env node
// Fails (exit 1) when any translation.json has the same key twice in one object.
//
// JSON.parse silently keeps the LAST duplicate, so a repeated key hides a
// string that is never used and lets two translators edit "different" entries.
// This is a small hand-written scanner (no dependencies): it tokenises the
// file and records the keys of every object on a stack, reporting each key
// that appears a second time in the same object, with both line numbers.
//
// Usage: node scripts/check-json-duplicate-keys.mjs [file ...]
//   Default files: libraries/react-shared-libraries/src/translation/locales/*/translation.json

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const localesDir = join(
  root,
  'libraries/react-shared-libraries/src/translation/locales'
);

function defaultFiles() {
  if (!existsSync(localesDir)) return [];
  return readdirSync(localesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(localesDir, d.name, 'translation.json'))
    .filter((f) => existsSync(f))
    .sort();
}

// Returns a list of { key, line, firstLine } duplicates, or throws on a
// syntax problem it cannot get past (a real parse error is reported too).
export function findDuplicateKeys(text) {
  const duplicates = [];
  // Stack frames: { type: 'object', keys: Map<key, line>, expectKey: bool } | { type: 'array' }
  const stack = [];
  let i = 0;
  let line = 1;
  const n = text.length;

  const readString = () => {
    // text[i] === '"'
    let out = '';
    i++;
    while (i < n) {
      const ch = text[i];
      if (ch === '"') {
        i++;
        return out;
      }
      if (ch === '\\') {
        const next = text[i + 1];
        if (next === 'u') {
          out += String.fromCharCode(parseInt(text.slice(i + 2, i + 6), 16));
          i += 6;
        } else {
          const map = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '"': '"', '\\': '\\', '/': '/' };
          out += map[next] ?? next;
          i += 2;
        }
        continue;
      }
      if (ch === '\n') line++;
      out += ch;
      i++;
    }
    throw new Error(`unterminated string starting near line ${line}`);
  };

  while (i < n) {
    const ch = text[i];
    if (ch === '\n') {
      line++;
      i++;
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      i++;
      continue;
    }
    const top = stack[stack.length - 1];
    if (ch === '{') {
      stack.push({ type: 'object', keys: new Map(), expectKey: true });
      i++;
      continue;
    }
    if (ch === '[') {
      stack.push({ type: 'array' });
      i++;
      continue;
    }
    if (ch === '}' || ch === ']') {
      if (!top) throw new Error(`unexpected '${ch}' at line ${line}`);
      stack.pop();
      i++;
      continue;
    }
    if (ch === ',') {
      if (top && top.type === 'object') top.expectKey = true;
      i++;
      continue;
    }
    if (ch === ':') {
      if (top && top.type === 'object') top.expectKey = false;
      i++;
      continue;
    }
    if (ch === '"') {
      const startLine = line;
      const s = readString();
      if (top && top.type === 'object' && top.expectKey) {
        const first = top.keys.get(s);
        if (first !== undefined) {
          duplicates.push({ key: s, line: startLine, firstLine: first });
        } else {
          top.keys.set(s, startLine);
        }
      }
      continue;
    }
    // literal: number, true, false, null — skip to the next delimiter
    const m = /^[-+0-9.eEtrufalsn]+/.exec(text.slice(i, i + 40));
    if (!m) throw new Error(`unexpected character '${ch}' at line ${line}`);
    i += m[0].length;
  }
  if (stack.length) throw new Error('unbalanced brackets: file ended early');
  return duplicates;
}

function main(argv) {
  const files = argv.length ? argv.map((f) => resolve(f)) : defaultFiles();
  if (!files.length) {
    console.error('check-json-duplicate-keys: no files to check');
    return 1;
  }
  let failures = 0;
  for (const file of files) {
    const r = relative(root, file);
    const rel = r.startsWith('..') ? file : r;
    const text = readFileSync(file, 'utf8');
    let dups;
    try {
      JSON.parse(text); // a syntax error is a failure too
      dups = findDuplicateKeys(text);
    } catch (e) {
      console.error(`${rel}: ${e.message}`);
      failures++;
      continue;
    }
    for (const d of dups) {
      console.error(
        `${rel}:${d.line}: duplicate key "${d.key}" (first seen on line ${d.firstLine})`
      );
      failures++;
    }
  }
  if (failures) {
    console.error(`\n${failures} problem(s) in ${files.length} file(s). JSON.parse keeps the last value; delete the earlier occurrence(s).`);
    return 1;
  }
  console.log(`check-json-duplicate-keys: ${files.length} file(s) clean`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
