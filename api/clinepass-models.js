import {
  CLINEPASS_BUILTIN_MODELS,
  mapUpstreamClinePassRow,
  mergeClinePassCatalog,
} from './clinepass-catalog.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const keyCandidates = ['CLINEPASS_API_KEY', 'CLINE_API_KEY'];
  let apiKey = '';
  for (const envName of keyCandidates) {
    const v = process.env[envName];
    if (v && String(v).trim()) {
      apiKey = String(v).trim();
      break;
    }
  }

  const base = String(
    process.env.CLINEPASS_BASE_URL || process.env.CLINE_BASE_URL || 'https://api.cline.bot/api/v1'
  ).replace(/\/+$/, '');

  let live = [];
  let upstreamNote = '';

  if (apiKey) {
    try {
      const upstream = await fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: req.signal,
      });
      if (upstream.ok) {
        const json = await upstream.json();
        if (Array.isArray(json.data)) {
          live = json.data.map(mapUpstreamClinePassRow).filter(Boolean);
        } else {
          upstreamNote = 'Unexpected Cline model catalog format; showing built-in ClinePass list.';
        }
      } else {
        upstreamNote = `Cline model catalog HTTP ${upstream.status}; showing built-in ClinePass list.`;
      }
    } catch (_) {
      upstreamNote = 'Could not reach Cline model catalog; showing built-in ClinePass list.';
    }
  } else {
    upstreamNote = 'Add CLINEPASS_API_KEY (or CLINE_API_KEY) in Vercel to refresh catalog metadata. Built-in ClinePass slugs work for generation once the key is set.';
  }

  const data = mergeClinePassCatalog(live);
  const body = { data };
  if (upstreamNote) body.note = upstreamNote;

  return Response.json(body, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
