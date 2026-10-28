import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import handler from '../api/ai.js';
import opencodeModels from '../api/opencode-go-models.js';
import clinepassModels from '../api/clinepass-models.js';
import refuselessModels from '../api/refuseless-models.js';

const previous = { ...process.env };
const originalFetch = globalThis.fetch;

const cases = [
  {
    provider: 'opencode_go',
    key: 'OPENCODE_GO_API_KEY',
    keyValue: 'go-test-key',
    base: 'https://opencode.ai/zen/go/v1',
    modelsHandler: opencodeModels,
    modelId: 'kimi-k3',
  },
  {
    provider: 'clinepass',
    key: 'CLINEPASS_API_KEY',
    keyValue: 'cline-test-key',
    base: 'https://api.cline.bot/api/v1',
    modelsHandler: clinepassModels,
    modelId: 'cline-pass/kimi-k3',
  },
  {
    provider: 'refuseless',
    key: 'REFUSELESS_API_KEY',
    keyValue: 'refuseless-test-key',
    base: 'https://api.refuseless.com/v1',
    modelsHandler: refuselessModels,
    modelId: 'glm-5.3-abliterated',
  },
];

try {
  process.env.AI_PROVIDER = 'openrouter';
  process.env.AI_API_KEY = 'other-provider-key';
  process.env.AI_BASE_URL = 'https://other.example/v1';
  process.env.AI_EXTRA_HEADERS_JSON = JSON.stringify({ Authorization: 'Bearer other-key' });

  for (const c of cases) {
    process.env[c.key] = c.keyValue;
    let calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      return Response.json({ choices: [{ message: { content: 'Done.' }, finish_reason: 'stop' }] });
    };

    const req = (parameters = {}) =>
      new Request('http://local/api/ai', {
        method: 'POST',
        body: JSON.stringify({
          provider: c.provider,
          bot: c.modelId,
          query: 'test',
          parameters,
        }),
      });

    let res = await handler(req({ max_tokens: 2048, web_search: false }));
    assert.equal(res.status, 200, c.provider);
    assert.equal(res.headers.get('X-AI-Provider'), c.provider);
    assert.equal(calls[0].url, `${c.base}/chat/completions`);
    assert.equal(calls[0].init.headers.Authorization, `Bearer ${c.keyValue}`);
    const payload = JSON.parse(calls[0].init.body);
    assert.equal(payload.model, c.modelId);
    assert.equal(payload.web_search, undefined);

    assert.equal((await handler(req({ web_search: true }))).status, 400);

    delete process.env[c.key];
    res = await handler(req());
    assert.equal(res.status, 500);
    assert.match(await res.text(), new RegExp(c.key));

    process.env[c.key] = c.keyValue;
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      const rows = [
        { id: c.modelId, name: 'Primary', context_length: 128000 },
        { id: 'other/model', name: 'Other', context_length: 8000 },
      ];
      if (c.provider === 'clinepass') {
        rows.push({ id: 'anthropic/claude-sonnet-4-6', name: 'Non pass', context_length: 200000 });
      }
      return Response.json({ data: rows, secret: 'not-for-browser' });
    };

    res = await c.modelsHandler(new Request('http://local/api/models'));
    const catalog = await res.json();
    assert.ok(catalog.data.some((m) => m.id === c.modelId));
    if (c.provider === 'clinepass') {
      assert.ok(!catalog.data.some((m) => m.id === 'anthropic/claude-sonnet-4-6'));
    }
    assert.equal(catalog.secret, undefined);
    assert.equal(calls.at(-1).url, `${c.base}/models`);
  }

  let browserBody;
  process.env.OPENCODE_GO_API_KEY = 'go-test-key';
  const sandbox = {
    window: { getForgeLlmProvider: () => 'opencode_go' },
    fetch: async (_, init) => {
      browserBody = JSON.parse(init.body);
      return new Response(
        'data: {"choices":[{"delta":{"content":"Done."},"finish_reason":"stop"}]}\n\n',
        { headers: { 'content-type': 'text/event-stream' } }
      );
    },
    Date,
    Math,
    JSON,
    TextDecoder,
  };
  vm.runInNewContext(fs.readFileSync(new URL('../public/ai-polyfill.js', import.meta.url), 'utf8'), sandbox);
  sandbox.window.Poe.registerHandler('test', () => {});
  await sandbox.window.Poe.sendUserMessage('@kimi-k3 test', { handler: 'test', stream: true });
  assert.equal(browserBody.provider, 'opencode_go');
  assert.ok(!JSON.stringify(browserBody).includes('go-test-key'));

  console.log('subscription-providers: OpenCode Go, ClinePass, and Refuseless routing/catalog tests passed; no paid calls.');
} finally {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) {
    if (!(key in previous)) delete process.env[key];
  }
  Object.assign(process.env, previous);
}
