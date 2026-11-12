import assert from 'node:assert/strict';
import fs from 'node:fs';

// Keep in sync with public/index.html news dedupe helpers.
function normalizeNewsItemUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(String(url).trim());
    u.hash = '';
    const sp = u.searchParams;
    const toDrop = [];
    sp.forEach((v, k) => {
      if (/^utm_/i.test(k) || k === 'fbclid' || k === 'gclid' || k === 'ref') toDrop.push(k);
    });
    for (const k of toDrop) sp.delete(k);
    u.hostname = u.hostname.replace(/^www\./i, '').toLowerCase();
    const path = u.pathname.replace(/\/+$/, '') || '/';
    return `${u.protocol}//${u.hostname}${path}${sp.toString() ? `?${sp.toString()}` : ''}`;
  } catch {
    return String(url).replace(/\/$/, '').split('?')[0].toLowerCase();
  }
}

function newsHeadlineTokenList(headline) {
  const t = String(headline || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return [];
  const stop = new Set([
    'the', 'and', 'for', 'with', 'from', 'that', 'this', 'after', 'says', 'said', 'over', 'into',
    'about', 'their', 'will', 'have', 'has', 'been', 'were', 'are', 'was', 'not', 'its', 'it', 'all', 'out', 'new',
  ]);
  return t.split(' ').filter((w) => w.length > 2 && !stop.has(w));
}

function newsHeadlineSignature(headline) {
  const words = newsHeadlineTokenList(headline);
  words.sort();
  if (words.length >= 4) return words.slice(0, 14).join('|');
  return String(headline || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function newsHeadlinesLikelySameStory(a, b) {
  if (!a || !b) return false;
  const ua = normalizeNewsItemUrl(a.source_url || '');
  const ub = normalizeNewsItemUrl(b.source_url || '');
  if (ua && ub && ua === ub) return true;
  const sa = newsHeadlineSignature(a.headline || '');
  const sb = newsHeadlineSignature(b.headline || '');
  if (sa && sb && sa === sb) return true;
  const ta = newsHeadlineTokenList(a.headline || '');
  const tb = newsHeadlineTokenList(b.headline || '');
  if (ta.length < 3 || tb.length < 3) return false;
  const setB = new Set(tb);
  let inter = 0;
  for (const w of ta) if (setB.has(w)) inter++;
  const union = ta.length + tb.length - inter;
  if (union > 0 && inter / union >= 0.62) return true;
  const na = String(a.headline || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const nb = String(b.headline || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (na.length > 28 && nb.length > 28) {
    const chunkA = na.slice(0, 32);
    const chunkB = nb.slice(0, 32);
    if (na.indexOf(chunkB) !== -1 || nb.indexOf(chunkA) !== -1) return true;
  }
  return false;
}

function dedupeNewsItems(items) {
  const list = Array.isArray(items) ? items : [];
  const out = [];
  for (const item of list) {
    if (!item) continue;
    if (out.some((prev) => newsHeadlinesLikelySameStory(item, prev))) continue;
    out.push(item);
  }
  return out;
}

const sample = [
  {
    headline: 'Israel launches strikes on Gaza amid ceasefire talks',
    source_url: 'https://www.reuters.com/world/israel-strikes-gaza?utm_source=twitter',
  },
  {
    headline: 'Israel launches strikes on Gaza as ceasefire negotiations continue',
    source_url: 'https://www.bbc.com/news/world-middle-east-123',
  },
  {
    headline: 'Congress passes new surveillance bill',
    source_url: 'https://www.nytimes.com/2026/11/surveillance',
  },
  {
    headline: 'Congress passes new surveillance bill',
    source_url: 'https://www.nytimes.com/2026/11/surveillance/',
  },
];

const kept = dedupeNewsItems(sample);
assert.equal(kept.length, 2, 'two same-event pairs must collapse to two stories');
assert.ok(kept.some((k) => /Israel/i.test(k.headline)));
assert.ok(kept.some((k) => /Congress/i.test(k.headline)));
assert.equal(
  normalizeNewsItemUrl('https://WWW.Nytimes.com/x/?utm_source=x'),
  normalizeNewsItemUrl('https://nytimes.com/x'),
);

const html = fs.readFileSync('public/index.html', 'utf8');
assert.match(html, /newsHeadlinesLikelySameStory/);
assert.match(html, /ZERO DUPLICATE STORIES/);
assert.match(html, /maybeNewsScanDupeBanner/);
console.log('news-dedupe: url normalize, same-story collapse, prompt and UI hooks present');
