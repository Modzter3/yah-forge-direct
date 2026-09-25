/**
 * Local RunPod / llama.cpp — OpenAI-compatible provider (env-driven, no client secrets).
 */

export const LOCAL_LLM_PROVIDER_ID = 'local';
export const LOCAL_LLM_OFFLINE_PREFIX = 'OrcaRouter Local offline';

function envFirst(localKey, legacyKey) {
  const v = process.env[localKey];
  if (v !== undefined && v !== '') return v;
  return process.env[legacyKey] || '';
}

function envTruthy(key, legacyKey, defaultWhenUnset) {
  const raw = envFirst(key, legacyKey);
  if (raw === '') return defaultWhenUnset;
  return !/^(0|false|no|off)$/i.test(String(raw).trim());
}

/** Default true — Qwen thinking burns tokens and slows sermons on RunPod. Set LOCAL_LLM_DISABLE_THINKING=false to allow it. */
export function isLocalLlmDisableThinking() {
  return envTruthy('LOCAL_LLM_DISABLE_THINKING', 'BONSAI_DISABLE_THINKING', true);
}

function isLikelyQwenModel(model) {
  return /qwen/i.test(String(model || ''));
}

/** Default llama-server sampling (override via LOCAL_LLM_* env). */
export function getLocalLlmGenerationProfile() {
  return {
    temperature: parseFloat(envFirst('LOCAL_LLM_TEMPERATURE', 'BONSAI_TEMPERATURE') || '0.7'),
    top_p: parseFloat(envFirst('LOCAL_LLM_TOP_P', 'BONSAI_TOP_P') || '0.8'),
    top_k: Math.max(0, parseInt(envFirst('LOCAL_LLM_TOP_K', 'BONSAI_TOP_K') || '20', 10) || 20),
    min_p: parseFloat(envFirst('LOCAL_LLM_MIN_P', 'BONSAI_MIN_P') || '0'),
    repeat_penalty: parseFloat(envFirst('LOCAL_LLM_REPEAT_PENALTY', 'BONSAI_REPEAT_PENALTY') || '1.08'),
    sermon_max_tokens: Math.min(
      8192,
      Math.max(
        1024,
        parseInt(envFirst('LOCAL_LLM_SERMON_MAX_TOKENS', 'BONSAI_SERMON_MAX_TOKENS') || '4800', 10) || 4800
      )
    ),
    default_max_tokens: Math.min(
      8192,
      Math.max(
        1024,
        parseInt(envFirst('LOCAL_LLM_DEFAULT_MAX_TOKENS', 'BONSAI_DEFAULT_MAX_TOKENS') || '8192', 10) || 8192
      )
    ),
  };
}

export function stripTrailingSlash(v) {
  return String(v || '').replace(/\/+$/, '');
}

export function getLocalLlmConfig() {
  const baseUrl = stripTrailingSlash(envFirst('LOCAL_LLM_BASE_URL', 'BONSAI_BASE_URL'));
  const apiKey = envFirst('LOCAL_LLM_API_KEY', 'BONSAI_API_KEY');
  const model = String(envFirst('LOCAL_LLM_MODEL', 'BONSAI_MODEL')).trim();
  const maxContext = Math.min(
    65536,
    Math.max(
      1024,
      parseInt(envFirst('LOCAL_LLM_MAX_CONTEXT', 'BONSAI_MAX_CONTEXT') || '65536', 10) || 65536
    )
  );
  return { baseUrl, apiKey, model, maxContext };
}

export function isLocalLlmProviderRequest(body) {
  const p = String(body?.provider || '').trim().toLowerCase();
  return (
    p === LOCAL_LLM_PROVIDER_ID ||
    p === 'bonsai' ||
    p === 'bonsai runpod' ||
    p === 'orcarouter local' ||
    p === 'local runpod'
  );
}

const LOCAL_LLM_STRIP_PARAMS = new Set([
  'web_search',
  'plugins',
  'thinking_budget',
  'thinking_level',
  'reasoning_effort',
  'reasoning_budget',
  'chat_template_kwargs',
  'yah_story_system',
  'local_llm_sermon',
  'bonsai_sermon',
  'forge_stream_abort_key',
  'frequency_penalty',
  'presence_penalty',
]);

export function sanitizeLocalLlmParameters(parameters) {
  const out = {};
  for (const [k, v] of Object.entries(parameters || {})) {
    if (LOCAL_LLM_STRIP_PARAMS.has(k)) continue;
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export function localLlmOfflineError(detail) {
  const msg = detail ? `${LOCAL_LLM_OFFLINE_PREFIX}: ${detail}` : LOCAL_LLM_OFFLINE_PREFIX;
  return { error: msg, provider: LOCAL_LLM_PROVIDER_ID, offline: true };
}

export async function checkLocalLlmHealth(config = getLocalLlmConfig()) {
  if (!config.baseUrl) {
    return { ok: false, offline: true, error: 'LOCAL_LLM_BASE_URL is not configured' };
  }
  if (!config.apiKey) {
    return { ok: false, offline: true, error: 'LOCAL_LLM_API_KEY is not configured' };
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

export function buildLocalLlmUserContent(query, images) {
  const list = Array.isArray(images) ? images : [];
  if (list.length) {
    return { error: 'OrcaRouter Local does not support image input in this forge build.' };
  }
  return { content: query };
}

export function buildLocalLlmChatPayload({ model, query, parameters, images, config, systemContent }) {
  const user = buildLocalLlmUserContent(query, images);
  if (user.error) return { error: user.error };

  const profile = getLocalLlmGenerationProfile();
  const params = sanitizeLocalLlmParameters(parameters);
  const sermonMode =
    parameters?.local_llm_sermon === true || parameters?.bonsai_sermon === true;
  const messages = [];
  if (systemContent && String(systemContent).trim()) {
    messages.push({ role: 'system', content: String(systemContent).trim() });
  }
  let userContent = user.content;
  const disableThinking = isLocalLlmDisableThinking();
  const effectiveModel = model || config.model;
  if (
    disableThinking &&
    isLikelyQwenModel(effectiveModel) &&
    !/\/no_think\b/i.test(String(userContent))
  ) {
    userContent = String(userContent).trimEnd() + ' /no_think';
  }
  messages.push({ role: 'user', content: userContent });

  const payload = {
    model: effectiveModel,
    messages,
    stream: true,
    temperature: profile.temperature,
    top_p: profile.top_p,
    top_k: profile.top_k,
    min_p: profile.min_p,
    repeat_penalty: profile.repeat_penalty,
    ...params,
  };

  if (disableThinking) {
    payload.chat_template_kwargs = {
      enable_thinking: false,
      preserve_thinking: false,
    };
  }

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

/** @deprecated use local-llm-provider exports */
export {
  LOCAL_LLM_PROVIDER_ID as BONSAI_PROVIDER_ID,
  LOCAL_LLM_OFFLINE_PREFIX as BONSAI_OFFLINE_PREFIX,
  isLocalLlmDisableThinking as isBonsaiDisableThinking,
  getLocalLlmGenerationProfile as getBonsaiGenerationProfile,
  getLocalLlmConfig as getBonsaiConfig,
  isLocalLlmProviderRequest as isBonsaiProviderRequest,
  sanitizeLocalLlmParameters as sanitizeBonsaiParameters,
  localLlmOfflineError as bonsaiOfflineError,
  checkLocalLlmHealth as checkBonsaiHealth,
  buildLocalLlmChatPayload as buildBonsaiChatPayload,
};
