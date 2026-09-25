#!/usr/bin/env node
import { buildLocalLlmChatPayload, isLocalLlmDisableThinking } from '../api/local-llm-provider.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const config = { model: 'orcarouter_Qwen3.8-27B-Uncensored-Q6_K_L.gguf', maxContext: 65536 };

process.env.LOCAL_LLM_DISABLE_THINKING = 'true';
assert(isLocalLlmDisableThinking(), 'disable thinking default true when env true');

const built = buildLocalLlmChatPayload({
  model: config.model,
  query: 'Write a short test sermon.',
  parameters: {},
  images: [],
  config,
  systemContent: 'You are a preacher.',
});

assert(!built.error, built.error || 'payload build failed');
const { payload } = built;
assert(payload.reasoning_budget === 0, 'reasoning_budget should be 0');
assert(payload.chat_template_kwargs?.enable_thinking === false, 'enable_thinking false');
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
assert(builtOff.payload.reasoning_budget === undefined, 'no reasoning_budget when thinking allowed');
assert(!/\/no_think/i.test(builtOff.payload.messages[0].content), 'no /no_think when disabled flag off');

console.log('test-local-llm-provider: all checks passed');
