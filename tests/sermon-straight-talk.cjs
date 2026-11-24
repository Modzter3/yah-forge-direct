'use strict';
const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('public/index.html', 'utf8');
assert.match(html, /function buildSermonStraightTalkBlock\(/);
assert.match(html, /buildSermonStraightTalkBlock\(\)/);
assert.doesNotMatch(html, /MODERN TECH COMPARISONS -- MANDATORY FOR ISRAELITE BROTHER MODE/);
assert.doesNotMatch(html, /MASTER ENGINEER LAYER -- MANDATORY IN ALL SERMONS/);
assert.doesNotMatch(html, /Drop at least 2-3 strong tech comparisons per sermon/);
assert.match(html, /SERMON OUTPUT LOCK/);
console.log('sermon-straight-talk.cjs OK');