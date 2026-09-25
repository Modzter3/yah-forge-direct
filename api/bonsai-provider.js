/**
 * Bonsai RunPod — OpenAI-compatible provider (env-driven, no client secrets).
 */

export const BONSAI_PROVIDER_ID = 'bonsai';
export const BONSAI_OFFLINE_PREFIX = 'Bonsai RunPod offline';

/** Default llama-server sampling for Bonsai (override via BONSAI_* env). */
export function getBonsaiGenerationProfile() {
  return {
    temperature: parseFloat(process.env.BONSAI_TEMPERATURE || '0.8'),
    top_p: parseFloat(process.env.BONSAI_TOP_P || '0.9'),
    top_k: Math.max(0, parseInt(process.env.BONSAI_TOP_K || '20', 10) || 20),
    repeat_penalty: parseFloat(process.env.BONSAI_REPEAT_PENALTY || '1.1'),
    /** Sermon parts: ~1800–2800 words — cap runaway completions */
    sermon_max_tokens: Math.min(
      8192,
      Math.max(1024, parseInt(process.env.BONSAI_SERMON_MAX_TOKENS || '4800', 10) || 4800)
    ),
    default_max_tokens: Math.min(
      8192,
      Math.max(1024, parseInt(process.env.BONSAI_DEFAULT_MAX_TOKENS || '8192', 10) || 8192)
    ),
  };
}

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
  'bonsai_sermon',
  'forge_stream_abort_key',
  'frequency_penalty',
  'presence_penalty',
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

  const profile = getBonsaiGenerationProfile();
  const params = sanitizeBonsaiParameters(parameters);
  const sermonMode = parameters?.bonsai_sermon === true;
  const messages = [];
  if (systemContent && String(systemContent).trim()) {
    messages.push({ role: 'system', content: String(systemContent).trim() });
  }
  messages.push({ role: 'user', content: user.content });

  const payload = {
    model: model || config.model,
    messages,
    stream: true,
    temperature: profile.temperature,
    top_p: profile.top_p,
    top_k: profile.top_k,
    repeat_penalty: profile.repeat_penalty,
    ...params,
  };

  if (payload.max_tokens === undefined) {
    payload.max_tokens = sermonMode
      ? Math.min(profile.sermon_max_tokens, config.maxContext || profile.sermon_max_tokens)
      : Math.min(profile.default_max_tokens, config.maxContext || profile.default_max_tokens);
  }

  const includeUsage = (process.env.AI_INCLUDE_STREAM_USAGE || 'true').toLowerCase() !== 'false';
  if (includeUsage && payload.stream_options === undefined) {
    payload.stream_options = { include_usage: true };
  }

  return { payload };
}
