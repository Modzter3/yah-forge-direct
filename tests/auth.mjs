import assert from 'node:assert/strict';

process.env.YAHFORGE_ACCESS_TOKEN = 'test-access-token-at-least-24-characters';
process.env.KIE_API_KEY = 'unused-test-key';

const { default: auth } = await import('../api/auth.js');
const { default: ai } = await import('../api/ai.js');
const { default: kie } = await import('../api/kie-media.js');
const { default: models } = await import('../api/nanogpt-models.js');

const base = 'https://yah-forge.example';
const unauthorizedAi = await ai(new Request(base + '/api/ai', {
  method: 'POST',
  body: JSON.stringify({ query: 'test' }),
  headers: { 'Content-Type': 'application/json' },
}));
assert.equal(unauthorizedAi.status, 401);

const authorizedAi = await ai(new Request(base + '/api/ai', {
  method: 'POST',
  body: JSON.stringify({}),
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.YAHFORGE_ACCESS_TOKEN}`,
  },
}));
assert.equal(authorizedAi.status, 400);

assert.equal((await kie(new Request(base + '/api/kie-media?taskId=test'))).status, 401);
assert.equal((await models(new Request(base + '/api/nanogpt-models'))).status, 401);

const login = await auth(new Request(base + '/api/auth', {
  method: 'POST',
  body: JSON.stringify({ token: process.env.YAHFORGE_ACCESS_TOKEN }),
  headers: { 'Content-Type': 'application/json' },
}));
assert.equal(login.status, 200);
assert.match(login.headers.get('set-cookie') || '', /HttpOnly/);
assert.match(login.headers.get('set-cookie') || '', /SameSite=Strict/);

const wrongLogin = await auth(new Request(base + '/api/auth', {
  method: 'POST',
  body: JSON.stringify({ token: 'incorrect-but-long-enough-token-value' }),
  headers: { 'Content-Type': 'application/json' },
}));
assert.equal(wrongLogin.status, 401);

console.log('YahForge authentication tests passed.');
