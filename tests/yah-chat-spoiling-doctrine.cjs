const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('public/index.html','utf8');
// Compile all inline scripts to catch accidental syntax errors in prompt strings.
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);
const context=vm.createContext({window:{},isNameDropEnabled:()=>false,isNewsWeaveEnabled:()=>false,buildYahChatBezSunoBlock:()=>'SUNO_STUB'});
for(const name of ['buildWordHammerDoctrineBlock','buildYahChatDietaryBlock','buildYahChatForbiddenBlock','buildYahDirectVoiceBlock','buildForgeIdentityFrameworkLine','buildWatchersSethiteDoctrineBlock','buildYahushaMinistryIsraelIdentityBlock','buildBezStoryGrammarBlock','buildSpoilingTheHeathenDoctrineBlock','buildSpoilingTheHeathenBezBlock','buildForgeTheologicalFrameworkBlock','buildYahChatSystemBlock','buildYahChatBezSystemBlock']){
 const start=html.indexOf('function '+name+'(');assert.ok(start>=0,name);
 const end=html.indexOf('\nfunction ',start+1);
 vm.runInContext(html.slice(start,end),context);
}
const markers=[/SPOILING THE HEATHEN/,/Exodus chapter three verse twenty-two/,/Psalm chapter two verse eight/,/Proverbs chapter thirteen verse twenty-two/,/Rekullah/,/Qoph-Dalet-Shin/,/Isaiah chapter sixty verse eleven/,/Testament of Solomon/,/Sefer Yetzirah/,/BOUNDARIES \(NON-NEGOTIABLE\)/];
const doctrine=context.buildSpoilingTheHeathenDoctrineBlock();
for(const m of markers)assert.match(doctrine,m);
assert.match(doctrine,/FORBIDDEN FRAMES/);
console.log('doctrine block carries the spoil decree, escrow wealth, Rekullah, Qadosh, and the boundaries guard');
const yah=context.buildYahChatSystemBlock(false);
assert.match(yah,/YAH CHAT MODE/);
for(const m of markers)assert.match(yah,m);
console.log('Yah chat (Yah Direct) inherits the doctrine through the forge framework');
const bez=context.buildYahChatBezSystemBlock(false,'how do I use their money against them',[],false);
for(const m of markers)assert.match(bez,m);
assert.match(bez,/BROTHER BET CONVERSION \(MANDATORY\)/);
assert.match(bez,/THIRD PERSON about Yah/);
console.log('Bez chat (Brother Bet) inherits the doctrine with the third-person conversion lock');
const suno=context.buildYahChatBezSystemBlock(false,'v6 sounds worse than 4.5',[],true);
assert.doesNotMatch(suno,/SPOILING THE HEATHEN/);
assert.match(suno,/SUNO_STUB/);
console.log('Bez Suno/tech mode stays secular; the doctrine does not leak into it');
const sermon=context.buildForgeTheologicalFrameworkBlock({context:'sermon',wantStoryMode:false,wantBezStory:false,wantEpisodeMode:false,topic:{title:'Spoiling the Heathen'},directQuestion:false});
for(const m of markers)assert.match(sermon,m);
assert.ok(html.includes('id:91'),'Forge topic entry for spoiling the heathen');
console.log('Forged sermon prompts and the Forge topic list also inherit it');