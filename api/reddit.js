export const config = { runtime: 'edge' };

const USER_AGENT =
  process.env.REDDIT_USER_AGENT ||
  'web:yah-forge-direct:v1.0.0 (by /u/yah-forge)';

const DEFAULT_MAX_COMMENTS = 200;
const MAX_COMMENTS_CAP = 500;
const DEFAULT_DEPTH = 10;

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const url = String(body?.url || '').trim();
  if (!url) {
    return jsonError('Missing required field: url', 400);
  }

  const postId = extractRedditPostId(url);
  if (!postId) {
    return jsonError('Not a valid Reddit thread URL. Paste a link like https://www.reddit.com/r/sub/comments/ID/title/', 400);
  }

  const maxComments = clampInt(body?.maxComments, DEFAULT_MAX_COMMENTS, 1, MAX_COMMENTS_CAP);
  const depth = clampInt(body?.depth, DEFAULT_DEPTH, 1, 20);

  try {
    const listing = await fetchRedditListing(postId, { maxComments, depth });
    const flattened = flattenRedditListing(listing, { maxComments, sourceUrl: url, postId });
    return jsonOk(flattened);
  } catch (err) {
    const message = err?.message || 'Failed to fetch Reddit thread';
    const status = err?.status || 502;
    return jsonError(message, status);
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonOk(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

function clampInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** @param {string} url */
export function extractRedditPostId(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  if (!['reddit.com', 'old.reddit.com', 'np.reddit.com', 'redd.it'].includes(host)) {
    return null;
  }

  if (host === 'redd.it') {
    return null;
  }

  const match = parsed.pathname.match(/\/comments\/([a-z0-9]+)/i);
  return match ? match[1] : null;
}

async function fetchRedditListing(postId, opts) {
  const query = new URLSearchParams({
    limit: String(Math.min(MAX_COMMENTS_CAP, opts.maxComments + 20)),
    depth: String(opts.depth),
    sort: 'confidence',
    raw_json: '1',
  });

  const jsonPath = `https://www.reddit.com/comments/${postId}/.json?${query}`;

  let res = await redditFetch(jsonPath);
  if (!res.ok && (res.status === 401 || res.status === 403 || res.status === 429)) {
    const token = await getOAuthToken();
    if (token) {
      const oauthPath = `https://oauth.reddit.com/comments/${postId}/.json?${query}`;
      res = await redditFetch(oauthPath, { bearer: token });
    }
  }

  if (!res.ok) {
    const hint =
      res.status === 403 || res.status === 429
        ? ' Reddit blocked the request from this server. Try again later, or set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET on the deployment for OAuth access.'
        : '';
    const err = new Error(`Reddit returned HTTP ${res.status}.${hint}`);
    err.status = res.status === 404 ? 404 : 502;
    throw err;
  }

  let data;
  try {
    data = await res.json();
  } catch {
    const err = new Error(
      'Reddit did not return JSON (thread may be private, quarantined, or blocked).'
    );
    err.status = 502;
    throw err;
  }

  if (!Array.isArray(data) || data.length < 2) {
    const err = new Error('Unexpected Reddit response format.');
    err.status = 502;
    throw err;
  }

  return data;
}

async function redditFetch(url, opts = {}) {
  const headers = {
    'User-Agent': USER_AGENT,
    Accept: 'application/json',
  };
  if (opts.bearer) {
    headers.Authorization = `Bearer ${opts.bearer}`;
  }

  return fetch(url, {
    method: 'GET',
    headers,
    redirect: 'follow',
  });
}

let cachedToken = null;
let cachedTokenExpires = 0;

async function getOAuthToken() {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const now = Date.now();
  if (cachedToken && cachedTokenExpires > now + 30_000) {
    return cachedToken;
  }

  const basic = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) return null;

  let payload;
  try {
    payload = await res.json();
  } catch {
    return null;
  }

  if (!payload?.access_token) return null;

  cachedToken = payload.access_token;
  cachedTokenExpires = now + (payload.expires_in || 3600) * 1000;
  return cachedToken;
}

function flattenRedditListing(listing, opts) {
  const postWrap = listing[0]?.data?.children?.[0];
  const post = postWrap?.data;
  if (!post || postWrap.kind !== 't3') {
    const err = new Error('Could not read Reddit post from response.');
    err.status = 502;
    throw err;
  }

  const lines = [];
  const authorTag = sanitizeSpeakerTag(post.author === '[deleted]' ? 'deleted' : post.author);
  const title = cleanText(post.title || '');
  const selftext = cleanText(post.selftext || '');

  lines.push(`[OP — ${authorTag}]: ${title}`);
  if (selftext) {
    lines.push('');
    lines.push(selftext);
  }

  const commentLines = [];
  const state = { count: 0, truncated: false, skipped: 0 };
  const commentChildren = listing[1]?.data?.children || [];
  walkComments(commentChildren, commentLines, state, opts.maxComments);

  if (commentLines.length) {
    lines.push('');
    lines.push('---');
    lines.push(`Comments (${state.count} loaded${state.truncated ? ', thread may have more' : ''}):`);
    lines.push('');
    lines.push(commentLines.join('\n\n'));
  }

  const subreddit = post.subreddit_name_prefixed || (post.subreddit ? `r/${post.subreddit}` : '');
  const permalink = post.permalink
    ? `https://www.reddit.com${post.permalink}`
    : opts.sourceUrl;

  return {
    text: lines.join('\n'),
    meta: {
      postId: opts.postId,
      title,
      subreddit,
      author: post.author || '',
      permalink,
      score: post.score ?? null,
      commentCount: state.count,
      skippedRemoved: state.skipped,
      truncated: state.truncated,
      sourceUrl: opts.sourceUrl,
    },
  };
}

function walkComments(children, lines, state, maxComments) {
  for (const child of children || []) {
    if (state.count >= maxComments) {
      state.truncated = true;
      return;
    }

    if (child.kind === 'more') {
      state.truncated = true;
      continue;
    }
    if (child.kind !== 't1') continue;

    const d = child.data;
    const body = cleanText(d.body || '');
    if (!body || body === '[removed]' || body === '[deleted]') {
      state.skipped += 1;
    } else {
      const author = d.author === '[deleted]' ? 'deleted' : d.author;
      const tag = sanitizeSpeakerTag(author);
      const scoreSuffix =
        typeof d.score === 'number' && d.score !== 0 ? ` (${d.score > 0 ? '+' : ''}${d.score})` : '';
      lines.push(`[${tag}]${scoreSuffix}: ${body}`);
      state.count += 1;
    }

    if (state.count >= maxComments) {
      state.truncated = true;
      return;
    }

    if (d.replies && typeof d.replies === 'object' && d.replies.data?.children?.length) {
      walkComments(d.replies.data.children, lines, state, maxComments);
    }
  }
}

function sanitizeSpeakerTag(name) {
  const raw = String(name || 'unknown')
    .trim()
    .replace(/[\[\]:]/g, '')
    .slice(0, 40);
  return raw || 'unknown';
}

function cleanText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .trim();
}
