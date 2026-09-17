/** Kie.ai chat routing — some models use Codex Responses, others OpenAI-style chat completions. */

export const KIE_BASE_URL = 'https://api.kie.ai';

export const KIE_MODELS = {
  'gpt-6-astra': {
    id: 'gpt-6-astra', uiId: 'kie/gpt-6-astra', name: 'GPT-6 Astra',
    kind: 'responses', path: '/codex/v1/responses', contextLength: 1_050_000,
    promptPer1m: 2.8, completionPer1m: 14,
  },
  'gpt-5-6-sol': {
    id: 'gpt-5-6-sol', uiId: 'kie/gpt-5-6-sol', name: 'GPT-5.6 Sol',
    kind: 'responses', path: '/codex/v1/responses', contextLength: 1_050_000,
    promptPer1m: 1.12, completionPer1m: 5.6,
  },
  'gpt-5-6-terra': {
    id: 'gpt-5-6-terra', uiId: 'kie/gpt-5-6-terra', name: 'GPT-5.6 Terra',
    kind: 'responses', path: '/codex/v1/responses', contextLength: 1_050_000,
    promptPer1m: 0.56, completionPer1m: 3.36,
  },
  'gpt-5-6-luna': {
    id: 'gpt-5-6-luna', uiId: 'kie/gpt-5-6-luna', name: 'GPT-5.6 Luna',
    kind: 'responses', path: '/codex/v1/responses', contextLength: 1_050_000,
    promptPer1m: 0.056, completionPer1m: 0.336,
  },
  'gpt-5-5': {
    id: 'gpt-5-5', uiId: 'kie/gpt-5-5', name: 'GPT-5.5',
    kind: 'responses', path: '/codex/v1/responses', contextLength: 400_000,
    promptPer1m: 1.4, completionPer1m: 8.4,
  },
  'gpt-5-4': {
    id: 'gpt-5-4', uiId: 'kie/gpt-5-4', name: 'GPT-5.4',
    kind: 'responses', path: '/codex/v1/responses', contextLength: 400_000,
    promptPer1m: 1.4, completionPer1m: 8.4,
  },
  'gpt-5-2': {
    id: 'gpt-5-2', uiId: 'kie/gpt-5-2', name: 'GPT-5.2',
    kind: 'chat', path: '/gpt-5-2/v1/chat/completions', contextLength: 400_000,
    promptPer1m: 1.4, completionPer1m: 8.4,
  },
  'gemini-3.1-pro': {
    id: 'gemini-3.1-pro', uiId: 'kie/gemini-3.1-pro', name: 'Gemini 3.1 Pro',
    kind: 'chat', path: '/gemini-3.1-pro/v1/chat/completions', contextLength: 1_000_000,
    promptPer1m: 0.35, completionPer1m: 2.1,
  },
  'gemini-3-pro': {
    id: 'gemini-3-pro', uiId: 'kie/gemini-3-pro', name: 'Gemini 3 Pro',
    kind: 'chat', path: '/gemini-3-pro/v1/chat/completions', contextLength: 1_000_000,
    promptPer1m: 0.35, completionPer1m: 2.1,
  },
  'gemini-3-6-flash-openai': {
    id: 'gemini-3-6-flash-openai', uiId: 'kie/gemini-3-6-flash-openai', name: 'Gemini 3.6 Flash',
    kind: 'chat', path: '/gemini-3-6-flash-openai/v1/chat/completions', contextLength: 1_000_000,
    promptPer1m: 0.07, completionPer1m: 0.28,
  },
  'gemini-3-flash': {
    id: 'gemini-3-flash', uiId: 'kie/gemini-3-flash', name: 'Gemini 3 Flash',
    kind: 'chat', path: '/gemini-3-flash/v1/chat/completions', contextLength: 1_000_000,
    promptPer1m: 0.07, completionPer1m: 0.28,
  },
  'gemini-2.5-pro': {
    id: 'gemini-2.5-pro', uiId: 'kie/gemini-2.5-pro', name: 'Gemini 2.5 Pro',
    kind: 'chat', path: '/gemini-2.5-pro/v1/chat/completions', contextLength: 1_000_000,
    promptPer1m: 0.35, completionPer1m: 2.1,
  },
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash', uiId: 'kie/gemini-2.5-flash', name: 'Gemini 2.5 Flash',
    kind: 'chat', path: '/gemini-2.5-flash/v1/chat/completions', contextLength: 1_000_000,
    promptPer1m: 0.07, completionPer1m: 0.28,
  },
};

export function looksLikeKieModelId(requested) {
  const raw = String(requested || '').trim().toLowerCase();
  if (!raw) return false;
  if (raw.startsWith('kie/')) return true;
  return Object.prototype.hasOwnProperty.call(KIE_MODELS, raw);
}

export function resolveKieModel(requested) {
  const raw = String(requested || '').trim();
  if (!raw) return null;
  let id = raw;
  if (id.toLowerCase().startsWith('kie/')) id = id.slice(4);
  return KIE_MODELS[id.toLowerCase()] || null;
}

export function kieCatalogForUi() {
  return Object.values(KIE_MODELS).map((m) => ({
    id: m.uiId,
    name: m.name + ' via Kie',
    context_length: m.contextLength,
    pricing: {
      prompt: String(m.promptPer1m / 1e6),
      completion: String(m.completionPer1m / 1e6),
    },
    created: Date.now(),
  }));
}

function mapReasoningEffort(parameters) {
  const raw = String(
    parameters?.reasoning?.effort
    || parameters?.reasoning_effort
    || parameters?.thinking_level
    || ''
  ).toLowerCase();
  if (!raw || raw === 'none' || raw === 'minimal' || raw === 'low') return 'low';
  if (raw === 'medium') return 'medium';
  if (raw === 'xhigh' || raw === 'max' || raw === 'maximum') return 'xhigh';
  if (raw === 'high') return 'high';
  return 'low';
}

function toInputTextParts(query, images) {
  const parts = [{ type: 'input_text', text: String(query || '') }];
  const list = Array.isArray(images) ? images : [];
  for (const url of list) {
    if (typeof url === 'string' && url.trim()) {
      parts.push({ type: 'input_image', image_url: url.trim() });
    }
  }
  return parts;
}

export function buildKieResponsesPayload({ model, query, parameters, images, systemContent }) {
  const params = parameters && typeof parameters === 'object' ? { ...parameters } : {};
  const input = [];
  if (systemContent) {
    input.push({
      role: 'developer',
      content: [{ type: 'input_text', text: String(systemContent) }],
    });
  }
  input.push({
    role: 'user',
    content: toInputTextParts(query, images),
  });

  const payload = {
    model,
    stream: true,
    input,
    reasoning: { effort: mapReasoningEffort(params) },
  };

  if (params.web_search === true) {
    payload.tools = [{ type: 'web_search' }];
  }

  const maxOut = params.max_output_tokens || params.max_tokens;
  if (Number.isFinite(Number(maxOut)) && Number(maxOut) > 0) {
    payload.max_output_tokens = Math.floor(Number(maxOut));
  }

  return payload;
}

export function buildKieChatCompletionsPayload({ model, query, parameters, images, systemContent }) {
  const params = parameters && typeof parameters === 'object' ? { ...parameters } : {};
  const list = Array.isArray(images) ? images : [];
  let userContent = String(query || '');
  if (list.length) {
    const parts = [{ type: 'text', text: String(query || '') }];
    for (const url of list) {
      if (typeof url === 'string' && url.trim()) {
        parts.push({ type: 'image_url', image_url: { url: url.trim() } });
      }
    }
    userContent = parts;
  }
  const messages = [];
  if (systemContent) messages.push({ role: 'system', content: String(systemContent) });
  messages.push({ role: 'user', content: userContent });

  const payload = { messages, stream: true };
  if (model) payload.model = model;
  if (params.web_search === true) {
    payload.tools = [{ type: 'function', function: { name: 'web_search' } }];
  }
  const maxOut = params.max_tokens || params.max_output_tokens;
  if (Number.isFinite(Number(maxOut)) && Number(maxOut) > 0) {
    payload.max_tokens = Math.floor(Number(maxOut));
  }
  const effort = mapReasoningEffort(params);
  if (effort && effort !== 'low') payload.reasoning_effort = effort;
  return payload;
}

function usageFromKie(parsed) {
  const u = parsed?.response?.usage || parsed?.usage;
  if (!u || typeof u !== 'object') return null;
  return {
    prompt_tokens: u.input_tokens ?? u.prompt_tokens,
    completion_tokens: u.output_tokens ?? u.completion_tokens,
    total_tokens: u.total_tokens,
  };
}

function textDeltaFromKieEvent(eventName, parsed) {
  if (!parsed || typeof parsed !== 'object') return '';
  const type = String(parsed.type || eventName || '');
  if (type.includes('function_call')) return '';
  if (typeof parsed.delta === 'string' && type.includes('output_text')) return parsed.delta;
  if (typeof parsed.delta === 'string' && !type) return parsed.delta;
  if (typeof parsed.delta?.text === 'string') return parsed.delta.text;
  if (typeof parsed.text === 'string' && type.includes('output_text')) return parsed.text;
  try {
    return parsed.choices[0].delta.content || '';
  } catch {
    return '';
  }
}

export function extractKieResponseText(parsed) {
  if (!parsed || typeof parsed !== 'object') return '';
  if (typeof parsed.output_text === 'string' && parsed.output_text) return parsed.output_text;
  try {
    const c = parsed.choices[0].message.content;
    if (typeof c === 'string') return c;
  } catch { /* ignore */ }
  const buckets = parsed.output || parsed.response?.output;
  if (!Array.isArray(buckets)) return '';
  let out = '';
  for (const item of buckets) {
    const content = item?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if ((part?.type === 'output_text' || part?.type === 'text') && typeof part.text === 'string') {
        out += part.text;
      }
    }
  }
  return out;
}

function encodeChatDelta(text, finishReason, usage) {
  const chunk = {
    choices: [{ delta: text ? { content: text } : {}, finish_reason: finishReason || null }],
  };
  if (usage) chunk.usage = usage;
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

export function kieJsonToChatSse(parsed) {
  const text = extractKieResponseText(parsed);
  const usage = usageFromKie(parsed);
  const lines = [];
  if (text) lines.push(encodeChatDelta(text, null));
  if (usage) lines.push(encodeChatDelta('', 'stop', usage));
  lines.push('data: [DONE]\n\n');
  return lines.join('');
}

export function transformKieResponsesSse(upstreamBody) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  (async () => {
    try {
      const reader = upstreamBody.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let eventName = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split(/\r?\n/);
        buf = lines.pop();
        for (const line of lines) {
          if (!line) {
            eventName = '';
            continue;
          }
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
            continue;
          }
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data) continue;
          if (data === '[DONE]') {
            await writer.write(encoder.encode('data: [DONE]\n\n'));
            continue;
          }
          let parsed;
          try { parsed = JSON.parse(data); } catch { continue; }
          const delta = textDeltaFromKieEvent(eventName, parsed);
          if (delta) {
            await writer.write(encoder.encode(encodeChatDelta(delta, null)));
          }
          const type = String(parsed.type || eventName || '');
          if (type === 'response.completed' || parsed.status === 'completed') {
            const usage = usageFromKie(parsed);
            await writer.write(encoder.encode(encodeChatDelta('', 'stop', usage)));
          }
        }
      }
      if (buf.trim().startsWith('data:')) {
        const data = buf.trim().slice(5).trim();
        if (data === '[DONE]') await writer.write(encoder.encode('data: [DONE]\n\n'));
      }
      await writer.write(encoder.encode('data: [DONE]\n\n'));
    } catch (err) {
      const msg = String(err?.message || err || 'Kie stream failed').replace(/"/g, '\\"');
      await writer.write(encoder.encode(`data: {"error":"${msg}"}\n\n`));
    } finally {
      await writer.close();
    }
  })();

  return readable;
}
