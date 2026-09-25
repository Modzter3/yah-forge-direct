/**
 * Bonsai RunPod — OpenAI-compatible provider (env-driven, no client secrets).
 */

export const BONSAI_PROVIDER_ID = 'bonsai';
export const BONSAI_OFFLINE_PREFIX = 'Bonsai RunPod offline';

export function stripTrailingSlash(v) {
  return String(v || '').replace(/\/+$/, '');
}

export function getBonsaiConfig() {
  const baseUrl = stripTrailingSlash(process.env.BONSAI_BASE_URL || '');
  const apiKey = process.env.BONSAI_API_KEY || '';
  const model = String(process.env.BONSAI_MODEL || '').trim();
  const maxContext = Math.min(
    65536,
    Math.max(1024, parseInt(process.env.BONSAI_MAX_CONTEXT || '65536', 10) || 65536)
  );
  return { baseUrl, apiKey, model, maxContext };
}

export function isBonsaiProviderRequest(body) {
  const p = String(body?.provider || '').trim().toLowerCase();
  return p === BONSAI_PROVIDER_ID || p === 'bonsai runpod';
}

const BONSAI_STRIP_PARAMS = new Set([
  'web_search',
  'plugins',
  'thinking_budget',
  'thinking_level',
  'reasoning_effort',
  'yah_story_system',
]);

export function sanitizeBonsaiParameters(parameters) {
  const out = {};
  for (const [k, v] of Object.entries(parameters || {})) {
    if (BONSAI_STRIP_PARAMS.has(k)) continue;
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export function bonsaiOfflineError(detail) {
  const msg = detail
    ? `${BONSAI_OFFLINE_PREFIX}: ${detail}`
    : BONSAI_OFFLINE_PREFIX;
  return { error: msg, provider: BONSAI_PROVIDER_ID, offline: true };
}

export async function checkBonsaiHealth(config = getBonsaiConfig()) {
  if (!config.baseUrl) {
    return { ok: false, offline: true, error: 'BONSAI_BASE_URL is not configured' };
  }
  if (!config.apiKey) {
    return { ok: false, offline: true, error: 'BONSAI_API_KEY is not configured' };
  }
  let res;
  try {
    res = await fetch(`${config.baseUrl}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: 'application/json',
      },
    });
  } catch (err) {
    return {
      ok: false,
      offline: true,
      error: err.message || 'network unreachable',
    };
  }
  if (!res.ok) {
    const text = await safeReadText(res);
    return {
      ok: false,
      offline: true,
      status: res.status,
      error: text.slice(0, 400) || `HTTP ${res.status}`,
    };
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return {
    ok: true,
    offline: false,
    model: config.model,
    baseUrl: config.baseUrl,
    models: data?.data || data?.models || null,
  };
}

async function safeReadText(res) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

export function buildBonsaiUserContent(query, images) {
  const list = Array.isArray(images) ? images : [];
  if (list.length) {
    return { error: 'Bonsai RunPod does not support image input in this forge build.' };
  }
  return { content: query };
}

export function buildBonsaiChatPayload({ model, query, parameters, images, config, systemContent }) {
  const user = buildBonsaiUserContent(query, images);
  if (user.error) return { error: user.error };

  const params = sanitizeBonsaiParameters(parameters);
  const messages = [];
  if (systemContent && String(systemContent).trim()) {
    messages.push({ role: 'system', content: String(systemContent).trim() });
  }
  messages.push({ role: 'user', content: user.content });

  const payload = {
    model: model || config.model,
    messages,
    stream: true,
    ...params,
  };

  if (payload.max_tokens === undefined && config.maxContext) {
    payload.max_tokens = Math.min(8192, config.maxContext);
  }

  const includeUsage = (process.env.AI_INCLUDE_STREAM_USAGE || 'true').toLowerCase() !== 'false';
  if (includeUsage && payload.stream_options === undefined) {
    payload.stream_options = { include_usage: true };
  }

  return { payload };
}
