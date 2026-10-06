#!/usr/bin/env node
/** Smoke-test apocrypha + sealed corpus JSON under public/corpus/. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apocDir = path.join(root, 'public/corpus/apocrypha');
const sealedDir = path.join(root, 'public/corpus/sealed');

function loadManifest(dir) {
  const raw = fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8');
  return JSON.parse(raw);
}

function assertBookFile(dir, entry) {
  const fp = path.join(dir, entry.file);
  if (!fs.existsSync(fp)) throw new Error('missing file: ' + fp);
  const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
  if (!data.book || !data.chapters) throw new Error('invalid payload: ' + fp);
  const chCount = Object.keys(data.chapters).length;
  if (chCount !== entry.chapters) {
    throw new Error(`${entry.book}: manifest chapters ${entry.chapters} != json ${chCount}`);
  }
  const keys = Object.keys(data.chapters).sort((a, b) => Number(a) - Number(b));
  const first = data.chapters[keys[0]];
  if (!first || !/^\d+\.\s/.test(String(first).split('\n')[0] || '')) {
    throw new Error(`${entry.book}: first chapter missing numbered verses`);
  }
}

function checkCollection(dir, label, minBooks) {
  const manifest = loadManifest(dir);
  if (manifest.totalBooks < minBooks) {
    throw new Error(`${label}: expected >= ${minBooks} books, got ${manifest.totalBooks}`);
  }
  for (const entry of manifest.books) assertBookFile(dir, entry);
  console.log(`${label}: OK (${manifest.totalBooks} books, ${manifest.totalChapters} chapters)`);
}

checkCollection(apocDir, 'apocrypha', 56);
checkCollection(sealedDir, 'sealed', 35);

const natasrym = path.join(apocDir, 'Book of Natasrym (Natsarim).json');
const natData = JSON.parse(fs.readFileSync(natasrym, 'utf8'));
if (Object.keys(natData.chapters).length !== 21) {
  throw new Error('Natasrym apoc copy should have 21 chapters');
}

for (const dir of [sealedDir, apocDir]) {
  const enoch = JSON.parse(fs.readFileSync(path.join(dir, '1 Enoch (Ethiopian Enoch).json'), 'utf8'));
  const keys = Object.keys(enoch.chapters);
  if (keys.length !== 108) throw new Error('1 Enoch must have 108 chapters, got ' + keys.length);
  for (const key of keys) {
    const nums = [...String(enoch.chapters[key]).matchAll(/^(\d+)\.\s/gm)].map((m) => Number(m[1]));
    nums.forEach((n, i) => {
      if (n !== i + 1) throw new Error(`1 Enoch ${key}: verse numbering not contiguous at line ${i + 1} (got ${n})`);
    });
  }
  const ch10 = [...String(enoch.chapters['10']).matchAll(/^(\d+)\.\s/gm)].length;
  if (ch10 !== 22) throw new Error('1 Enoch 10 should have 22 verses, got ' + ch10);
}

console.log('test-apoc-local-corpus: all checks passed');
