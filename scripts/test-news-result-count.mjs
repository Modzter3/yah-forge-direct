import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('public/index.html', 'utf8');
assert.match(html, /params\.forge_search_max=resultTarget/);
assert.match(html, /finishNewsScanFromState/);
assert.match(html, /buildNewsScanTopUpPrompt/);
assert.match(html, /JSON array length MUST equal/);
console.log('news-result-count: client passes quota, top-up scan, and hard-count prompt');
