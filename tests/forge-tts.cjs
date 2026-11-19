const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const forgeSrc = fs.readFileSync(path.join(__dirname, '../public/forge-tts.js'), 'utf8');
const context = { localStorage: { getItem: () => null, setItem: () => {} } };
vm.createContext(context);
vm.runInContext(forgeSrc, context);
const ForgeTts = context.ForgeTts;
assert.ok(ForgeTts, 'ForgeTts loads');
assert.equal(ForgeTts.museTtsAvailable, false, 'Muse has no OpenRouter speech model');
assert.equal(ForgeTts.pickModel(false), ForgeTts.DEFAULT_MODEL);
assert.equal(ForgeTts.pickModel(true), ForgeTts.EXPRESSIVE_MODEL);
assert.match(ForgeTts.describeModel(ForgeTts.DEFAULT_MODEL), /free/i);

(async () => {
  const { resolveVoice } = await import('../api/tts.js');
  assert.equal(resolveVoice('heygen/heygen-voice-1-turbo:free', 'Jessica'), 'nadine');
  assert.equal(resolveVoice('elevenlabs/eleven-v3', 'Brian'), 'brian');
  console.log('forge-tts voice map ok');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});