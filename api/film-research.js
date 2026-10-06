export const config = { runtime: 'edge' };

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const FETCH_TIMEOUT_MS = 9000;
const SCRIPT_CAP = 200000;
const FANDOM_CAP = 18000;
const RECAP_CAP = 12000;
const MAX_RECAPS = 3;

const DENY_HOSTS = [
  'bing.com', 'microsoft.com', 'youtube.com', 'youtu.be', 'facebook.com', 'instagram.com', 'pinterest.com',
  'twitter.com', 'x.com', 'tiktok.com', 'amazon.com', 'ebay.com', 'imdb.com', 'wikipedia.org', 'wikiquote.org',
  'rottentomatoes.com', 'metacritic.com', 'reddit.com', 'quora.com', 'netflix.com', 'hulu.com', 'disneyplus.com',
  'google.com', 'apple.com', 'play.google.com', 'fandango.com', 'justwatch.com', 'letterboxd.com',
];

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (req.method !== 'POST') {
    return jsonOut({ error: 'Method not allowed' }, 405);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonOut({ error: 'Invalid JSON body' }, 400);
  }

  const title = cleanTitle(String(body?.title || ''));
  if (!title) {
    return jsonOut({ error: 'Missing required field: title' }, 400);
  }
  const year = String(body?.year || '').match(/\b(?:19|20)\d{2}\b/)?.[0] || '';
  const hints = String(body?.hints || '').slice(0, 1500);
  const wantScript = body?.script !== false;
  const wantFandom = body?.fandom !== false;
  const wantRecaps = body?.recaps !== false;

  const log = [];
  const [script, fandom, recaps] = await Promise.all([
    wantScript ? safe(() => fetchScript(title, log), log, 'script') : null,
    wantFandom ? safe(() => fetchFandom(title, hints, log), log, 'fandom') : null,
    wantRecaps ? safe(() => fetchRecaps(title, year, log), log, 'recaps') : [],
  ]);

  return jsonOut({
    title,
    script: script || null,
    fandom: fandom || null,
    recaps: recaps || [],
    log,
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonOut(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

async function safe(fn, log, label) {
  try {
    return await fn();
  } catch (err) {
    log.push(`${label}: failed (${err?.message || err})`);
    return label === 'recaps' ? [] : null;
  }
}

async function getText(url, { json = false } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'en-US,en;q=0.9',
        Accept: json ? 'application/json' : 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return json ? await res.json() : await res.text();
  } finally {
    clearTimeout(t);
  }
}

function cleanTitle(raw) {
  return raw
    .replace(/\(\s*(?:19|20)\d{2}(?:\s+film)?\s*\)/gi, ' ')
    .replace(/\((?:film|movie)\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
}

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^(the|a|an) /, '')
    .trim();
}

function decodeEntities(s) {
  return String(s)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const c = Number(n);
      return c > 0 && c < 65536 ? String.fromCharCode(c) : ' ';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      const c = parseInt(n, 16);
      return c > 0 && c < 65536 ? String.fromCharCode(c) : ' ';
    });
}

function stripTags(s) {
  return decodeEntities(String(s).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').trim();
}

function htmlToArticleText(html, cap) {
  const cleaned = String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|figure|table)[\s\S]*?<\/\1>/gi, ' ');
  const out = [];
  const re = /<(p|h2|h3|h4|li)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  let total = 0;
  while ((m = re.exec(cleaned))) {
    const tag = m[1].toLowerCase();
    const txt = stripTags(m[2]);
    if (!txt) continue;
    if (tag === 'p' || tag === 'li') {
      if (txt.length < 45) continue;
      if (/cookie|subscribe|newsletter|privacy policy|all rights reserved|sign up/i.test(txt)) continue;
      out.push(txt);
    } else {
      out.push(`\n${txt.toUpperCase()}:`);
    }
    total += txt.length;
    if (total > cap * 1.3) break;
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, cap);
}

function scriptSlugs(title) {
  const words = title.replace(/[^A-Za-z0-9\s'-]/g, ' ').replace(/'/g, '').split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const plain = words.join('-');
  const out = [plain];
  if (/^(the|a|an)$/i.test(words[0]) && words.length > 1) {
    out.push(`${words.slice(1).join('-')},-${words[0][0].toUpperCase()}${words[0].slice(1).toLowerCase()}`);
    out.push(words.slice(1).join('-'));
  }
  return [...new Set(out)];
}

async function fetchScript(title, log) {
  for (const slug of scriptSlugs(title)) {
    const url = `https://imsdb.com/scripts/${slug}.html`;
    let html;
    try {
      html = await getText(url);
    } catch {
      continue;
    }
    const pres = [...html.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/gi)].map((x) => x[1]);
    if (!pres.length) continue;
    const biggest = pres.sort((a, b) => b.length - a.length)[0];
    const text = decodeEntities(biggest.replace(/<[^>]+>/g, ''))
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (text.length < 8000) continue;
    log.push(`script: IMSDb (${text.length.toLocaleString()} chars)`);
    return { source: 'IMSDb', url, text: text.slice(0, SCRIPT_CAP) };
  }
  log.push('script: none found on IMSDb');
  return null;
}

function fandomSlugCandidates(title, hints) {
  const words = norm(title).split(' ').filter(Boolean);
  const out = [];
  if (words.length) {
    out.push(words.join(''));
    out.push(words[0]);
    if (words.length > 1) out.push(words.slice(0, 2).join(''));
    out.push(`the${words[0]}`);
  }
  const franchise = [...String(hints).matchAll(/\b(?:in|of|from|to)\s+(?:the\s+)?([A-Z][\w' ]{2,40}?)\s+(?:series|franchise|trilogy|saga|universe|films?)\b/g)];
  for (const f of franchise) {
    const n = norm(f[1]).replace(/ /g, '');
    if (n) {
      out.push(n);
      out.push(`the${n}`);
    }
  }
  return [...new Set(out.filter((s) => s.length >= 3 && s.length <= 40))].slice(0, 7);
}

async function fetchFandom(title, hints, log) {
  const want = norm(title).split(' ').filter(Boolean);
  const tryHost = async (slug) => {
    const host = `${slug}.fandom.com`;
    const search = await getText(
      `https://${host}/api.php?action=query&list=search&srsearch=${encodeURIComponent(title)}&srlimit=5&format=json`,
      { json: true }
    );
    const hits = search?.query?.search || [];
    const best = hits.find((h) => {
      const tokens = norm(h.title).split(' ').filter(Boolean);
      return (
        want.every((w) => tokens.includes(w)) &&
        tokens.length <= want.length + 2 &&
        !/\/(cast|gallery|quotes|transcript|soundtrack|credits)$/i.test(h.title)
      );
    });
    if (!best) return null;
    const parsed = await getText(
      `https://${host}/api.php?action=parse&page=${encodeURIComponent(best.title)}&prop=text&format=json&redirects=1`,
      { json: true }
    );
    const html = parsed?.parse?.text?.['*'] || '';
    const text = htmlToArticleText(html, FANDOM_CAP);
    if (text.length < 1200) return null;
    return { source: `${slug}.fandom.com`, title: best.title, url: `https://${host}/wiki/${encodeURIComponent(best.title.replace(/ /g, '_'))}`, text };
  };
  for (const slug of fandomSlugCandidates(title, hints)) {
    try {
      const hit = await tryHost(slug);
      if (hit) {
        log.push(`fandom: ${hit.source} / ${hit.title} (${hit.text.length.toLocaleString()} chars)`);
        return hit;
      }
    } catch {
      // wiki does not exist for this slug; try the next
    }
  }
  log.push('fandom: no matching fan wiki found');
  return null;
}

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

async function bingSearch(query) {
  const html = await getText(`https://www.bing.com/search?q=${encodeURIComponent(query)}&count=12&setlang=en-US`);
  const urls = [];
  const re = /<li class="b_algo"[\s\S]*?<h2[^>]*><a[^>]*href="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const u = resolveBingUrl(m[1]);
    if (/^https?:\/\//.test(u)) urls.push(u);
  }
  return urls;
}

function hostOf(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

async function fetchRecaps(title, year, log) {
  const queries = [
    `"${title}" ${year} movie full plot summary recap spoilers scene by scene`,
    `"${title}" ${year} film detailed synopsis walkthrough ending explained`,
    `"${title}" ${year} plot recap site:fandom.com`,
  ];
  const seen = new Set();
  const candidates = [];
  const lists = await Promise.all(queries.map((q) => bingSearch(q).catch(() => [])));
  for (const list of lists) {
    for (const u of list) {
      const host = hostOf(u);
      if (!host || DENY_HOSTS.some((d) => host === d || host.endsWith(`.${d}`))) continue;
      if (/\.(pdf|jpg|png)$/i.test(u) || seen.has(u)) continue;
      seen.add(u);
      candidates.push(u);
    }
  }
  const want = norm(title).split(' ').filter(Boolean);
  const results = [];
  const batch = candidates.slice(0, 8);
  const pages = await Promise.all(
    batch.map(async (u) => {
      try {
        const html = await getText(u);
        const pageTitle = stripTags((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
        const text = htmlToArticleText(html, RECAP_CAP);
        return { url: u, title: pageTitle, text };
      } catch {
        return null;
      }
    })
  );
  for (const p of pages) {
    if (!p || p.text.length < 2500) continue;
    const headTokens = norm(`${p.title} ${p.text.slice(0, 800)}`).split(' ');
    if (!want.every((w) => headTokens.includes(w))) continue;
    const bodyNorm = ` ${norm(p.text)} `;
    if (!bodyNorm.includes(` ${norm(title)} `)) continue;
    if (!/\b(film|movie)\b/i.test(p.text.slice(0, 2500))) continue;
    if (!/\b(plot|synopsis|recap|summary|ending|spoiler|story)\b/i.test(p.title + p.text.slice(0, 1500))) continue;
    results.push({ source: hostOf(p.url), url: p.url, title: p.title.slice(0, 140), text: p.text });
    if (results.length >= MAX_RECAPS) break;
  }
  log.push(results.length ? `recaps: ${results.map((r) => r.source).join(', ')}` : 'recaps: no readable recap pages found');
  return results;
}
