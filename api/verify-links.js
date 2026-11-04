export const config = { runtime: 'edge' };

/**
 * Link checker for news scans.
 *
 * Cheap models pattern-complete plausible headlines and then invent a matching
 * URL. This endpoint probes each URL the model returned so the UI can mark a
 * story VERIFIED (the link resolves), DEAD (404/410/DNS), or UNVERIFIED (no link
 * at all). It never claims a headline is true -- only that the link resolves.
 */

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const TIMEOUT_MS = 7000;
const CONCURRENCY = 6;
const MAX_URLS = 30;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonOut(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function normalizeUrl(raw) {
  const s = String(raw || '').trim();
  if (!/^https?:\/\//i.test(s)) return '';
  try {
    const u = new URL(s);
    if (!u.hostname.includes('.') || u.hostname.endsWith('.')) return '';
    return u.toString();
  } catch {
    return '';
  }
}

async function probe(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const opts = {
    method: 'HEAD',
    redirect: 'follow',
    signal: ctrl.signal,
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml,*/*' },
  };
  try {
    let res = await fetch(url, opts);
    // Plenty of sites reject HEAD; retry those with GET (headers only are used).
    if (res.status === 400 || res.status === 403 || res.status === 405 || res.status === 501) {
      res = await fetch(url, { ...opts, method: 'GET' });
    }
    const status =	res.status;
    return {
      url,
      ok: status >= 200 && status < 400,
      status,
      finalUrl: res.url || url,
    };
  } catch (err) {
    return { url, ok: false, status: 0, reason: String((err && err.message) || err).slice(0, 140) };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
  if (req.method !== 'POST') return jsonOut({ error: 'Method not allowed' }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonOut({ error: 'Invalid JSON body' }, 400);
  }

  const raw = Array.isArray(body?.urls) ? body.urls : [];
  const urls = [];
  const seen = new Set();
  for (const entry of raw) {
    const url = normalizeUrl(entry);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= MAX_URLS) break;
  }
  if (!urls.length) return jsonOut({ results: [], checked: 0, skipped: raw.length });

  const results = [];
  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, i + CONCURRENCY);
    /* eslint-disable no-await-in-loop */
    const probed = await Promise.all(batch.map((u) => probe(u)));
    results.push(...probed);
  }

  return jsonOut({ results, checked: results.length, skipped: raw.length - urls.length });
}
