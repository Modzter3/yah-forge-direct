import assert from 'node:assert/strict';
import handler from '../api/ai.js';

const previous = { ...process.env };
const originalFetch = globalThis.fetch;

try {
  delete process.env.AI_API_KEY;
  delete process.env.AI_BASE_URL;
  delete process.env.OPENROUTER_PROVIDER_SORT;
  delete process.env.OPENROUTER_ONLY_PROVIDERS;
  process.env.AI_PROVIDER = 'openrouter';
  process.env.OPENROUTER_API_KEY = 'or-test-key';

  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return Response.json({ choices: [{ message: { content: 'Done.' }, finish_reason: 'stop' }] });
  };

  const req = (parameters = {}, bot = 'openai/gpt-5') =>
    new Request('http://local/api/ai', {
      method: 'POST',
      body: JSON.stringify({ provider: 'openrouter', bot, query: 'test', parameters }),
    });
  const payloadOf = () => JSON.parse(calls.at(-1).init.body);

  // 1. Default routing: latency-sorted with fallbacks.
  assert.equal((await handler(req({ max_tokens: 4000 }))).status, 200);
  let payload = payloadOf();
  assert.equal(payload.provider.sort, 'latency');
  assert.equal(payload.provider.allow_fallbacks, true);
  assert.equal(payload.model, 'openai/gpt-5');

  // 2. No capability flag from the client -> no reasoning param at all, foreign names stripped.
  await handler(req({ max_tokens: 8000, thinking_budget: 0 }, 'anthropic/claude-sonnet-4.5'));
  payload = payloadOf();
  assert.equal(payload.reasoning, undefined, 'reasoning must not be sent without a capability flag');
  assert.equal(payload.thinking_budget, undefined);

  // 3. Reasoning-capable + thinking_budget:0 -> floor effort, and NEVER effort + max_tokens together.
  await handler(req({ max_tokens: 8000, thinking_budget: 0, forge_supports_reasoning: true }, 'anthropic/claude-sonnet-4.5'));
  payload = payloadOf();
  assert.deepEqual(payload.reasoning, { effort: 'minimal' });
  assert.equal(payload.reasoning.max_tokens, undefined, 'OpenRouter accepts effort OR max_tokens, not both');
  assert.equal(payload.forge_supports_reasoning, undefined, 'client hint must not reach the upstream body');

  // 4. Gemini thinking_level:high -> effort high, still only one key.
  await handler(req({ max_tokens: 20000, thinking_level: 'high', forge_supports_reasoning: true }, 'google/gemini-3.8-flash'));
  payload = payloadOf();
  assert.deepEqual(payload.reasoning, { effort: 'high' });
  assert.equal(payload.thinking_level, undefined);

  // 5. OpenAI reasoning_effort:'none' -> floor effort (never an invalid effort string).
  await handler(req({ max_tokens: 8000, reasoning_effort: 'none', forge_supports_reasoning: true }, 'openai/gpt-5.6-sol-pro'));
  payload = payloadOf();
  assert.deepEqual(payload.reasoning, { effort: 'minimal' });
  assert.equal(payload.reasoning_effort, undefined);

  // 6. Tiny closing-only requests must not carry a thinking budget (Anthropic needs max_tokens > budget).
  await handler(req({ max_tokens: 800, thinking_level: 'high', forge_supports_reasoning: true }, 'anthropic/claude-sonnet-4.5'));
  assert.equal(payloadOf().reasoning, undefined, 'no reasoning budget on a tiny request');

  // 7. A numeric thinking budget maps to reasoning.max_tokens only.
  await handler(req({ max_tokens: 16000, thinking_budget: 4096, forge_supports_reasoning: true }, 'google/gemini-3.8-flash'));
  payload = payloadOf();
  assert.deepEqual(payload.reasoning, { max_tokens: 4096 });

  // 8. Capability flag false -> no reasoning even when thinking params were sent.
  await handler(req({ max_tokens: 8000, thinking_level: 'high', forge_supports_reasoning: false }, 'openai/gpt-4.1'));
  assert.equal(payloadOf().reasoning, undefined, 'non-reasoning models must never receive reasoning params');

  // 9. Env override changes the sort.
  process.env.OPENROUTER_PROVIDER_SORT = 'throughput';
  await handler(req({ max_tokens: 1000 }));
  assert.equal(payloadOf().provider.sort, 'throughput');
  delete process.env.OPENROUTER_PROVIDER_SORT;

  // 10. Client hint wins, and the hint param never reaches the upstream body.
  await handler(req({ max_tokens: 1000, forge_provider_sort: 'price' }));
  payload = payloadOf();
  assert.equal(payload.provider.sort, 'price');
  assert.equal(payload.forge_provider_sort, undefined);

  // 11. An explicit reasoning object from the client is left alone.
  await handler(req({ reasoning: { effort: 'high' }, thinking_level: 'low' }, 'google/gemini-3.8-flash'));
  assert.deepEqual(payloadOf().reasoning, { effort: 'high' });

  // 12. Fast-start hint forces minimal thinking when nothing else is set.
  await handler(req({ max_tokens: 8000, forge_fast_start: true, forge_supports_reasoning: true }, 'openai/gpt-5.6-sol-pro'));
  payload = payloadOf();
  assert.equal(payload.reasoning.effort, 'minimal');
  assert.equal(payload.forge_fast_start, undefined);

  // 13. Non-OpenRouter providers keep their Poe-style params and get no provider object.
  process.env.NANOGPT_API_KEY = 'nano-test-key';
  await handler(new Request('http://local/api/ai', {
    method: 'POST',
    body: JSON.stringify({
      provider: 'nanogpt',
      bot: 'nano/model',
      query: 'test',
      parameters: { max_tokens: 100, thinking_budget: 0, forge_fast_start: true, forge_supports_reasoning: true },
    }),
  }));
  payload = payloadOf();
  assert.equal(payload.thinking_budget, 0);
  assert.equal(payload.forge_fast_start, undefined);
  assert.equal(payload.forge_supports_reasoning, undefined);
  assert.equal(payload.provider, undefined);

  console.log('openrouter-routing: capability-gated reasoning (effort XOR max_tokens) and latency-sorted routing passed; no live calls');
} finally {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) {
    if (!(key in previous)) delete process.env[key];
  }
  Object.assign(process.env, previous);
}