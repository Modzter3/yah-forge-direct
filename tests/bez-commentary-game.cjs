const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('public/index.html','utf8');
// Compile all inline scripts to catch accidental syntax errors in prompt strings.
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);
const blank=()=>({checked:false,value:'off',textContent:'',style:{},classList:{add(){},remove(){}},querySelector:()=>null});
const context=vm.createContext({
 window:{},console,
 document:{getElementById:()=>blank(),querySelector:()=>null,querySelectorAll:()=>[],activeElement:null,addEventListener(){},body:{classList:{add(){},remove(){}}}},
 currentNewsContext:null,currentTopic:null,currentChapterSource:null,currentMode:'topic',selectedPartCount:1
});
const src=Object.create(null);
for(const m of html.matchAll(/\nfunction ([A-Za-z0-9_$]+)\s*\(/g)){const s=m.index+1;src[m[1]]=html.slice(s,html.indexOf('\nfunction ',s+1));}
const has=n=>Object.prototype.hasOwnProperty.call(src,n);
(function load(root){const q=[root],seen=new Set();while(q.length){const n=q.shift();if(seen.has(n)||!has(n))continue;seen.add(n);vm.runInContext(src[n],context);for(const c of src[n].matchAll(/([A-Za-z_$][\w$]*)\s*\(/g))if(has(c[1]))q.push(c[1]);}})('buildTheatreCommentaryBlock');
const neutral={title:'Credit Card Policy',desc:'late fee cap'};
const gaming={title:'Insider Secrets to Outsmarting the Credit Card Giants',desc:'executives explain how to game their system'};
// Off means no commentary at all.
assert.equal(context.buildTheatreCommentaryBlock('off',neutral,{}),'','scene guide off must produce nothing');
// Bez carries the game mandate.
const bez=context.buildTheatreCommentaryBlock('bez',neutral,{});
assert.match(bez,/PUT THE LISTENER ON GAME \(MANDATORY -- EVERY PAUSE\)/,'Bez must be told to put the listener on game');
assert.match(bez,/THE MECHANISM/,'nugget needs the mechanism');
assert.match(bez,/THE MOVE/,'nugget needs the move');
assert.match(bez,/THE TELL/,'nugget needs the tell');
assert.match(bez,/peep what he just said/,'direct street address to the listener');
assert.match(bez,/FORBIDDEN IN A BEZ PAUSE/,'Bez pauses need a forbidden list');
assert.match(bez,/there is no escape/,'the doomer closer must be named and banned');
assert.match(bez,/ONE clean nugget per pause/,'one nugget per pause, not a tips list');
assert.match(bez,/do not want you saying back to them|they count on you not knowing this/,'the listener must be handed words to repeat');
console.log('bez-commentary: game mandate, nugget shape, and banned doomer closers present');
// The counter-play topic tightens it further.
const bezGaming=context.buildTheatreCommentaryBlock('bez',gaming,{});
assert.match(bezGaming,/COUNTER-PLAY PAUSES/,'gaming topics need the counter-play pause rule');
assert.match(bezGaming,/name the SAME seam the room just leaked/,'pause must restate the seam');
assert.match(bezGaming,/here is what they do not want you saying back to them/,'pause must give the listener the line');
assert.doesNotMatch(bez,/COUNTER-PLAY PAUSES/,'a neutral topic must not demand counter-play pauses');
console.log('bez-commentary: counter-play topics get the seam-restating pause');
// Yah keeps his own sovereign cadence -- this mandate is Bez-only.
const yah=context.buildTheatreCommentaryBlock('yah',neutral,{});
assert.doesNotMatch(yah,/PUT THE LISTENER ON GAME/,'Yah commentary must keep its own three-beat cadence');
assert.match(yah,/WHAT THEY THINK/,'Yah cadence untouched');
// No escaped-newline leakage into the rendered prompt.
assert.doesNotMatch(bez,/\\n/,'rendered prompt must not contain literal backslash-n');
console.log('bez-commentary: Yah cadence untouched, no escape leakage');