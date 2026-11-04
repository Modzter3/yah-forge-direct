import assert from 'node:assert/strict';
import fs from 'node:fs';
import verifyLinks from '../api/verify-links.js';

const originalFetch = globalThis.fetch;

const post = (urls) =>
  new Request('http://local/api/verify-links', {
    method: 'POST',
    body: JSON.stringify({ urls }),
  });

try {
  // 1. Good, dead and unreachable links are told apart; bad input is skipped.
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('good.example.com')) {
      return new Response('', { status: 200, headers: { 'content-type': 'text/html' } });
    }
    if (String(url).includes('dead.example.com')) return new Response('', { status: 404 });
    if (String(url).includes('head-blocked.example.com')) {
      // Sites that refuse HEAD must be retried with GET.
      return init && init.method === 'HEAD' ? new Response('', { status: 405 }) : new Response('', { status: 200 });
    }
    throw new Error('dns failure');
  };
  let res = await verifyLinks(post([
    'https://good.example.com/story',
    'https://dead.example.com/story',
    'https://head-blocked.example.com/story',
    'https://gone.example.com/story',
    'not-a-url',
    'ftp://nope.example.com/x',
    'https://good.example.com/story',
  ]));
  assert.equal(res.status, 200);
  const body = await res.json();
  const byUrl = Object.fromEntries(body.results.map((r) => [r.url, r]));
  assert.equal(body.results.length, 4, 'dedupe + drop non-http entries');
  assert.equal(byUrl['https://good.example.com/story'].ok, true);
  assert.equal(byUrl['https://dead.example.com/story'].ok, false);
  assert.equal(byUrl['https://dead.example.com/story'].status, 404);
  assert.equal(byUrl['https://head-blocked.example.com/story'].ok, true, 'HEAD 405 must fall back to GET');
  assert.equal(byUrl['https://gone.example.com/story'].ok, false, 'network failure is not a valid link');
  assert.equal(body.skipped, 3, 'two non-http entries plus the duplicate');
  console.log('verify-links: verified, dead, head-blocked and unreachable URLs separated');

  // 2. Empty / junk payloads are harmless.
  globalThis.fetch = async () => { throw new Error('should not be called'); };
  res = await verifyLinks(post([]));
  assert.deepEqual(await res.json(), { results: [], checked: 0, skipped: 0 });
  res = await verifyLinks(new Request('http://local/api/verify-links', { method: 'POST', body: '{bad json' }));
  assert.equal(res.status, 400);
  res = await verifyLinks(new Request('http://local/api/verify-links', { method: 'GET' }));
  assert.equal(res.status, 405);
  console.log('verify-links: guards for empty, invalid and wrong-method requests');

  // 3. Cap at 30 URLs so a scan cannot turn into 50 outbound probes.
  const many = Array.from({ length: 45 }, (_, i) => `https://cap.example.com/${i}`);
  let probed = 0;
  globalThis.fetch = async () => { probed++; return new Response('', { status: 200 }); };
  res = await verifyLinks(post(many));
  const capBody = await res.json();
  assert.equal(capBody.results.length, 30, 'probe cap');
  assert.equal(capBody.skipped, 15, 'skipped count reported');
  assert.equal(probed, 30, 'only 30 probes were made');
  console.log('verify-links: probe cap enforced');

  // 4. Client wiring: the scan checks links and labels the result.
  const html = fs.readFileSync('public/index.html', 'utf8');
  assert.match(html, /fetch\('\/api\/verify-links'/, 'the scan must call the verifier');
  assert.match(html, /link verified/, 'card must show a verified badge');
  assert.match(html, /link dead/, 'card must show a dead-link badge');
  assert.match(html, /no link — verify manually/, 'card must flag items with no link');
  assert.match(html, /dead links are usually invented headlines/, 'summary must warn about invented headlines');
  assert.match(html, /NO-FABRICATION LOCK/, 'the scan prompt must forbid invented headlines and URLs');
  assert.match(html, /renderNewsAndVerify\(/, 'parsing must trigger verification');
  console.log('verify-links: client checks links, labels them, and forbids fabrication in the prompt');
} finally {
  globalThis.fetch = originalFetch;
}