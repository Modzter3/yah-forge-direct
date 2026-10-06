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

const numbers3 = JSON.parse(
  readFileSync(join(dir, '../public/corpus/kjv/Numbers.json'), 'utf8')
).chapters['3'];
const meta5 = {
  book: 'Numbers',
  chapter: 3,
  range: { start: 42, end: 51, count: 10 },
  partNum: 5,
  totalParts: 5,
  verseCount: 51,
};
const bad263 =
  'Verse forty-six isolates the deficit. Two hundred and sixty-three. 263 x 5 = 1315. Verse fifty: one thousand three hundred and threescore and five shekels.';
const val263 = P.validateScriptureReferences(bad263, meta5, { chapterText: numbers3 });
if (val263.ok) throw new Error('263 excess should fail KJV numeric validation');
if (!val263.errors.some((e) => /273/.test(e))) throw new Error('expected 273 correction in errors: ' + val263.errors);

const good273 =
  'Verse forty-six: two hundred and threescore and thirteen redeemed. Verse forty-seven: five shekels apiece. Verse fifty: 1365 shekels total.';
const valGood = P.validateScriptureReferences(good273, meta5, { chapterText: numbers3 });
if (!valGood.ok) throw new Error('correct KJV figures should pass: ' + valGood.errors);

const fillerPad = 'Verse exposition padding. '.repeat(20);
const fillerPart2 =
  fillerPad +
  'The fire is still burning on your skin. Verse eighteen names Libni and Shimei. They carry the charge.';
const fillerPrior = fillerPad + 'The fire is still burning on your skin from that gate warning.';
const degReuse = P.detectDegeneration(fillerPart2, { partNum: 2, priorPartsText: fillerPrior });
if (!degReuse || !/stock transition/i.test(degReuse.reason)) {
  throw new Error('should detect reused stock filler between parts: ' + (degReuse && degReuse.reason));
}
const degOk = P.detectDegeneration('Verse eighteen lists Libni and Shimei for the Gershon line.', {
  partNum: 2,
  priorPartsText: fillerPrior,
});
if (degOk) throw new Error('verse-only part 2 open should pass filler check: ' + degOk.reason);

// --- Boilerplate / repeated doctrine-block detection ---------------------------
// A long declaration pasted twice inside a single part must trip the detector.
const gateBlock =
  'Yah saved the Negro people who carry the true covenant, and only them, and the gate is shut in the faces of the other nations.' +
  ' The white nations, the Khazar Japhet who call themselves Jews, the European churches, and every Babylonian religion have no part in this salvation at all.';
const pad = 'Verse exposition that advances the band. '.repeat(12);
const boilerSamePart = pad + gateBlock + '\n\n' + pad + gateBlock;
const degBoiler = P.detectDegeneration(boilerSamePart, { partNum: 1 });
if (!degBoiler || !/boilerplate/i.test(degBoiler.reason)) {
  throw new Error(
    'should detect same boilerplate block repeated within a part: ' + (degBoiler && degBoiler.reason)
  );
}
// A long declaration that was already said in an earlier part must trip it on a later part.
const boilerReuse = pad + gateBlock;
const degReuseGate = P.detectDegeneration(boilerReuse, {
  partNum: 2,
  priorPartsText: 'Part one earlier. ' + gateBlock + ' More teaching here.',
});
if (!degReuseGate || !/earlier part/i.test(degReuseGate.reason)) {
  throw new Error(
    'should detect boilerplate declaration reused from an earlier part: ' +
      (degReuseGate && degReuseGate.reason)
  );
}
// A part with fresh, distinct teaching (no repeated long block) must NOT trip it.
const distinctTeaching =
  pad +
  gateBlock +
  '\n\n' +
  'Then the text turns to the census of the Levites, counted by their families, and the keeper of the ark is named and set over the charge of the sanctuary, a wholly different long teaching point.' +
  '\n\n' +
  pad;
const degFresh = P.detectDegeneration(distinctTeaching, { partNum: 1 });
if (degFresh && /boilerplate/i.test(degFresh.reason)) {
  throw new Error('fresh distinct part should not be flagged as boilerplate: ' + degFresh.reason);
}
// The direct detector should agree with the wrapper.
if (!P.detectBoilerplateRepeat || !P.detectBoilerplateRepeat(boilerSamePart, { partNum: 1 })) {
  throw new Error('detectBoilerplateRepeat should flag a within-part repeat');
}

const explicitBlock = P.buildLocalExplicitModeBlock({ book: 'Numbers', chapter: 3 });
if (!/EXPLICIT BRIMSTONE MODE: ON/.test(explicitBlock) || !/motherfucker/.test(explicitBlock)) {
  throw new Error('local explicit mode block missing required guidance');
}
if (!/HEATHEN/.test(explicitBlock) || !/SEPARATION/.test(explicitBlock) || !/SLAVERY/.test(explicitBlock)) {
  throw new Error('explicit block must carry the heathen/separation/slavery doctrine');
}
if (!/Factual accuracy/.test(explicitBlock) || !/KJV figures/.test(explicitBlock)) {
  throw new Error('explicit block must preserve accuracy discipline');
}

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
if (P.maxRetries() !== 0) throw new Error('expected zero local LLM auto-retries');

const params = P.applyGenerationParams({}, 1, state, { promptCharLength: 12000 });
if (params.local_llm_sermon !== true) throw new Error('local_llm_sermon flag');
if (params.frequency_penalty !== undefined) throw new Error('should not send frequency_penalty');
if (params.repeat_penalty !== 1.08) throw new Error('default repeat_penalty 1.08');
if (params.max_tokens < 2000) throw new Error('65536 ctx should allow >2k max_tokens for 12k char prompt');
const budgetOnly = P.applyLocalBudgetParams({ max_tokens: 8192 }, { promptCharLength: 12000 });
if (budgetOnly.max_tokens < 2000) throw new Error('applyLocalBudgetParams should not clamp to 768');

const html = readFileSync(join(dir, '../public/index.html'), 'utf8');
if (!html.includes('buildYahushaMinistryIsraelIdentityBlock')) {
  throw new Error('index.html missing Yahusha ministry Israel identity block');
}
if (!html.includes('Northern Kingdom') || !html.includes('isYahushaMinistryChapterContext')) {
  throw new Error('index.html missing centurion / ministry context helpers');
}
const orModels = readFileSync(join(dir, '../public/openrouter-models.js'), 'utf8');
if (!orModels.includes("'google/gemini-3-flash-preview'")) {
  throw new Error('openrouter-models.js must default to google/gemini-3-flash-preview');
}
if (!html.includes('NO fixed list of people') || !html.includes('Stock cast recycling')) {
  throw new Error('index.html missing anti-stock-cast Yah/Bez naming rules');
}
if (!html.includes('GRAVITY DOES NOT EXIST') || !html.includes('Gravity Is A Lie')) {
  throw new Error('index.html missing buoyancy/density gravity doctrine and topic');
}
if (!html.includes('toggleNameDrop') || !html.includes('isNameDropEnabled')) {
  throw new Error('index.html missing Name Drop toggle (separate from Yah/Bez Story cadence)');
}
if (!html.includes('syncNameDropToggles')) {
  throw new Error('index.html missing Name Drop sync with Web Research');
}
if (!html.includes('beginSermonParts') || !html.includes('fetchLessonSeriesTitle')) {
  throw new Error('index.html missing pre–Part 1 lesson series title flow');
}
if (!html.includes('lessonSeriesTitleBanner') || !html.includes('buildLessonSeriesTitlePromptBlock')) {
  throw new Error('index.html missing lesson series title banner/prompt block');
}
if (!html.includes('buildTechnologyKingdomForgeBlock') || !html.includes('isTechnologyForgeContext')) {
  throw new Error('index.html missing Yah/Bez technology kingdom forge framing');
}
if (!html.includes('KINGDOM UNDER BABYLON') || !html.includes('TECHNOLOGY FORGE')) {
  throw new Error('index.html missing technology kingdom teaching block text');
}
if (!html.includes('buildElevenLabsAudioTagsBlock') || !html.includes('ELEVEN_TAGGED_TTS_BOT')) {
  throw new Error('index.html missing Eleven v4 tag guidance and tagged TTS routing');
}
if (!html.includes('SHORT DESCRIBED TAGS') || !html.includes('PAUSE AFTER EVERY PARAGRAPH')) {
  throw new Error('index.html missing short described tag and paragraph pause guidance');
}
if (!html.includes('buildBezStoryVoiceLockBlock') || !html.includes('BEZ STORY PERSON LOCK -- HE TALKS ABOUT HIMSELF, NEVER AS YAH')) {
  throw new Error('index.html missing Bez Story never-as-Yah lock');
}
if (!html.includes('NO MADE-UP SLANG') || html.includes('CHURCH / RELIGION ANGLES') || html.includes('FINANCE / DEBT / WORK ANGLES')) {
  throw new Error('index.html Bez Story slang block must be plain English with no slogan pools');
}
if (!html.includes('setStandaloneCharCount') || !html.includes('standaloneCharInput') || !html.includes('ONE-PART LENGTH LOCK')) {
  throw new Error('index.html missing custom character length for 1-part episodes');
}
if (!html.includes('SUBJECT + FIRE LOCK') || !html.includes('stripPrematureForgeClosing') || !html.includes('getForgeMaxContinuations')) {
  throw new Error('index.html missing subject-locked continuation for short 1-part output');
}
if (!html.includes('buildOpeningVarietyBlock') || !html.includes('BANNED OPENERS')) {
  throw new Error('index.html missing dynamic opening variety block');
}
if (html.includes('You dumb-ass Negroes still sitting') || html.includes('Example tone: "')) {
  throw new Error('index.html must not ship paste-ready example insult openers');
}
if (!html.includes('shortenLongElevenTags') || !html.includes('addElevenParagraphPauses')) {
  throw new Error('index.html missing Eleven tag shortening and paragraph pause helpers');
}
for (const gone of ['elevenTagsRetryCount', 'looksLikeMissingElevenTags', 'looksLikeElevenTagsShoutHeavy', 'looksLikeElevenTagsOneWordHeavy', 'buildElevenTagsDriftCorrectionPrompt']) {
  if (html.includes(gone)) throw new Error('Eleven tag redo/retry logic must stay removed: ' + gone);
}
if (html.includes('No fixed tag list — short cues work')) {
  throw new Error('index.html still steers Eleven tags toward short one-word cues');
}
if (!html.includes('polishElevenLabsTaggedText') || !html.includes('polishElevenCurrentSermon')) {
  throw new Error('index.html missing Eleven Polish pass for tagged TTS');
}
if (!html.includes('Genesis 3 Curse — Israel Only') || !html.includes('GENESIS CHAPTER THREE CURSE -- ISRAEL')) {
  throw new Error('index.html missing Genesis 3 Israel-only curse doctrine and topic');
}
if (!html.includes('buildGenesis3CurseIsraelTopicLockBlock')) {
  throw new Error('index.html missing Genesis 3 curse topic lock block');
}
if (!html.includes('buildElevenExplicitTagPerformanceBlock') || !html.includes('EXPLICIT + ELEVEN TAGS')) {
  throw new Error('index.html missing Explicit/Eleven tag delivery balance');
}

for (const needle of [
  'buildSceneDismantleBlock', 'buildSceneDismantlePartFocus', 'startDismantleSermonLayout', 'setDismantleParts',
  'setDismantleChars', 'dismantleLayout', 'selectedPartChars', 'setPartCharCount', 'getForgePartCharTarget',
  'PART LENGTH LOCK', 'SCENE COVERAGE', 'sceneDismantle',
  'fetchFilmSourceFromWikipedia', 'lookupFilmIntoDismantleInput', 'dismantleAutoLookup', 'composeDismantleSourceInput',
]) {
  if (!html.includes(needle)) throw new Error('index.html missing movie scene dismantle feature: ' + needle);
}

console.log('\nall checks passed');
