import assert from 'node:assert/strict';
import fs from 'node:fs';
import handler from '../api/ai.js';
import { searchWeb, formatWebSearchContext, filterSearchResults } from '../api/web-search.js';

const previous = { ...process.env };
const originalFetch = globalThis.fetch;

const SERPER_NEWS = {
  news: [
    {
      title: 'CFPB caps card late fees at $8',
      link: 'https://example.news/fee-cap',
      snippet: 'The rule cuts late fees to $8 and banks say it costs them billions.',
    },
    {
      title: 'Banks brace for revenue hit',
      link: 'https://www.reuters.com/business/banks-brace',
      snippet: 'Issuers are repricing other fees as the cap lands.',
    },
  ],
};

const SERPER_APPLE = {
  news: [
    {
      title: 'Apple hardware news for November 2026',
      link: 'https://www.macworld.com/article/apple-november-2026.html',
      snippet: 'Apple should finally be done announcing new hardware for 2026.',
    },
  ],
};

try {
  for (const key of ['BRAVE_API_KEY', 'TAVILY_API_KEY', 'SERPER_API_KEY', 'FORGE_SERVER_WEB_SEARCH']) delete process.env[key];
  process.env.AI_PROVIDER = 'openrouter';
  delete process.env.AI_API_KEY;
  delete process.env.AI_BASE_URL;
  process.env.OPENROUTER_API_KEY = 'or-test-key';
  process.env.REFUSELESS_API_KEY = 'ref-test-key';

  // 1. Without API keys, searchWeb returns nothing (no Bing scrape).
  globalThis.fetch = async () => new Response('', { status: 404 });
  const empty = await searchWeb('credit card late fee cap', { max: 5 });
  assert.equal(empty.length, 0, 'search must not fall back to Bing without keys');

  process.env.SERPER_API_KEY = 'serper-test';
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('serper.dev/news')) return Response.json(SERPER_APPLE);
    if (u.includes('serper.dev/search')) return Response.json({ organic: SERPER_NEWS.news });
    return new Response('', { status: 404 });
  };
  const rows = await searchWeb('credit card late fee cap', { max: 5 });
  assert.equal(rows.length, 2, 'Serper must power search when key is set');
  assert.equal(rows[0].url, 'https://example.news/fee-cap');
  console.log('web-server-search: Serper-backed search returns titles, urls and snippets');

  const context = formatWebSearchContext(rows, { label: 'WEB SEARCH', when: '2026-11-04' });
  assert.match(context, /^LIVE WEB SEARCH RESULTS \(retrieved 2026-11-04/);
  assert.equal(formatWebSearchContext([]), '', 'no rows must produce no block');
  console.log('web-server-search: injection block is framed and sourced');

  const newsRows = await searchWeb('Apple smartphone news November 2026', { max: 5, news: true });
  assert.equal(newsRows.length, 1, 'news mode must use Serper news endpoint');
  const reference = filterSearchResults(
    [
      { title: 'Megachurch - Wikipedia', url: 'https://en.wikipedia.org/wiki/Megachurch', snippet: '' },
      { title: 'Pastor charged in $3M church embezzlement scheme', url: 'https://www.reuters.com/world/us/pastor-charged-2026', snippet: '' },
    ],
    { news: true },
  );
  assert.equal(reference.length, 1, 'encyclopedia hits must be filtered in news mode');
  console.log('web-server-search: news mode filters reference junk');

  const calls = [];
  const req = (provider, bot, parameters) =>
    new Request('http://local/api/ai', {
      method: 'POST',
      body: JSON.stringify({ provider, bot, query: 'biggest headlines this week', parameters }),
    });
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const u = String(url);
    if (u.includes('serper.dev/news')) return Response.json(SERPER_APPLE);
    if (u.includes('serper.dev/search')) return Response.json({ organic: SERPER_NEWS.news });
    if (u.includes('refuseless.com')) {
      return Response.json({ choices: [{ message: { content: 'done' }, finish_reason: 'stop' }] });
    }
    return Response.json({ choices: [{ message: { content: 'done' }, finish_reason: 'stop' }] });
  };

  let res = await handler(req('refuseless', 'glm-5.3-abliterated', { web_search: true, forge_search_query: 'credit card late fee cap', forge_search_news: true, forge_search_max: 15, max_tokens: 4000 }));
  assert.equal(res.status, 200, 'subscription providers must answer instead of 400');
  assert.equal(res.headers.get('X-AI-Web-Search'), 'live', 'mode must be reported to the client');
  const chatCall = calls.filter((c) => c.url.includes('refuseless.com')).at(-1);
  const body = JSON.parse(chatCall.init.body);
  assert.match(body.messages[0].content, /^LIVE WEB SEARCH RESULTS/);
  assert.ok(!calls.some((c) => c.url.includes('bing.com')), 'server search must not call Bing');
  console.log('web-server-search: non-OpenRouter injection uses API search only');

  calls.length = 0;
  delete process.env.SERPER_API_KEY;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('refuseless.com')) {
      return Response.json({ choices: [{ message: { content: 'done' }, finish_reason: 'stop' }] });
    }
    return new Response('', { status: 404 });
  };
  res = await handler(req('refuseless', 'glm-5.3-abliterated', { web_search: true, forge_search_query: 'zimbabwe coup', max_tokens: 4000 }));
  assert.equal(res.headers.get('X-AI-Web-Search'), 'empty');
  console.log('web-server-search: empty search reported honestly without Bing');

  calls.length = 0;
  process.env.OPENROUTER_API_KEY = 'or-test-key';
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json({ choices: [{ message: { content: 'done' }, finish_reason: 'stop' }] });
  };
  res = await handler(req('openrouter', 'google/gemini-3.8-flash', { web_search: true, max_tokens: 4000 }));
  assert.equal(res.headers.get('X-AI-Web-Search'), 'plugin');
  assert.ok(!calls.some((c) => c.url.includes('bing.com')));
  const orBody = JSON.parse(calls.at(-1).init.body);
  assert.deepEqual(orBody.plugins, [{ id: 'web', max_results: 10 }]);
  console.log('web-server-search: OpenRouter uses web plugin');

  calls.length = 0;
  res = await handler(req('openrouter', 'google/gemini-3.8-flash', { web_search: true, forge_search_query: 'Apple news October 2026', forge_search_news: true, forge_search_max: 15, max_tokens: 4000 }));
  assert.equal(res.headers.get('X-AI-Web-Search'), 'plugin', 'OpenRouter must not pre-inject Bing/API results');
  const orNews = JSON.parse(calls.at(-1).init.body);
  assert.equal(orNews.messages[0].content, 'biggest headlines this week');
  assert.deepEqual(orNews.plugins, [{ id: 'web', max_results: 15 }]);
  assert.ok(!calls.some((c) => c.url.includes('serper.dev')));
  console.log('web-server-search: OpenRouter news scan uses plugin max_results from forge_search_max');

  process.env.FORGE_SERVER_WEB_SEARCH = 'off';
  res = await handler(req('refuseless', 'glm-5.3-abliterated', { web_search: true, forge_search_query: 'anything', max_tokens: 4000 }));
  assert.equal(res.headers.get('X-AI-Web-Search'), 'off');
  delete process.env.FORGE_SERVER_WEB_SEARCH;
  console.log('web-server-search: FORGE_SERVER_WEB_SEARCH=off disables it');

  const html = fs.readFileSync('public/index.html', 'utf8');
  assert.match(html, /OpenRouter web plugin/);
  assert.match(fs.readFileSync('public/ai-polyfill.js', 'utf8'), /X-AI-Web-Search/);
  console.log('web-server-search: client labels OpenRouter plugin mode');
} finally {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) {
    if (!(key in previous)) delete process.env[key];
  }
  Object.assign(process.env, previous);
}
