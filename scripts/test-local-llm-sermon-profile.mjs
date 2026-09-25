#!/usr/bin/env node
/** Local RunPod sermon profile: partition audit, validator, tokens, stream abort. */
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
  const src = readFileSync(join(dir, '../public/local-llm-sermon-profile.js'), 'utf8');
  const sandbox = {
    window: {},
    globalThis: {},
    currentChapterSource: { book: 'Numbers', chapter: 3, type: 'bible' },
    currentChapterVerseCount: 51,
    selectedPartCount: 3,
    getForgeLlmProvider: () => 'local',
    getVerseRangeForPart,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(src, sandbox, { filename: 'local-llm-sermon-profile.js' });
  return sandbox.ForgeLocalSermonProfile;
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

const crossOk =
  'Compare Exodus 13:2 for the firstborn claim. Now verse 18 in Numbers chapter 3 opens the census.';
const valCross = P.validateScriptureReferences(crossOk, meta2);
if (!valCross.ok) throw new Error('cross-ref should pass: ' + valCross.errors);

const words2800 = 2800;
const tok = P.maxTokensForWords(words2800);
if (tok >= P.sermonTokenCeiling()) throw new Error('2800-word part should stay below ceiling');

const ctrl = new AbortController();
P.registerStreamAbort('test-handler', ctrl);
let fetchAborted = false;
const inflight = new Promise((_resolve, reject) => {
  ctrl.signal.addEventListener('abort', () => {
    fetchAborted = true;
    reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
  });
});
P.abortStream('test-handler');
try {
  await inflight;
  throw new Error('inflight fetch should reject on abort');
} catch (e) {
  if (e.name !== 'AbortError') throw e;
}
if (!fetchAborted) throw new Error('abortStream must abort registered fetch');

if (P.recommendedPartsForChapter(51) !== 5) throw new Error('51 verses -> 5 parts');
if (P.maxRetries() !== 1) throw new Error('expected exactly 1 local LLM retry');

const params = P.applyGenerationParams({}, 1, state, { promptCharLength: 12000 });
if (params.local_llm_sermon !== true) throw new Error('local_llm_sermon flag');
if (params.frequency_penalty !== undefined) throw new Error('should not send frequency_penalty');
if (params.repeat_penalty !== 1.08) throw new Error('default repeat_penalty 1.08');
if (params.max_tokens < 2000) throw new Error('65536 ctx should allow >2k max_tokens for 12k char prompt');
const budgetOnly = P.applyLocalBudgetParams({ max_tokens: 8192 }, { promptCharLength: 12000 });
if (budgetOnly.max_tokens < 2000) throw new Error('applyLocalBudgetParams should not clamp to 768');

console.log('\nall checks passed');
