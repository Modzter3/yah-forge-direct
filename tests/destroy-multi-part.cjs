'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('public/index.html', 'utf8');
assert.match(html, /id="destroyPartBtns"/);
assert.match(html, /function setDestroyPartCount\(/);
assert.match(html, /function generateDestroyPart\(/);
assert.match(html, /selectedDestroyRounds>1/);
for (const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
  try {
    new vm.Script(m[1]);
  } catch (e) {
    assert.fail('Inline script syntax error: ' + e.message);
  }
}
console.log('destroy-multi-part.cjs OK');