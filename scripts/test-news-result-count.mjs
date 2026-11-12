import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('public/index.html', 'utf8');
assert.match(html, /params\.forge_search_max=resultTarget/);
assert.doesNotMatch(html, /finishNewsScanFromState/);
assert.match(html, /parseNewsResults\(msg\.content/);
assert.match(html, /COUNT: Return a JSON array of exactly/);
assert.match(html, /ZERO DUPLICATE STORIES/);
console.log('news-result-count: server quota wired, single-pass scan restore');
