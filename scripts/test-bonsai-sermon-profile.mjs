#!/usr/bin/env node
/** Smoke tests for public/bonsai-sermon-profile.js (no browser). */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import vm from 'vm';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, '../public/bonsai-sermon-profile.js'), 'utf8');
const sandbox = {
  window: {},
  globalThis: {},
  currentChapterSource: { book: 'Numbers', chapter: 3, type: 'bible' },
  currentChapterVerseCount: 51,
  selectedPartCount: 3,
  getForgeLlmProvider: () => 'bonsai',
  getVerseRangeForPart: (p, t, v) => {
    const base = Math.floor(v / t);
    const rem = v % t;
    let start = 1;
    for (let i = 1; i < p; i++) start += base + (i <= rem ? 1 : 0);
    const count = base + (p <= rem ? 1 : 0);
    return { start, end: start + count - 1, count };
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(src, sandbox, { filename: 'bonsai-sermon-profile.js' });
const P = sandbox.ForgeBonsaiProfile;

const state = P.initSermonState();
state.coveredThrough = 13;
const meta = P.buildPartMeta(2, state);
const ledger = P.buildVerseLedger(meta);
const loopText = 'Extend grace amidst chaos. '.repeat(20);
const deg = P.detectDegeneration(loopText);
if (!deg) throw new Error('expected degeneration detect');
const bad = 'Numbers chapter one verse three says we must count. ' + 'x '.repeat(200);
const val = P.validateScriptureReferences(bad, meta);
if (val.ok) throw new Error('expected validation failure');
console.log('ledger sample:\n', ledger.split('\n').slice(0, 10).join('\n'));
console.log('deg:', deg.reason);
console.log('val errors:', val.errors);
console.log('ok');
