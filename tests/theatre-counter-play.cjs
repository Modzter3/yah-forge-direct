const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('public/index.html','utf8');
// Compile all inline scripts to catch accidental syntax errors in prompt strings.
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);
const blank=()=>({checked:false,value:'off',textContent:'',style:{},classList:{add(){},remove(){}},querySelector:()=>null});
const el=id=>{
 if(id==='toggleBehindTheVeil'||id==='togglePureTheatre')return Object.assign(blank(),{checked:true});
 return blank();
};
const context=vm.createContext({
 window:{},console,
 document:{getElementById:el,querySelector:()=>null,querySelectorAll:()=>[],activeElement:null,addEventListener(){},body:{classList:{add(){},remove(){}}}},
 currentTopic:null,currentChapterSource:null,currentChapterText:'',currentNewsContext:null,currentMode:'topic',
 selectedPartCount:1,sermonPartsRaw:[],sermonPartsTitles:[],sermonSeriesTitle:'',currentNewsArticles:[],usedNewsHeadlines:[]
});
const src=Object.create(null);
for(const m of html.matchAll(/\nfunction ([A-Za-z0-9_$]+)\s*\(/g)){const s=m.index+1;src[m[1]]=html.slice(s,html.indexOf('\nfunction ',s+1));}
const has=n=>Object.prototype.hasOwnProperty.call(src,n);
(function load(root){const q=[root],seen=new Set();while(q.length){const n=q.shift();if(seen.has(n)||!has(n))continue;seen.add(n);vm.runInContext(src[n],context);for(const c of src[n].matchAll(/([A-Za-z_$][\w$]*)\s*\(/g))if(has(c[1]))q.push(c[1]);}})('buildClosedDoorTheatrePrompt');
// The topic that produced a four-part villain confession with no usable intel.
const gaming={id:-1,title:'Insider Secrets to Outsmarting the Credit Card Giants',desc:'executives explain how to game their system and what the smart people are doing'};
const neutral={title:'Banking Policy',desc:'test topic'};
const build=(topic,extra)=>context.buildClosedDoorTheatrePrompt(1,Object.assign({topic,totalParts:1,wantBehindTheVeil:true,wantExplicit:false,commentaryVoice:'off',eli5Enabled:false,wantRoughBez:false},extra));
// Detection.
assert.equal(context.theatreTopicWantsCounterPlay(gaming),true,'gaming topic must be detected');
assert.equal(context.theatreTopicWantsCounterPlay({title:'How to beat the banks'}),true);
assert.equal(context.theatreTopicWantsCounterPlay({title:'What the smart money does'}),true);
assert.equal(context.theatreTopicWantsCounterPlay({title:'Insider secrets'}),true);
assert.equal(context.theatreTopicWantsCounterPlay(neutral),false,'neutral topic must not trigger counter-play');
assert.equal(context.theatreTopicWantsCounterPlay({title:'The Yield Trap',desc:'credit card APR policy'}),false);
console.log('counter-play detection: gaming/outsmarting topics only');
// The requirement block lands, with Scene guide OFF (the failing case had no narrator voice).
const prompt=build(gaming);
assert.match(prompt,/COUNTER-PLAY \(MANDATORY -- THE ROOM MUST LEAK THE SEAM\)/);
assert.match(prompt,/THE SEAM/);
assert.match(prompt,/THE SMART-MONEY MOVE/);
assert.match(prompt,/THE DAMAGE/);
assert.match(prompt,/THE ESCALATION/);
assert.match(prompt,/NEW MECHANICS ONLY/);
assert.match(prompt,/FORBIDDEN CLOSERS/);
assert.match(prompt,/no one outsmarts us/,'the ban must name the closer that ruined the last run');
assert.match(prompt,/the only way to win is to not play/);
assert.match(prompt,/INSIDE BOARDROOM DIALOGUE/,'counter-play must survive with no narrator');
const counterPlay=prompt.slice(prompt.indexOf('COUNTER-PLAY (MANDATORY'),prompt.indexOf('BEHIND THE VEIL -- NEWS TRIGGER'));
assert.doesNotMatch(counterPlay,/\[PAUSE --/,'the counter-play block itself must never ask for a narrator pause');
// No pause marker may be *instructed* anywhere while the scene guide is off.
const instructed=prompt.split('\n').filter(l=>/\[PAUSE --|\[RESUME SCENE\]/.test(l)&&!/\bnever\b|\bno\b|\bnot\b/i.test(l));
assert.equal(instructed.length,0,'commentary stays off: '+instructed[0]);
assert.match(prompt,/Reusing a mechanic, seam, or move that already appeared in an earlier act/,'repeat-mechanic ban');
console.log('gaming topic: seam + smart-money move + escalation required inside the boardroom, despair closers banned');
// Neutral topics are unchanged.
const plain=build(neutral);
assert.doesNotMatch(plain,/COUNTER-PLAY/,'neutral topic must not get the counter-play block');
assert.doesNotMatch(plain,/FORBIDDEN CLOSERS/);
assert.match(plain,/CLOSED-DOOR THEATRE MODE/);
// Scripture mode on a chapter topic stays untouched.
context.currentChapterSource={book:'Isaiah',chapter:60,type:'kjv'};
const chapter=build(neutral);
assert.doesNotMatch(chapter,/COUNTER-PLAY/,'chapter mode must not get the counter-play block');
context.currentChapterSource=null;
console.log('neutral topics and chapter mode: prompt unchanged');