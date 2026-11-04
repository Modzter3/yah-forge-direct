import assert from 'node:assert/strict';
import fs from 'node:fs';
import handler from '../api/ai.js';
import { searchWeb, formatWebSearchContext } from '../api/web-search.js';

const previous = { ...process.env };
const originalFetch = globalThis.fetch;

const BING_HTML = `
<html><body><ol id="b_results">
<li class="b_algo"><h2><a href="https://www.bing.com/ck/a?!&&p=abc&u=a1aHR0cHM6Ly9leGFtcGxlLm5ld3MvZmVlLWNhcA&ntb=1">CFPB caps card late fees at $8</a></h2><p class="b_lineclamp">The rule cuts late fees to $8 and banks say it costs them billions.</p></li>
<li class="b_algo"><h2><a href="https://www.reuters.com/business/banks-brace">Banks brace for revenue hit</a></h2><p class="b_lineclamp">Issuers are repricing other fees as the cap lands.</p></li>
</ol></body></html>`;

try {
  for (const key of ['BRAVE_API_KEY', 'TAVILY_API_KEY', 'SERPER_API_KEY', 'FORGE_SERVER_WEB_SEARCH']) delete process.env[key];
  process.env.AI_PROVIDER = 'openrouter';
  delete process.env.AI_API_KEY;
  delete process.env.AI_BASE_URL;
  process.env.OPENROUTER_API_KEY = 'or-test-key';
  process.env.REFUSELESS_API_KEY = 'ref-test-key';

  // 1. searchWeb parses a keyless Bing result page and unwraps the redirect URLs.
  globalThis.fetch = async (url) => {
    if (String(url).includes('bing.com/search')) return new Response(BING_HTML, { headers: { 'content-type': 'text/html' } });
    return new Response('', { status: 404 });
  };
  const rows = await searchWeb('credit card late fee cap', { max: 5 });
  assert.equal(rows.length, 2, 'two results parsed from the Bing page');
  assert.equal(rows[0].title, 'CFPB caps card late fees at $8');
  assert.equal(rows[0].url, 'https://example.news/fee-cap', 'bing redirect must be unwrapped');
  assert.match(rows[0].snippet, /cuts late fees to \$8/i);
  assert.equal(rows[1].url, 'https://www.reuters.com/business/banks-brace');
  console.log('web-server-search: keyless Bing scraping returns titles, urls and snippets');

  const context = formatWebSearchContext(rows, { label: 'WEB SEARCH', when: '2026-11-04' });
  assert.match(context, /^LIVE WEB SEARCH RESULTS \(retrieved 2026-11-04/);
  assert.match(context, /END LIVE RESULTS\./);
  assert.match(context, /USER REQUEST:/);
  assert.match(context, /https:\/\/example\.news\/fee-cap/);
  assert.equal(formatWebSearchContext([]), '', 'no rows must produce no block');
  console.log('web-server-search: injection block is framed and sourced');

  // 2. A provider without retrieval gets the search results injected before its prompt.
  const calls = [];
  const req = (provider, bot, parameters) =>
    new Request('http://local/api/ai', {
      method: 'POST',
      body: JSON.stringify({ provider, bot, query: 'biggest headlines this week', parameters }),
    });
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('bing.com/search')) return new Response(BING_HTML, { headers: { 'content-type': 'text/html' } });
    if (String(url).includes('refuseless.com')) {
      return Response.json({ choices: [{ message: { content: 'done' }, finish_reason: 'stop' }] });
    }
    return new Response('', { status: 404 });
  };

  let res = await handler(req('refuseless', 'glm-5.3-abliterated', { web_search: true, max_tokens: 4000 }));
  assert.equal(res.status, 200, 'subscription providers must answer instead of 400');
  assert.equal(res.headers.get('X-AI-Web-Search'), 'live', 'mode must be reported to the client');
  const chatCall = calls.filter((c) => c.url.includes('refuseless.com')).at(-1);
  const body = JSON.parse(chatCall.init.body);
  assert.match(body.messages[0].content, /^LIVE WEB SEARCH RESULTS/);
  assert.match(body.messages[0].content, /example\.news\/fee-cap/);
  assert.match(body.messages[0].content, /biggest headlines this week$/, 'the user query must still be at the end');
  assert.equal(body.web_search, undefined, 'the flag must not be forwarded upstream');
  assert.equal(body.plugins, undefined);
  console.log('web-server-search: results injected into the prompt and the mode reported');
  // 3. Empty search -> header says so, prompt untouched.
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('bing.com/search')) return new Response('<html><body>no results</body></html>', { headers: { 'content-type': 'text/html' } });
    return Response.json({ choices: [{ message: { content: 'done' }, finish_reason: 'stop' }] });
  };
  calls.length = 0;
  res = await handler(req('refuseless', 'glm-5.3-abliterated', { web_search: true, max_tokens: 4000 }));
  assert.equal(res.headers.get('X-AI-Web-Search'), 'empty');
  const emptyBody = JSON.parse(calls.filter((c) => c.url.includes('refuseless.com')).at(-1).init.body);
  assert.equal(emptyBody.messages[0].content, 'biggest headlines this week', 'no retrieval -> no injected block');
  console.log('web-server-search: empty search reported honestly, prompt untouched');

  // 4. OpenRouter keeps its native plugin and is not pre-searched.
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json({ choices: [{ message: { content: 'done' }, finish_reason: 'stop' }] });
  };
  calls.length = 0;
  res = await handler(req('openrouter', 'google/gemini-3.8-flash', { web_search: true, max_tokens: 4000 }));
  assert.equal(res.headers.get('X-AI-Web-Search'), 'plugin');
  assert.ok(!calls.some((c) => c.url.includes('bing.com')), 'OpenRouter must not trigger the server search');
  const orBody = JSON.parse(calls.at(-1).init.body);
  assert.deepEqual(orBody.plugins, [{ id: 'web', max_results: 10 }]);
  assert.equal(orBody.messages[0].content, 'biggest headlines this week');
  console.log('web-server-search: OpenRouter still uses its web plugin');

  // 5. Kill switch.
  process.env.FORGE_SERVER_WEB_SEARCH = 'off';
  globalThis.fetch = async (url) => {
    if (String(url).includes('bing.com/search')) throw new Error('search must not run when disabled');
    return Response.json({ choices: [{ message: { content: 'done' }, finish_reason: 'stop' }] });
  };
  res = await handler(req('refuseless', 'glm-5.3-abliterated', { web_search: true, max_tokens: 4000 }));
  assert.equal(res.headers.get('X-AI-Web-Search'), 'off', 'FORGE_SERVER_WEB_SEARCH=off must disable retrieval');
  delete process.env.FORGE_SERVER_WEB_SEARCH;
  console.log('web-server-search: FORGE_SERVER_WEB_SEARCH=off disables it');

  // 6. Client wiring: the page requests retrieval and reports what the server did.
  const html = fs.readFileSync('public/index.html', 'utf8');
  assert.match(html, /var params=\{web_search:true\};/, 'the news scan must request retrieval');
  assert.match(html, /window\.__forgeWebSearchMode/, 'the results banner must read the server mode');
  assert.match(html, /server-side web search/, 'the provider note must describe server-side search');
  assert.match(fs.readFileSync('public/ai-polyfill.js', 'utf8'), /X-AI-Web-Search/, 'the polyfill must stash the mode header');
  console.log('web-server-search: client requests retrieval and labels the result');
} finally {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) {
    if (!(key in previous)) delete process.env[key];
  }
  Object.assign(process.env, previous);
}
