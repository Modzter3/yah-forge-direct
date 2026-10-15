const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('public/index.html','utf8');
// Compile all inline scripts to catch accidental syntax errors in prompt strings.
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);
const context=vm.createContext({isNameDropEnabled:()=>false});
for(const name of ['buildBezSpeakerBoundaryBlock','buildBezStoryVoiceLockBlock','buildBezStoryKnowledgeBlock','buildBezStoryLiveHumanBlock','buildRoughBezScriptureSpineBlock']){
 const start=html.indexOf('function '+name+'(');assert.ok(start>=0,name);
 const end=html.indexOf('\nfunction ',start+1);
 vm.runInContext(html.slice(start,end),context);
}
for(const name of ['buildBezStoryVoiceLockBlock','buildBezStoryKnowledgeBlock','buildBezStoryLiveHumanBlock']){
 const prompt=context[name]();
 assert.match(prompt,/Do not introduce personal biography/);
 assert.doesNotMatch(prompt,/Miami|Missouri|Amazon|COVID|thirteen|pastor.s daughter|canonical bio/i);
 assert.doesNotMatch(prompt,/one memory pulling another|more memory|LIVED STRUGGLE DETAILS/);
 console.log(name+': no bio facts or required personal anecdotes');
}
const spine=context.buildRoughBezScriptureSpineBlock({title:'A test'}, {book:'Test',chapter:1},1,2);
assert.match(spine,/not a numbered sequence to repeat/);
assert.doesNotMatch(spine,/THE LOOP --|\(1\) QUOTE/);
assert.ok(!html.includes('REVELATION DELIVERY LOOP'));
assert.ok(!html.includes('buildBezStoryBioBlock'));
console.log('Scripture order preserved; repeated delivery loops removed; inline scripts compile');
