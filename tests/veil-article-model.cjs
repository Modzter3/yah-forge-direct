'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
assert.match(html, /function getVeilArticleModel\(/);
assert.match(html, /id="veilArticleModel"/);
assert.match(html, /id="newsVeilArticleModel"/);
assert.match(html, /getVeilArticleModel\(\)/);
assert.doesNotMatch(html, /fetchNewsArticleForVeil[\s\S]{0,80}getNewsModel\(\)/);

const orm = fs.readFileSync(path.join(__dirname, '..', 'public', 'openrouter-models.js'), 'utf8');
assert.match(orm, /veilArticleModel/);
assert.match(orm, /newsVeilArticleModel/);

console.log('veil-article-model.cjs OK');