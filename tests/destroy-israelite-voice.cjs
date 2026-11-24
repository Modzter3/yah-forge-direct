'use strict';
const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('public/index.html', 'utf8');
assert.match(html, /function buildDestroyIsraeliteDeepThinkerBlock\(/);
assert.match(html, /FORBIDDEN IN THIS MODE \(AUTO-FAIL\):/);
assert.match(html, /NO Paleo letter-by-letter spelling/);
assert.match(html, /if\(israelite\)\{\s*p\+=buildDestroyIsraeliteDeepThinkerBlock/);
assert.match(html, /not a camp preacher doing scripture karaoke/);
assert.doesNotMatch(
  html,
  /if\(israelite\)\{[\s\S]{0,400}buildWordHammerDoctrineBlock/,
  'Israelite destroy path must not invoke buildWordHammerDoctrineBlock in the same branch'
);
console.log('destroy-israelite-voice.cjs OK');