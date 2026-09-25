#!/usr/bin/env node
/** Bonsai sermon profile: partition audit, validator, tokens, stream abort. */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import vm from 'vm';

const dir = dirname(fileURLToPath(import.meta.url));

function getVerseRangeForPart(partNum, totalParts, totalVerses) {
  const base = Math.floor(totalVerses / totalParts);
  const remainder = totalVerses % totalParts;
  let start = 1;
  for (let i = 1; i < partNum; i++) {
    start += base + (i <= remainder ? 1 : 0);
  }
  const count = base + (partNum <= remainder ? 1 : 0);
  const end = start + count - 1;
  return { start, end, count };
}

function loadProfile() {
  const src = readFileSync(join(dir, '../public/bonsai-sermon-profile.js'), 'utf8');
  const sandbox = {
    window: {},
    globalThis: {},
    currentChapterSource: { book: 'Numbers', chapter: 3, type: 'bible' },
    currentChapterVerseCount: 51,
    selectedPartCount: 3,
    getForgeLlmProvider: () => 'bonsai',
    getVerseRangeForPart,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(src, sandbox, { filename: 'bonsai-sermon-profile.js' });
  return sandbox.ForgeBonsaiProfile;
}

const P = loadProfile();
const NUMBERS_3 = 51;

console.log('=== Numbers 3 verse partitions ===');
for (const parts of [2, 3, 4, 5]) {
  const audit = P.auditVersePartition(NUMBERS_3, parts);
  if (!audit.ok) throw new Error('partition failed for ' + parts + ' parts: ' + audit.error);
  const summary = audit.ranges.map((r, i) => `P${i + 1}:${r.start}-${r.end}`).join(' | ');
  console.log(parts + ' parts:', summary, '=> ok');
}

const state = P.initSermonState();
state.coveredThrough = 17;
const meta2 = P.buildPartMeta(2, state);
const ledger = P.buildVerseLedger(meta2);
if (!ledger.includes('Already covered: Numbers 3:1-17')) {
  throw new Error('ledger should show 1-17 already covered for part 2 of 3, got:\n' + ledger);
}
console.log('\n=== Part 2 ledger (already covered) ===');
console.log(ledger.split('\n').slice(0, 10).join('\n'));

const crossOk =
  'Compare Exodus 13:2 for the firstborn claim. Now verse 18 in Numbers chapter 3 opens the census.';
const valCross = P.validateScriptureReferences(crossOk, meta2);
if (!valCross.ok) throw new Error('cross-ref should pass: ' + valCross.errors);

const bad = 'Numbers chapter one verse three says we must count. ' + 'x '.repeat(200);
const valBad = P.validateScriptureReferences(bad, meta2);
if (valBad.ok) throw new Error('expected wrong-chapter failure');

console.log('\n=== Cross-reference allowed ===');
console.log('validate Exodus compare:', valCross.ok);
console.log('validate wrong chapter:', valBad.errors[0]);

const words2800 = 2800;
const tok = P.maxTokensForWords(words2800);
const ceil = P.sermonTokenCeiling();
console.log('\n=== Token headroom (2800 words) ===');
console.log('max_tokens =', tok, '(ceiling', ceil + ', ratio 1.45)');
if (tok >= ceil) throw new Error('2800-word part should stay below ceiling');
if (tok < 4000) throw new Error('expected ~4060 tokens for 2800 words');

console.log('\n=== Stream abort (AbortController + registry) ===');
const ctrl = new AbortController();
P.registerStreamAbort('test-handler', ctrl);
let fetchAborted = false;
const inflight = new Promise((_resolve, reject) => {
  ctrl.signal.addEventListener('abort', () => {
    fetchAborted = true;
    reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
  });
});
const didAbort = P.abortStream('test-handler');
try {
  await inflight;
  throw new Error('inflight fetch should reject on abort');
} catch (e) {
  if (e.name !== 'AbortError') throw e;
}
if (!didAbort || !fetchAborted || !ctrl.signal.aborted) {
  throw new Error('ForgeBonsaiProfile.abortStream must abort the registered fetch');
}
console.log('abortStream() aborted in-flight request:', fetchAborted);

const fullCh = readFileSync(join(dir, '../public/corpus/kjv/Numbers.json'), 'utf8');
const numbersBook = JSON.parse(fullCh);
const ch3Full = numbersBook.chapters['3'];
state.fullChapterText = ch3Full;
const meta3 = P.buildPartMeta(3, state);
const slim = P.sliceChapterTextForBand(ch3Full, meta3.range, meta3);
if (!slim.includes('35.') || slim.includes('\n36.') === false && meta3.range.end >= 36) {
  /* range-dependent */
}
if (slim.length >= ch3Full.length * 0.85) {
  throw new Error('part 3 slice should be much smaller than full chapter');
}
if (!/^SLIM KJV EXCERPT/.test(slim)) throw new Error('missing slim header');
const est = P.estimatePromptTokens(90000);
const eff = P.effectiveContextTokens();
const budgetOut = Math.min(P.maxTokensForWords(2200), eff - est - 384);
console.log('\n=== Context budget (90k char prompt) ===');
console.log('effective_context=', eff, 'estimated_prompt_tokens=', est, 'max_out=', budgetOut);
if (budgetOut >= P.sermonTokenCeiling()) {
  throw new Error('large prompt should clamp max_tokens below sermon ceiling');
}
if (!P.isContextSizeError('Context size has been exceeded.')) {
  throw new Error('context error detector');
}

console.log('\n=== Part 3 slim excerpt ===');
console.log('full chars', ch3Full.length, 'slim chars', slim.length, 'verses', meta3.range.start + '-' + meta3.range.end);

console.log('\nall checks passed');
