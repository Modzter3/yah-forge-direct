const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('public/index.html','utf8');
// Compile all inline scripts to catch accidental syntax errors in prompt strings.
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);
const blank=()=>({checked:false,value:'off',textContent:'',style:{},classList:{add(){},remove(){}},querySelector:()=>null});
let commentaryValue='off';
const el=id=>{
 if(id==='toggleBehindTheVeil'||id==='togglePureTheatre')return Object.assign(blank(),{checked:true});
 if(id==='theatreCommentaryVoice')return Object.assign(blank(),{value:commentaryValue});
 return blank();
};
const context=vm.createContext({
 window:{},console,
 document:{getElementById:el,querySelector:()=>null,querySelectorAll:()=>[],activeElement:null,addEventListener(){},body:{classList:{add(){},remove(){}}}},
 currentTopic:null,currentChapterSource:null,currentChapterText:'',currentNewsContext:null,currentMode:'topic',
 selectedPartCount:1,sermonPartsRaw:[],sermonPartsTitles:[],sermonSeriesTitle:'',currentNewsArticles:[],usedNewsHeadlines:[]
});
// Load the closed-door theatre prompt builder plus its whole dependency closure.
const src=Object.create(null);
for(const m of html.matchAll(/\nfunction ([A-Za-z0-9_$]+)\s*\(/g)){const s=m.index+1;src[m[1]]=html.slice(s,html.indexOf('\nfunction ',s+1));}
const has=n=>Object.prototype.hasOwnProperty.call(src,n);
function load(root){
 const queue=[root],seen=new Set();
 while(queue.length){const n=queue.shift();if(seen.has(n)||!has(n))continue;seen.add(n);vm.runInContext(src[n],context);for(const c of src[n].matchAll(/([A-Za-z_$][\w$]*)\s*\(/g))if(has(c[1]))queue.push(c[1]);}
}
load('buildClosedDoorTheatrePrompt');
const topic={title:'Banking Policy',desc:'test topic'};
const build=extra=>context.buildClosedDoorTheatrePrompt(1,Object.assign({topic,totalParts:1,wantBehindTheVeil:true,wantExplicit:false,commentaryVoice:'off',eli5Enabled:false,wantRoughBez:false},extra));
// A marker line is only acceptable when it is a PROHIBITION (NEVER/NO) — never an instruction to emit it.
const markerRe=/\[PAUSE --|\[RESUME SCENE\]/;
const negRe=/\bnever\b|\bno\b|\bnot\b/i;
const instructed=text=>text.split('\n').filter(l=>markerRe.test(l)&&!negRe.test(l));
// Commentary OFF: no pause/resume marker is ever instructed anywhere in the theatre prompt.
for(const [label,prompt] of [['plain',build({})],['explicit',build({wantExplicit:true})],['rough bez',build({wantRoughBez:true})]]){
 assert.equal(instructed(prompt).length,0,'commentary markers instructed with commentary off ('+label+'): '+instructed(prompt)[0]);
 assert.match(prompt,/COMMENTARY IS OFF/,'commentary-off rule missing ('+label+')');
 assert.match(prompt,/NO narrator voice in the room/,'boardroom-only rule missing ('+label+')');
}
context.currentChapterSource={book:'Isaiah',chapter:60,type:'kjv'};
const chapterOff=build({});
assert.equal(instructed(chapterOff).length,0,'commentary markers instructed on the chapter path: '+instructed(chapterOff)[0]);
assert.match(chapterOff,/THEATRE SYMBOL LOCK/,'theatre symbol lock missing on the chapter path');
context.currentChapterSource=null;
console.log('commentary off: boardroom-only prompt instructs zero pause/resume markers (plain, explicit, rough bez, chapter)');
// Commentary ON still gets the markers for the chosen voice.
assert.ok(instructed(build({commentaryVoice:'yah'})).some(l=>/\[PAUSE -- YAH COMMENTARY\]/.test(l)),'Yah commentary markers missing when enabled');
assert.ok(instructed(build({commentaryVoice:'yah'})).some(l=>/\[RESUME SCENE\]/.test(l)),'RESUME SCENE missing when commentary enabled');
assert.ok(instructed(build({commentaryVoice:'bez'})).some(l=>/\[PAUSE -- BEZ COMMENTARY\]/.test(l)),'Bez commentary markers missing when enabled');
console.log('commentary yah/bez: pause and resume markers still instructed when enabled');
// The shared blocks must respect the same switch.
const decodeOff=context.buildUniversalSymbolDecoderBlock({voice:'theatre',chapterSrc:null,topic,wantRoughBez:false,theatre:true,wantBreakdown:true,commentaryVoice:'off'});
assert.equal(instructed(decodeOff).length,0,'symbol decoder instructs commentary markers with commentary off: '+instructed(decodeOff)[0]);
assert.doesNotMatch(decodeOff,/Commentary pauses must decode/,'symbol decoder demands commentary with commentary off');
assert.match(decodeOff,/THEATRE SYMBOL LOCK/,'theatre symbol lock missing');
const decodeOn=context.buildUniversalSymbolDecoderBlock({voice:'theatre',chapterSrc:null,topic,wantRoughBez:false,theatre:true,wantBreakdown:true,commentaryVoice:'yah'});
assert.match(decodeOn,/Commentary pauses must decode/,'symbol decoder lost its commentary demand when enabled');
const explicitOff=context.buildExplicitBrimstoneFireBlock({context:'theatre',wantRoughBez:false,wantYahStory:false,wantBezStory:false});
assert.equal(instructed(explicitOff).length,0,'explicit theatre block instructs commentary markers with commentary off: '+instructed(explicitOff)[0]);
assert.doesNotMatch(explicitOff,/commentary pauses stay RAW/i,'explicit theatre block assumes commentary when off');
assert.match(explicitOff,/NO commentary pause/i,'explicit theatre block missing the off-mode rule');
const explicitOn=context.buildExplicitBrimstoneFireBlock({context:'theatre',wantRoughBez:false,wantYahStory:true,wantBezStory:false});
assert.match(explicitOn,/commentary pauses stay RAW/i,'explicit theatre block lost raw commentary when enabled');
console.log('symbol decoder and explicit theatre blocks follow the scene-guide switch');
// Runtime guard: a committed act is scrubbed of stray commentary when commentary is off.
load('stripTheatreCommentaryWhenOff');
const guard=context.stripTheatreCommentaryWhenOff;
const sample=[
 '*Dramatization for prophetic illustration -- not a claim of factual record or leaked dialogue.*',
 '# Banking Policy',
 '[SCENE START] The room is sealed and the phones are in the box.',
 'GRAINGE: We move the policy Friday.',
 '[PAUSE -- YAH COMMENTARY]',
 'I am not in that room, but I own the room.',
 '[RESUME SCENE]',
 'GRAINGE: Keep it quiet until the weekend.',
 '[SCENE END]'
].join('\n');
const stripped=guard(sample);
assert.doesNotMatch(stripped,/\[PAUSE --/,'stray pause marker survived the runtime guard');
assert.doesNotMatch(stripped,/\[RESUME SCENE\]/,'stray resume marker survived the runtime guard');
assert.doesNotMatch(stripped,/I am not in that room/,'stray commentary body survived the runtime guard');
assert.match(stripped,/GRAINGE: We move the policy Friday/,'boardroom dialogue was damaged by the runtime guard');
assert.match(stripped,/GRAINGE: Keep it quiet until the weekend/,'boardroom dialogue was damaged by the runtime guard');
assert.equal(guard('GRAINGE: No markers here.\n[SCENE END]'),'GRAINGE: No markers here.\n[SCENE END]','guard altered a script with no commentary markers');
assert.match(guard('[PAUSE — BEZ COMMENTARY]\norphan em-dash block\n[SCENE END]'),/orphan em-dash block/,'orphan em-dash marker not handled');
assert.doesNotMatch(guard('[PAUSE — BEZ COMMENTARY]\norphan em-dash block\n[SCENE END]'),/\[PAUSE/,'orphan em-dash marker survived');
// Wiring: the commit funnel scrubs only when the scene guide is off.
assert.match(src['finalizeSermonPartText'],/if\(getTheatreCommentaryVoice\(\)==='off'\)out=stripTheatreCommentaryWhenOff\(out\)/,'finalizeSermonPartText does not scrub commentary when the scene guide is off');
console.log('runtime guard: stray commentary scrubbed when the scene guide is off, boardroom dialogue untouched');