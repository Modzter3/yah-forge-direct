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

checkCollection(apocDir, 'apocrypha', 40);
checkCollection(sealedDir, 'sealed', 20);

const natasrym = path.join(apocDir, 'Book of Natasrym (Natsarim).json');
const natData = JSON.parse(fs.readFileSync(natasrym, 'utf8'));
if (Object.keys(natData.chapters).length !== 21) {
  throw new Error('Natasrym apoc copy should have 21 chapters');
}

console.log('test-apoc-local-corpus: all checks passed');
