export const config = { runtime: 'edge' };

/**
 * Server-side web search for providers that have no retrieval of their own
 * (NanoGPT, OpenCode Go, ClinePass, Refuseless). Those gateways are plain chat
 * completions -- there is no "web search switch" to flip -- so this module runs
 * the search and the caller injects the results into the prompt.
 *
 * Strategy: use a real search API when a key is configured (best quality), else
 * fall back to the keyless Bing HTML scrape this repo already uses for film
 * research. Returns [] on any failure so callers can degrade quietly.
 */

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 9000;
const MAX_RESULTS = 8;
/** Upper bound for news-scan injection (matches #newsResultCount max in the UI). */
export const FORGE_SEARCH_MAX_CAP = 25;
const SNIPPET_CAP = 320;

async function getText(url, init = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9', ...(init.headers || {}) },
    });
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(s) {
  return decodeEntities(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function hostOf(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Bing wraps result links as bing.com/ck/a?...&u=a1<base64url> */
function resolveBingUrl(href) {
  const url = decodeEntities(href);
  if (!/bing\.com\/ck\/a/.test(url)) return url;
  try {
    const u = new URL(url).searchParams.get('u') || '';
    if (u.startsWith('a1')) {
      let b = u.slice(2).replace(/-/g, '+').replace(/_/g, '/');
      b += '='.repeat((4 - (b.length % 4)) % 4);
      return atob(b);
    }
  } catch {
    return '';
  }
  return '';
}

function parseBingHtml(html) {
  const out = [];
  const blocks = String(html || '').split('<li class="b_algo"').slice(1);
  for (const block of blocks) {
    const href = (block.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"/) || [])[1] || '';
    const title = stripTags((block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/) || [])[1] || '');
    const snippet = stripTags((block.match(/<p[^>]*>([\s\S]*?)<\/p>/) || [])[1] || '');
    const url = resolveBingUrl(href);
    if (!/^https?:\/\//i.test(url)) continue;
    out.push({ title: title || hostOf(url), url, snippet: snippet.slice(0, SNIPPET_CAP) });
  }
  return out;
}

/** Bing News uses news-card blocks, not b_algo list items. */
function parseBingNewsHtml(html) {
  const out = [];
  const blocks = String(html || '').split('news-card newsitem cardcommon').slice(1);
  for (const block of blocks) {
    const url =
      (block.match(/\bdata-url="([^"]+)"/) || block.match(/\burl="([^"]+)"/) || [])[1] || '';
    const dataTitle = (block.match(/\bdata-title="([^"]*)"/) || [])[1];
    const title = stripTags(
      dataTitle || (block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/) || [])[1] || '',
    );
    const snippet = stripTags(
      (block.match(/<div class="snippet"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '',
    );
    if (!/^https?:\/\//i.test(url)) continue;
    out.push({ title: title || hostOf(url), url, snippet: snippet.slice(0, SNIPPET_CAP) });
  }
  return out;
}

const JUNK_URL_RX =
  /(?:account\.apple\.com|asw\.apple\.com|support\.apple\.com|\/sign-?in|\bsign in\b|\/login(?:\/|$)|\/log-?in|manage your .* account)/i;
const CORP_ROOT_HOSTS = new Set([
  'apple.com',
  'samsung.com',
  'google.com',
  'microsoft.com',
  'amazon.com',
]);

/** Drop corporate homepages and login pages that pollute generic web search. */
export function filterSearchResults(rows, opts = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const newsMode = opts.news === true;
  return list.filter((r) => {
    const url = String(r.url || '');
    const title = String(r.title || '');
    if (!/^https?:\/\//i.test(url)) return false;
    if (JUNK_URL_RX.test(`${title} ${url}`)) return false;
    if (!newsMode) return true;
    let path = '/';
    let host = '';
    try {
      const u = new URL(url);
      path = u.pathname || '/';
      host = u.hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      return false;
    }
    if (path === '/' || path === '/home' || path === '/store' || path === '/us') {
      if (CORP_ROOT_HOSTS.has(host)) return false;
    }
    if (title.length < 12) return false;
    return true;
  });
}

async function braveSearch(query, max) {
  const key = process.env.BRAVE_API_KEY;
  if (!key) return [];
  const text = await getText(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${max}`,
    { headers: { Accept: 'application/json', 'X-Subscription-Token': key } }
  );
  if (!text) return [];
  let parsed;
  try { parsed = JSON.parse(text); } catch { return []; }
  const rows = (parsed && parsed.web && parsed.web.results) || [];
  return rows.slice(0, max).map((r) => ({
    title: stripTags(r.title || ''),
    url: r.url || '',
    snippet: stripTags(r.description || '').slice(0, SNIPPET_CAP),
  })).filter((r) => /^https?:\/\//i.test(r.url));
}

async function tavilySearch(query, max) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  const text = await getText('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: key, query, max_results: max, search_depth: 'basic' }),
  });
  if (!text) return [];
  let parsed;
  try { parsed = JSON.parse(text); } catch { return []; }
  const rows = (parsed && parsed.results) || [];
  return rows.slice(0, max).map((r) => ({
    title: stripTags(r.title || ''),
    url: r.url || '',
    snippet: stripTags(r.content || '').slice(0, SNIPPET_CAP),
  })).filter((r) => /^https?:\/\//i.test(r.url));
}

async function serperSearch(query, max) {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  const text = await getText('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
    body: JSON.stringify({ q: query, num: max }),
  });
  if (!text) return [];
  let parsed;
  try { parsed = JSON.parse(text); } catch { return []; }
  const rows = (parsed && parsed.organic) || [];
  return rows.slice(0, max).map((r) => ({
    title: stripTags(r.title || ''),
    url: r.link || '',
    snippet: stripTags(r.snippet || '').slice(0, SNIPPET_CAP),
  })).filter((r) => /^https?:\/\//i.test(r.url));
}

async function serperNewsSearch(query, max) {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  const text = await getText('https://google.serper.dev/news', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
    body: JSON.stringify({ q: query, num: max }),
  });
  if (!text) return [];
  let parsed;
  try { parsed = JSON.parse(text); } catch { return []; }
  const rows = (parsed && parsed.news) || [];
  return rows.slice(0, max).map((r) => ({
    title: stripTags(r.title || ''),
    url: r.link || '',
    snippet: stripTags(r.snippet || '').slice(0, SNIPPET_CAP),
  })).filter((r) => /^https?:\/\//i.test(r.url));
}

async function bingScrape(query, max) {
  const html = await getText(
    `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${max}&setlang=en-US`,
  );
  if (!html) return [];
  return parseBingHtml(html).slice(0, max);
}

async function bingNewsScrape(query, max) {
  const html = await getText(
    `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&count=${max}&setlang=en-US`,
  );
  if (!html) return [];
  return parseBingNewsHtml(html).slice(0, max);
}

/** Returns [{ title, url, snippet }] -- empty array when nothing works. */
export async function searchWeb(query, opts = {}) {
  const q = String(query || '').trim().slice(0, 400);
  if (!q) return [];
  const max = Math.min(FORGE_SEARCH_MAX_CAP, Math.max(1, Number(opts.max) || MAX_RESULTS));
  const newsMode = opts.news === true;
  const strategies = newsMode
    ? [braveSearch, tavilySearch, serperNewsSearch, bingNewsScrape, bingScrape]
    : [braveSearch, tavilySearch, serperSearch, bingScrape];
  const tryStrategies = async (query) => {
    for (const run of strategies) {
      try {
        const rows = await run(query, max);
        const kept = filterSearchResults(rows, { news: newsMode });
        if (kept.length) return kept;
      } catch {
        // try the next strategy
      }
    }
    return [];
  };

  let results = await tryStrategies(q);
  if (!results.length && newsMode && q.length > 72) {
    const shorter = q.slice(0, 72).replace(/\s+\S*$/, '').trim();
    if (shorter && shorter !== q) results = await tryStrategies(shorter);
  }
  return results;
}

function dedupeSearchRows(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const u = String(r.url || '').trim().toLowerCase();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(r);
  }
  return out;
}

/** Merge two parallel news searches (one round-trip) for larger scan quotas without serial timeouts. */
export async function searchWebBatch(query, opts = {}) {
  const desired = Math.min(FORGE_SEARCH_MAX_CAP, Math.max(1, Number(opts.max) || MAX_RESULTS));
  const news = opts.news === true;
  if (desired <= 8) return searchWeb(query, { max: desired, news });
  const alt = `${String(query || '').replace(/\s+/g, ' ').trim()} latest`;
  const perQuery = Math.min(desired, 12);
  const [primary, extra] = await Promise.all([
    searchWeb(query, { max: perQuery, news }),
    searchWeb(alt, { max: perQuery, news }),
  ]);
  return dedupeSearchRows(primary.concat(extra)).slice(0, desired);
}

/** Compact context block the model can treat as the factual spine. */
export function formatWebSearchContext(results, opts = {}) {
  const rows = Array.isArray(results) ? results : [];
  if (!rows.length) return '';
  const label = opts.label || 'SEARCH';
  const when = opts.when || new Date().toISOString().slice(0, 10);
  const lines = rows.map((r, i) => `${i + 1}. ${r.title} -- ${hostOf(r.url)} -- ${r.url}${r.snippet ? '\n   ' + r.snippet : ''}`);
  const quota = Math.min(FORGE_SEARCH_MAX_CAP, Math.max(0, Number(opts.articleTarget) || 0));
  const quotaBlock =
    quota > 0
      ? [
          '',
          `SCAN QUOTA: The user asked for exactly ${quota} articles in JSON. Turn each numbered live result above into one article when it is a distinct story. If you see fewer than ${quota} stories above, run additional web searches and keep going until the JSON array has exactly ${quota} real articles. Never invent URLs or headlines.`,
          '',
        ].join('\n')
      : '';
  return [
    `LIVE ${label} RESULTS (retrieved ${when} from a real web search -- treat these as the factual spine; do not invent headlines, dates, or figures beyond them, and say so if they do not cover the question):`,
    ...lines,
    '',
    `RECENCY LOCK: today is ${when}. Items in these results are current; anything you remember from training data is NOT. If a result falls outside the requested date window, give its REAL date or drop it -- never present stale or remembered stories as recent news.`,
    quotaBlock,
    'END LIVE RESULTS.',
    '',
    'USER REQUEST:',
    '',
    '',
  ].join('\n');
}
