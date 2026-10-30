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

  // 1. Default routing: latency-sorted with fallbacks, and never the app's provider name.
  assert.equal((await handler(req({ max_tokens: 4000 }))).status, 200);
  let payload = payloadOf();
  assert.equal(payload.provider.sort, 'latency');
  assert.equal(payload.provider.allow_fallbacks, true);
  assert.equal(payload.model, 'openai/gpt-5');

  // 2. Claude thinking_budget:0 -> real OpenRouter reasoning object, foreign param removed.
  await handler(req({ max_tokens: 8000, thinking_budget: 0 }, 'anthropic/claude-opus-5'));
  payload = payloadOf();
  assert.deepEqual(payload.reasoning, { enabled: false });
  assert.equal(payload.thinking_budget, undefined);

  // 3. Gemini thinking_level:high -> effort high, thinking capped below max_tokens.
  await handler(req({ max_tokens: 20000, thinking_level: 'high' }, 'google/gemini-3.8-flash'));
  payload = payloadOf();
  assert.equal(payload.reasoning.effort, 'high');
  assert.equal(payload.reasoning.max_tokens, 7000);
  assert.ok(payload.reasoning.max_tokens < payload.max_tokens, 'thinking budget must leave room for output');
  assert.equal(payload.thinking_level, undefined);

  // 4. OpenAI reasoning_effort -> effort only (OpenAI does not take reasoning.max_tokens).
  await handler(req({ max_tokens: 8000, reasoning_effort: 'low' }, 'openai/gpt-5.6-sol-pro'));
  payload = payloadOf();
  assert.deepEqual(payload.reasoning, { effort: 'low' });
  assert.equal(payload.reasoning_effort, undefined);

  // 5. reasoning_effort:'none' on OpenAI maps to the floor effort, never an invalid value.
  await handler(req({ max_tokens: 8000, reasoning_effort: 'none' }, 'openai/gpt-5.6-sol-pro'));
  payload = payloadOf();
  assert.deepEqual(payload.reasoning, { effort: 'minimal' });

  // 6. Env override changes the sort.
  process.env.OPENROUTER_PROVIDER_SORT = 'throughput';
  await handler(req({ max_tokens: 1000 }));
  assert.equal(payloadOf().provider.sort, 'throughput');
  delete process.env.OPENROUTER_PROVIDER_SORT;

  // 7. Client hint wins, and the hint param never reaches the upstream body.
  await handler(req({ max_tokens: 1000, forge_provider_sort: 'price' }));
  payload = payloadOf();
  assert.equal(payload.provider.sort, 'price');
  assert.equal(payload.forge_provider_sort, undefined);

  // 8. An explicit reasoning object from the client is left alone.
  await handler(req({ reasoning: { effort: 'high' }, thinking_level: 'low' }, 'google/gemini-3.8-flash'));
  assert.deepEqual(payloadOf().reasoning, { effort: 'high' });

  // 9. Fast-start hint forces minimal thinking when nothing else is set.
  await handler(req({ max_tokens: 8000, forge_fast_start: true }, 'openai/gpt-5.6-sol-pro'));
  payload = payloadOf();
  assert.equal(payload.reasoning.effort, 'minimal');
  assert.equal(payload.forge_fast_start, undefined);

  // 10. Non-OpenRouter providers keep their Poe-style params and get no provider object.
  process.env.NANOGPT_API_KEY = 'nano-test-key';
  await handler(new Request('http://local/api/ai', {
    method: 'POST',
    body: JSON.stringify({
      provider: 'nanogpt',
      bot: 'nano/model',
      query: 'test',
      parameters: { max_tokens: 100, thinking_budget: 0, forge_fast_start: true },
    }),
  }));
  payload = payloadOf();
  assert.equal(payload.thinking_budget, 0);
  assert.equal(payload.forge_fast_start, undefined);
  assert.equal(payload.provider, undefined);

  console.log('openrouter-routing: reasoning normalization and latency-sorted routing passed; no live calls');
} finally {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) {
    if (!(key in previous)) delete process.env[key];
  }
  Object.assign(process.env, previous);
}