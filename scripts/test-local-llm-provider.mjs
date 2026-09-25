#!/usr/bin/env node
import { buildLocalLlmChatPayload, isLocalLlmDisableThinking } from '../api/local-llm-provider.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const config = { model: 'orcarouter_Qwen3.8-27B-Uncensored-Q6_K_L.gguf', maxContext: 65536 };

delete process.env.LOCAL_LLM_TOP_P;
delete process.env.LOCAL_LLM_MIN_P;
process.env.LOCAL_LLM_DISABLE_THINKING = 'true';
assert(isLocalLlmDisableThinking(), 'disable thinking default true when env true');

const built = buildLocalLlmChatPayload({
  model: config.model,
  query: 'Write a short test sermon.',
  parameters: {
    reasoning_effort: 'high',
    chat_template_kwargs: { enable_thinking: true, preserve_thinking: true },
    reasoning_budget: 8192,
  },
  images: [],
  config,
  systemContent: 'You are a preacher.',
});

assert(!built.error, built.error || 'payload build failed');
const { payload } = built;
assert(payload.temperature === 0.7, 'temperature 0.7');
assert(payload.top_p === 0.8, 'top_p 0.8');
assert(payload.top_k === 20, 'top_k 20');
assert(payload.min_p === 0, 'min_p 0');
assert(payload.reasoning_effort === undefined, 'must not forward reasoning_effort');
assert(payload.reasoning_budget === undefined, 'must not forward reasoning_budget');
assert(payload.chat_template_kwargs?.enable_thinking === false, 'enable_thinking false');
assert(payload.chat_template_kwargs?.preserve_thinking === false, 'preserve_thinking false');
const userMsg = payload.messages.find((m) => m.role === 'user');
assert(/\/no_think\s*$/i.test(userMsg.content), 'Qwen user message should end with /no_think');

process.env.LOCAL_LLM_DISABLE_THINKING = 'false';
assert(!isLocalLlmDisableThinking(), 'false env should allow thinking');
const builtOff = buildLocalLlmChatPayload({
  model: config.model,
  query: 'Hello',
  parameters: {},
  images: [],
  config,
  systemContent: '',
});
assert(builtOff.payload.chat_template_kwargs === undefined, 'no template kwargs when thinking allowed');
assert(!/\/no_think/i.test(builtOff.payload.messages[0].content), 'no /no_think when disabled flag off');

console.log('test-local-llm-provider: all checks passed');
