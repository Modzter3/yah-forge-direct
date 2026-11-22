'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
assert.match(html, /function getVeilArticleModel\(/);
assert.match(html, /id="veilArticleModel"/);
assert.match(html, /id="newsVeilArticleModel"/);
assert.match(html, /getVeilArticleModel\(\)/);
assert.match(html, /id="veilArticleProvider"/);
assert.match(html, /forge_llm_provider/);
assert.doesNotMatch(html, /fetchNewsArticleForVeil[\s\S]{0,120}getNewsModel\(\)/);

const poly = fs.readFileSync(path.join(__dirname, '..', 'public', 'ai-polyfill.js'), 'utf8');
assert.match(poly, /parameters\.forge_llm_provider/);

const prov = fs.readFileSync(path.join(__dirname, '..', 'public', 'forge-llm-provider.js'), 'utf8');
assert.match(prov, /getVeilArticleLlmProvider/);

const orm = fs.readFileSync(path.join(__dirname, '..', 'public', 'openrouter-models.js'), 'utf8');
assert.match(orm, /hydrateForgeModelSelectsForProvider/);
assert.match(orm, /veilArticleModel/);
assert.match(orm, /newsVeilArticleModel/);

console.log('veil-article-model.cjs OK');