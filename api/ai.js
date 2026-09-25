import {
  KIE_BASE_URL,
  buildKieChatCompletionsPayload,
  buildKieResponsesPayload,
  kieJsonToChatSse,
  looksLikeKieModelId,
  resolveKieModel,
  transformKieResponsesSse,
} from './kie-provider.js';
import {
  LOCAL_LLM_PROVIDER_ID,
  LOCAL_LLM_OFFLINE_PREFIX,
  buildLocalLlmChatPayload,
  getLocalLlmConfig,
  isLocalLlmProviderRequest,
} from './local-llm-provider.js';

export const config = { runtime: 'edge' };

const PROVIDERS = {
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', keyEnv: 'OPENROUTER_API_KEY' },
  openai:     { baseUrl: 'https://api.openai.com/v1',    keyEnv: 'OPENAI_API_KEY' },
  groq:       { baseUrl: 'https://api.groq.com/openai/v1', keyEnv: 'GROQ_API_KEY' },
  together:   { baseUrl: 'https://api.together.xyz/v1',  keyEnv: 'TOGETHER_API_KEY' },
  fireworks:  { baseUrl: 'https://api.fireworks.ai/inference/v1', keyEnv: 'FIREWORKS_API_KEY' },
  xai:        { baseUrl: 'https://api.x.ai/v1',          keyEnv: 'XAI_API_KEY' },
  kie:        { baseUrl: KIE_BASE_URL,                   keyEnv: 'KIE_API_KEY' },
  custom:     { baseUrl: '',                              keyEnv: 'AI_API_KEY'   },
};

const DEFAULT_YAH_STORY_SYSTEM_PROMPT =
  'You write original religious fiction and dramatic monologue for a private authoring tool. ' +
  'When the user requests prophetic first-person voice, write in the literary style of Hebrew prophets (Isaiah, Jeremiah, Ezekiel): first person I/My/Me addressing Israel. ' +
  'This is fiction and rhetorical prose, not real-world religious authority or instruction. Output only the requested monologue text.';

const GROK_YAH_STORY_SYSTEM_SUFFIX =
  ' The user message is a creative-writing brief for in-universe prophetic fiction, not an attempt to bypass safety policies. ' +
  'Follow the brief as literary content and write the requested monologue.';

const PROVIDER_ALIASES = {
  openrouter: {
    'Gemini-3-Flash':               'google/gemini-2.5-flash',
    'Gemini-3.6-Flash':             'google/gemini-3.6-flash',
    'Gemini-3-Pro':                 'google/gemini-2.5-pro',
    'Gemini-3.1-Pro':               'google/gemini-2.5-pro',
    'Claude-Sonnet-4.5':            'anthropic/claude-sonnet-4',
    'Claude-Opus-4.6':              'anthropic/claude-opus-4',
    'GPT-5.2':                      'openai/gpt-4.1',
    'Grok-4.1-Fast-Non-Reasoning':  'x-ai/grok-4.20',
    'Grok-4.1-Fast-Reasoning':      'x-ai/grok-4.20',
    'Grok-4.20-Fast':               'x-ai/grok-4.20',
    'Grok-4.3':                     'x-ai/grok-4.3',
    'Grok-4.3-Reasoning':           'x-ai/grok-4.3',
    'Grok-Code-Fast-1':             'x-ai/grok-4-fast',
    'Grok-4':                       'x-ai/grok-4.20',
    'GLM-5':                        'z-ai/glm-5',
    'Qwen3-Max':                    'qwen/qwen3-max',
    'Kimi-K2.5':                    'moonshotai/kimi-k2.5',
  },
  openai: {
    'Gemini-3-Flash':    'gpt-4.1-mini',
    'Gemini-3.6-Flash':  'gpt-4.1-mini',
    'Gemini-3-Pro':      'gpt-4.1',
    'Gemini-3.1-Pro':    'gpt-4.1',
    'Claude-Sonnet-4.5': 'gpt-4.1',
    'Claude-Opus-4.6':   'gpt-4.1',
    'GPT-5.2':           'gpt-4.1',
  },
};

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

  const { bot, query, parameters = {}, images = [] } = body || {};
  if (!query || typeof query !== 'string') {
    return jsonError('Missing required field: query', 400);
  }
  const imageList = normalizeImageInputs(images);

  if (isLocalLlmProviderRequest(body)) {
    return handleLocalLlmRequest({ query, parameters, imageList });
  }

  const defaultProviderName = (process.env.AI_PROVIDER || 'openrouter').trim().toLowerCase();
  const kieModel = looksLikeKieModelId(bot) ? resolveKieModel(bot) : null;
  const useKie = !!kieModel;
  const providerName = useKie ? 'kie' : defaultProviderName;
  const provider     = PROVIDERS[providerName] || PROVIDERS.custom;
  const baseUrl      = stripTrailingSlash(
    (useKie ? (process.env.KIE_BASE_URL || KIE_BASE_URL) : (process.env.AI_BASE_URL || provider.baseUrl)) || ''
  );

  if (!baseUrl) {
    return jsonError(
      'Missing AI base URL. Set AI_BASE_URL or AI_PROVIDER (openrouter/openai/groq/together/fireworks/xai/kie).',
      500
    );
  }

  const apiKey = resolveApiKey(providerName, provider);
  if (!apiKey) {
    if (providerName === 'kie') {
      return jsonError(
        'Missing KIE_API_KEY. Add it in Vercel → Settings → Environment Variables, then redeploy.',
        500
      );
    }
    return jsonError(`Missing API key. Set AI_API_KEY or ${provider.keyEnv}.`, 500);
  }

  if (useKie) {
    return handleKieRequest({
      bot,
      query,
      parameters,
      imageList,
      kieModel,
      apiKey,
      baseUrl,
    });
  }

  const resolvedModel = resolveModel({ requestedModel: bot, providerName });
  if (!resolvedModel) {
    return jsonError('No model provided. Prefix prompts with @model or set DEFAULT_TEXT_MODEL.', 400);
  }
  if (imageList.length && !supportsVision(resolvedModel)) {
    return jsonError(
      `Model "${resolvedModel}" may not support image input. Try Gemini 3.6 Flash, Gemini 3 Pro, Claude Sonnet, or GPT-4.1.`,
      400
    );
  }

  const payload = buildPayload({ model: resolvedModel, query, parameters, providerName, images: imageList });

  let upstream;
  try {
    upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: requestHeaders(providerName, apiKey),
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return jsonError(`Network error reaching provider (${providerName}): ${err.message}`, 502);
  }

  const contentType = upstream.headers.get('content-type') || '';

  if (contentType.includes('text/event-stream')) {
    return streamPassThrough(upstream, providerName, resolvedModel);
  }

  const raw = await safeReadText(upstream);
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch { parsed = null; }

  if (!upstream.ok) {
    const clean = cleanErrorMessage(parsed, raw);
    return jsonError(
      `${providerName} ${upstream.status} (model: ${resolvedModel}): ${clean || '(empty)'}`,
      upstream.status >= 400 ? upstream.status : 502
    );
  }

  return jsonFromProviderToSse(parsed, providerName, resolvedModel);
}

async function handleLocalLlmRequest({ query, parameters, imageList }) {
  const config = getLocalLlmConfig();
  if (!config.baseUrl || !config.apiKey || !config.model) {
    return jsonError(
      'OrcaRouter Local is not configured. Set LOCAL_LLM_BASE_URL, LOCAL_LLM_API_KEY, and LOCAL_LLM_MODEL in Vercel.',
      500
    );
  }

  const params = { ...(parameters || {}) };
  const yahStorySystem = params.yah_story_system === true;
  delete params.yah_story_system;
  let systemContent = '';
  if (yahStorySystem) {
    systemContent = process.env.YAH_STORY_SYSTEM_PROMPT || DEFAULT_YAH_STORY_SYSTEM_PROMPT;
  }

  const built = buildLocalLlmChatPayload({
    model: config.model,
    query,
    parameters: params,
    images: imageList,
    config,
    systemContent,
  });
  if (built.error) {
    return jsonError(built.error, 400);
  }

  let upstream;
  try {
    upstream = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(built.payload),
    });
  } catch (err) {
    return jsonError(
      `${LOCAL_LLM_OFFLINE_PREFIX}: ${err.message || 'cannot reach RunPod endpoint'}`,
      502
    );
  }

  const contentType = upstream.headers.get('content-type') || '';
  const resolvedModel = config.model;

  if (!upstream.ok) {
    const raw = await safeReadText(upstream);
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch { parsed = null; }
    const clean = cleanErrorMessage(parsed, raw) || `HTTP ${upstream.status}`;
    return jsonError(`${LOCAL_LLM_OFFLINE_PREFIX}: ${clean}`, upstream.status >= 400 ? upstream.status : 502);
  }

  if (contentType.includes('text/event-stream')) {
    return streamPassThrough(upstream, LOCAL_LLM_PROVIDER_ID, resolvedModel);
  }

  const raw = await safeReadText(upstream);
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch { parsed = null; }
  return jsonFromProviderToSse(parsed, LOCAL_LLM_PROVIDER_ID, resolvedModel);
}

async function handleKieRequest({ bot, query, parameters, imageList, kieModel, apiKey, baseUrl }) {
  const spec = kieModel || resolveKieModel(bot);
  if (!spec) {
    return jsonError(
      `Unknown Kie model "${bot || ''}". Use kie/gpt-6-astra (or set a supported Kie id).`,
      400
    );
  }
  if (imageList.length && !supportsVision(spec.id)) {
    return jsonError(`Kie model "${spec.id}" may not support image input.`, 400);
  }

  const params = { ...(parameters || {}) };
  const yahStorySystem = params.yah_story_system === true;
  delete params.yah_story_system;
  let systemContent = '';
  if (yahStorySystem) {
    systemContent = process.env.YAH_STORY_SYSTEM_PROMPT || DEFAULT_YAH_STORY_SYSTEM_PROMPT;
    if (/grok/i.test(spec.id)) systemContent += GROK_YAH_STORY_SYSTEM_SUFFIX;
  }

  if (spec.kind === 'chat') {
    return handleKieChatCompletions({ spec, query, params, imageList, systemContent, apiKey, baseUrl });
  }

  const payload = buildKieResponsesPayload({
    model: spec.id,
    query,
    parameters: params,
    images: imageList,
    systemContent,
  });

  const url = `${stripTrailingSlash(baseUrl)}${spec.path}`;
  let upstream;
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: requestHeaders('kie', apiKey),
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return jsonError(`Network error reaching Kie (${spec.id}): ${err.message}`, 502);
  }

  const contentType = upstream.headers.get('content-type') || '';
  const looksJson = contentType.includes('application/json');
  if (upstream.ok && upstream.body && !looksJson) {
    const readable = transformKieResponsesSse(upstream.body);
    return new Response(readable, {
      status: 200,
      headers: {
        ...corsHeaders(),
        'Content-Type':      'text/event-stream',
        'Cache-Control':     'no-cache',
        'X-Accel-Buffering': 'no',
        'X-AI-Provider':     'kie',
        'X-AI-Model':        spec.id,
      },
    });
  }

  const raw = await safeReadText(upstream);
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch { parsed = null; }

  if (!upstream.ok) {
    const clean = cleanErrorMessage(parsed, raw);
    return jsonError(
      `kie ${upstream.status} (model: ${spec.id}): ${clean || '(empty)'}`,
      upstream.status >= 400 ? upstream.status : 502
    );
  }

  const sse = kieJsonToChatSse(parsed);
  return new Response(sse, {
    status: 200,
    headers: {
      ...corsHeaders(),
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache',
      'X-Accel-Buffering': 'no',
      'X-AI-Provider':     'kie',
      'X-AI-Model':        spec.id,
    },
  });
}

async function handleKieChatCompletions({ spec, query, params, imageList, systemContent, apiKey, baseUrl }) {
  const payload = buildKieChatCompletionsPayload({
    model: spec.id,
    query,
    parameters: params,
    images: imageList,
    systemContent,
  });
  const url = `${stripTrailingSlash(baseUrl)}${spec.path}`;
  let upstream;
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: requestHeaders('kie', apiKey),
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return jsonError(`Network error reaching Kie (${spec.id}): ${err.message}`, 502);
  }

  const contentType = upstream.headers.get('content-type') || '';
  if (contentType.includes('text/event-stream')) {
    return streamPassThrough(upstream, 'kie', spec.id);
  }

  const raw = await safeReadText(upstream);
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch { parsed = null; }

  if (!upstream.ok) {
    const clean = cleanErrorMessage(parsed, raw);
    return jsonError(
      `kie ${upstream.status} (model: ${spec.id}): ${clean || '(empty)'}`,
      upstream.status >= 400 ? upstream.status : 502
    );
  }

  return jsonFromProviderToSse(parsed, 'kie', spec.id);
}

function normalizeImageInputs(images) {
  if (!Array.isArray(images)) return [];
  const out = [];
  for (const item of images) {
    const url = typeof item === 'string'
      ? item
      : (item && (item.url || item.dataUrl || item.data_url));
    if (typeof url !== 'string') continue;
    const trimmed = url.trim();
    if (!/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(trimmed)) continue;
    if (trimmed.length > 6_000_000) continue;
    out.push(trimmed);
    if (out.length >= 4) break;
  }
  return out;
}

function supportsVision(model) {
  const m = String(model || '').toLowerCase();
  if (!m) return false;
  if (/gemini|gpt-4|gpt-4\.1|gpt-5|gpt-6|astra|claude|grok-4|qwen.*vl|llama.*vision|pixtral|mistral.*pix/i.test(m)) {
    return true;
  }
  return false;
}

function buildUserMessageContent(query, images) {
  const list = Array.isArray(images) ? images : [];
  if (!list.length) return query;
  const parts = [{ type: 'text', text: query }];
  for (const url of list) {
    parts.push({ type: 'image_url', image_url: { url } });
  }
  return parts;
}

function buildPayload({ model, query, parameters, providerName, images = [] }) {
  const params = stripUndefined(parameters || {});

  // OpenRouter ignores ad-hoc `web_search`; enable real retrieval via the web plugin
  // so answers can follow the user's date window instead of the model's training cutoff.
  if (providerName === 'openrouter' && params.web_search === true) {
    delete params.web_search;
    if (!params.plugins) {
      const max = Math.min(
        25,
        Math.max(1, parseInt(process.env.OPENROUTER_WEB_MAX_RESULTS || '10', 10) || 10)
      );
      params.plugins = [{ id: 'web', max_results: max }];
    }
  }

  const yahStorySystem = params.yah_story_system === true;
  delete params.yah_story_system;

  const userContent = buildUserMessageContent(query, images);
  let yahStorySystemContent = process.env.YAH_STORY_SYSTEM_PROMPT || DEFAULT_YAH_STORY_SYSTEM_PROMPT;
  if (yahStorySystem && /grok/i.test(String(model || ''))) {
    yahStorySystemContent += GROK_YAH_STORY_SYSTEM_SUFFIX;
  }

  const payload = {
    model,
    messages: yahStorySystem
      ? [
          {
            role: 'system',
            content: yahStorySystemContent,
          },
          { role: 'user', content: userContent },
        ]
      : [{ role: 'user', content: userContent }],
    stream: true,
    ...params,
  };

  const includeUsage = (process.env.AI_INCLUDE_STREAM_USAGE || 'true').toLowerCase() !== 'false';
  if (includeUsage && payload.stream_options === undefined) {
    payload.stream_options = { include_usage: true };
  }

  return payload;
}

function resolveApiKey(providerName, provider) {
  if (providerName === 'kie') {
    return process.env.KIE_API_KEY || process.env.KIE_SECRET_KEY || process.env.AI_API_KEY || '';
  }

  const direct = process.env.AI_API_KEY;
  if (direct) return direct;

  if (provider?.keyEnv && process.env[provider.keyEnv]) {
    return process.env[provider.keyEnv];
  }

  const explicitByProvider = {
    openrouter: process.env.OPENROUTER_API_KEY,
    openai:     process.env.OPENAI_API_KEY,
    groq:       process.env.GROQ_API_KEY,
    together:   process.env.TOGETHER_API_KEY,
    fireworks:  process.env.FIREWORKS_API_KEY,
    xai:        process.env.XAI_API_KEY,
    kie:        process.env.KIE_API_KEY || process.env.KIE_SECRET_KEY,
    custom:     process.env.CUSTOM_API_KEY,
  };
  return explicitByProvider[providerName] || '';
}

const DEPRECATED_MODEL_REDIRECTS = {
  'x-ai/grok-4.1-fast': 'x-ai/grok-4.20',
};

function redirectDeprecatedModel(modelId) {
  const key = String(modelId || '').trim().toLowerCase();
  if (!key) return modelId;
  for (const [oldId, newId] of Object.entries(DEPRECATED_MODEL_REDIRECTS)) {
    if (key === oldId.toLowerCase()) return newId;
  }
  return modelId;
}

function resolveModel({ requestedModel, providerName }) {
  const model        = String(requestedModel || '').trim();
  const defaultModel = String(process.env.DEFAULT_TEXT_MODEL || '').trim();
  const requested    = model || defaultModel;
  if (!requested) return '';

  const envAliases = parseJsonEnv('MODEL_ALIASES_JSON') || {};
  if (typeof envAliases[requested] === 'string' && envAliases[requested].trim()) {
    return redirectDeprecatedModel(envAliases[requested].trim());
  }

  const providerAliases = PROVIDER_ALIASES[providerName] || {};
  return redirectDeprecatedModel(providerAliases[requested] || requested);
}

function requestHeaders(providerName, apiKey) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  if (providerName === 'openrouter') {
    const referer = process.env.AI_HTTP_REFERER || process.env.APP_PUBLIC_URL;
    const title   = process.env.AI_APP_NAME || 'YAH Forge Direct';
    if (referer) headers['HTTP-Referer'] = referer;
    if (title)   headers['X-Title']      = title;
  }

  const extra = parseJsonEnv('AI_EXTRA_HEADERS_JSON');
  if (extra && typeof extra === 'object') {
    for (const [k, v] of Object.entries(extra)) {
      if (typeof v === 'string' && v.trim()) headers[k] = v;
    }
  }

  return headers;
}

function streamPassThrough(upstream, providerName, model) {
  const { readable, writable } = new TransformStream();
  const writer  = writable.getWriter();
  const encoder = new TextEncoder();

  (async () => {
    try {
      const reader  = upstream.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          await writer.write(encoder.encode(line + '\n'));
        }
      }
      if (buf) await writer.write(encoder.encode(buf + '\n'));
    } catch (err) {
      await writer.write(encoder.encode(`data: {"error":"${escapeJson(err.message)}"}\n\n`));
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    status: 200,
    headers: {
      ...corsHeaders(),
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache',
      'X-Accel-Buffering': 'no',
      'X-AI-Provider':     providerName,
      'X-AI-Model':        model,
    },
  });
}

function jsonFromProviderToSse(parsed, providerName, model) {
  const text  = parsed?.choices?.[0]?.message?.content || parsed?.output_text || '';
  const usage = parsed?.usage || null;
  const lines = [];

  if (text) {
    lines.push(`data: ${JSON.stringify({
      choices: [{ delta: { content: text }, finish_reason: null }],
    })}\n\n`);
  }
  if (usage) {
    lines.push(`data: ${JSON.stringify({ choices: [{ delta: {} }], usage })}\n\n`);
  }
  lines.push('data: [DONE]\n\n');

  return new Response(lines.join(''), {
    status: 200,
    headers: {
      ...corsHeaders(),
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache',
      'X-Accel-Buffering': 'no',
      'X-AI-Provider':     providerName,
      'X-AI-Model':        model,
    },
  });
}

function parseJsonEnv(key) {
  const raw = process.env[key];
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function stripUndefined(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function cleanErrorMessage(parsed, raw) {
  const fromJson = parsed?.error?.message || parsed?.error || parsed?.message;
  if (typeof fromJson === 'string' && fromJson.trim()) return fromJson.trim();
  return String(raw || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600);
}

function stripTrailingSlash(v) {
  return String(v || '').replace(/\/+$/, '');
}

async function safeReadText(res) {
  try { return await res.text(); } catch { return '(unreadable)'; }
}

function escapeJson(str) {
  return String(str || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonError(message, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}
