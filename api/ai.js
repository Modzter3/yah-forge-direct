export const config = { runtime: 'edge' };

const PROVIDERS = {
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', keyEnv: 'OPENROUTER_API_KEY' },
  openai:     { baseUrl: 'https://api.openai.com/v1',    keyEnv: 'OPENAI_API_KEY' },
  groq:       { baseUrl: 'https://api.groq.com/openai/v1', keyEnv: 'GROQ_API_KEY' },
  together:   { baseUrl: 'https://api.together.xyz/v1',  keyEnv: 'TOGETHER_API_KEY' },
  fireworks:  { baseUrl: 'https://api.fireworks.ai/inference/v1', keyEnv: 'FIREWORKS_API_KEY' },
  xai:        { baseUrl: 'https://api.x.ai/v1',          keyEnv: 'XAI_API_KEY' },
  custom:     { baseUrl: '',                              keyEnv: 'AI_API_KEY' },
};

const PROVIDER_ALIASES = {
  openrouter: {
    'Gemini-3-Flash':               'google/gemini-2.5-flash',
    'Gemini-3-Pro':                 'google/gemini-2.5-pro',
    'Gemini-3.1-Pro':               'google/gemini-2.5-pro',
    'Claude-Sonnet-4.5':            'anthropic/claude-sonnet-4',
    'Claude-Opus-4.6':              'anthropic/claude-opus-4',
    'GPT-5.2':                      'openai/gpt-4.1',
    'Grok-4.1-Fast-Non-Reasoning':  'x-ai/grok-4.1-fast',
    'Grok-4.1-Fast-Reasoning':      'x-ai/grok-4.1-fast',
    'Grok-Code-Fast-1':             'x-ai/grok-4-fast',
    'Grok-4':                       'x-ai/grok-4.20',
    'GLM-5':                        'z-ai/glm-5',
    'Qwen3-Max':                    'qwen/qwen3-max',
    'Kimi-K2.5':                    'moonshotai/kimi-k2.5',
  },
  openai: {
    'Gemini-3-Flash':    'gpt-4.1-mini',
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

  const { bot, query, parameters = {} } = body || {};
  if (!query || typeof query !== 'string') {
    return jsonError('Missing required field: query', 400);
  }

  const providerName = (process.env.AI_PROVIDER || 'openrouter').trim().toLowerCase();
  const provider     = PROVIDERS[providerName] || PROVIDERS.custom;
  const baseUrl      = stripTrailingSlash(process.env.AI_BASE_URL || provider.baseUrl || '');

  if (!baseUrl) {
    return jsonError(
      'Missing AI base URL. Set AI_BASE_URL or AI_PROVIDER (openrouter/openai/groq/together/fireworks/xai).',
      500
    );
  }

  const apiKey = resolveApiKey(providerName, provider);
  if (!apiKey) {
    return jsonError(`Missing API key. Set AI_API_KEY or ${provider.keyEnv}.`, 500);
  }

  const resolvedModel = resolveModel({ requestedModel: bot, providerName });
  if (!resolvedModel) {
    return jsonError('No model provided. Prefix prompts with @model or set DEFAULT_TEXT_MODEL.', 400);
  }

  const payload = buildPayload({ model: resolvedModel, query, parameters });

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

function buildPayload({ model, query, parameters }) {
  const payload = {
    model,
    messages: [{ role: 'user', content: query }],
    stream: true,
    ...stripUndefined(parameters || {}),
  };

  const includeUsage = (process.env.AI_INCLUDE_STREAM_USAGE || 'true').toLowerCase() !== 'false';
  if (includeUsage && payload.stream_options === undefined) {
    payload.stream_options = { include_usage: true };
  }

  return payload;
}

function resolveApiKey(providerName, provider) {
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
    custom:     process.env.CUSTOM_API_KEY,
  };
  return explicitByProvider[providerName] || '';
}

function resolveModel({ requestedModel, providerName }) {
  const model        = String(requestedModel || '').trim();
  const defaultModel = String(process.env.DEFAULT_TEXT_MODEL || '').trim();
  const requested    = model || defaultModel;
  if (!requested) return '';

  const envAliases = parseJsonEnv('MODEL_ALIASES_JSON') || {};
  if (typeof envAliases[requested] === 'string' && envAliases[requested].trim()) {
    return envAliases[requested].trim();
  }

  const providerAliases = PROVIDER_ALIASES[providerName] || {};
  return providerAliases[requested] || requested;
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
