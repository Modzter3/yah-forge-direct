'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('public/index.html', 'utf8');
assert.match(html, /function parseTvSeasonEpisodeLock\(/);
assert.match(html, /function buildTvSeasonScopeLockBlock\(/);
assert.match(html, /TV SEASON \/ EPISODE SCOPE LOCK/);
assert.match(html, /destroySeasonLock=mediaType==='tv'/);
assert.match(html, /seasonLock=isTv\?parseTvSeasonEpisodeLock/);
assert.match(html, /dismantleSeasonLock=parseTvSeasonEpisodeLock/);

const fnChunk = html.match(
  /var TV_SEASON_WORDS[\s\S]*?function getDestroyEpisodeFocus\(title\)\{[\s\S]*?return lock\?lock\.label:'';\s*\}/
);
assert.ok(fnChunk, 'Could not extract TV season lock helpers from index.html');

const ctx = { parseInt, Math: global.Math, floor: Math.floor };
vm.runInNewContext(
  fnChunk[0] +
    '\nthis.parseTvSeasonEpisodeLock=parseTvSeasonEpisodeLock;this.buildTvSeasonScopeLockBlock=buildTvSeasonScopeLockBlock;',
  ctx
);

const parse = ctx.parseTvSeasonEpisodeLock;
const block = ctx.buildTvSeasonScopeLockBlock;

function expectParse(input, expected) {
  const got = parse(input);
  assert.ok(got, 'expected lock for: ' + input);
  assert.equal(got.season, expected.season);
  assert.equal(got.episode, expected.episode);
  assert.equal(got.label, expected.label);
}
expectParse('Breaking Bad Season 2', { season: 2, episode: null, label: 'Season 2' });
expectParse('The Wire season three', { season: 3, episode: null, label: 'Season 3' });
expectParse('Show S03E07 recap', { season: 3, episode: 7, label: 'S3E7' });
expectParse('Season 4 Episode 12 breakdown', {
  season: 4,
  episode: 12,
  label: 'Season 4 Episode 12',
});
assert.strictEqual(parse('Generic TV show critique'), null);

const lockText = block(parse('Empire Season 2'), { multiPart: true });
assert.match(lockText, /Season 2/);
assert.match(lockText, /Do NOT walk other seasons/);
assert.match(lockText, /MULTI-PART WITHIN THIS SEASON/);

for (const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
  try {
    new vm.Script(m[1]);
  } catch (e) {
    assert.fail('Inline script syntax error: ' + e.message);
  }
}

console.log('tv-season-lock.cjs OK');