const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('public/index.html','utf8');
// Compile all inline scripts to catch accidental syntax errors in prompt strings.
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);
// The toggle ships off, next to the Bez toggle, and speaks as Bez.
const markup=html.match(/<input type="checkbox" id="yahChatMoneyMode"[^>]*>/);
assert.ok(markup,'Bez Money toggle markup missing');
assert.doesNotMatch(markup[0],/checked/,'Bez Money must default to off');
assert.match(html,/id="yahChatMoneyMode" onchange="syncYahChatVoiceUi\(\)"/,'toggle must refresh the voice UI');
console.log('bez-money: toggle exists next to Bez, defaults off');
const blank=()=>({checked:false,value:'off',textContent:'',style:{},classList:{add(){},remove(){}},querySelector:()=>null});
let money=false,bez=false;
const el=id=>{
 if(id==='yahChatMoneyMode')return Object.assign(blank(),{checked:money});
 if(id==='yahChatBezMode')return Object.assign(blank(),{checked:bez});
 if(id==='yahChatExplicit')return Object.assign(blank(),{checked:false});
 return blank();
};
const context=vm.createContext({
 window:{},console,
 document:{getElementById:el,querySelector:()=>null,querySelectorAll:()=>[],activeElement:null,addEventListener(){},body:{classList:{add(){},remove(){}}}},
 yahChatMessages:[],YAH_CHAT_MAX_HISTORY:24,currentNewsContext:null,currentTopic:null,selectedPartCount:1
});
const src=Object.create(null);
for(const m of html.matchAll(/\nfunction ([A-Za-z0-9_$]+)\s*\(/g)){const s=m.index+1;src[m[1]]=html.slice(s,html.indexOf('\nfunction ',s+1));}
const has=n=>Object.prototype.hasOwnProperty.call(src,n);
(function load(root){const q=[root],seen=new Set();while(q.length){const n=q.shift();if(seen.has(n)||!has(n))continue;seen.add(n);vm.runInContext(src[n],context);for(const c of src[n].matchAll(/([A-Za-z_$][\w$]*)\s*\(/g))if(has(c[1]))q.push(c[1]);}})('buildYahChatPrompt');
assert.equal(context.isYahChatMoneyMode(),false);
assert.equal(context.isYahChatBrotherVoice(),false);
money=true;
assert.equal(context.isYahChatMoneyMode(),true);
assert.equal(context.isYahChatBrotherVoice(),true,'money mode must speak as Bez');
// The money block itself.
const block=context.buildBezMoneySystemBlock();
for(const marker of ['BEZ MONEY MODE','THE GAME','THE MECHANISM','THE MOVE','THE TELL','MECHANICS LIBRARY','TRAILING INTEREST','RIGHT OF OFFSET','ANSWER SHAPES','ACCURACY','REFUSE ALWAYS','EXAMPLES']){
 assert.ok(block.includes(marker),'money block missing: '+marker);
}
assert.ok(block.length<20000,'money block must stay focused ('+block.length+' chars)');
console.log('bez-money: block carries the game, the mechanics library, answer shapes, accuracy, examples');
// Money mode prompt: focused, no forge framework, no Suno branch, money voice lock.
const moneyPrompt=context.buildYahChatPrompt('my card charged me $22 after I paid it off',{});
assert.match(moneyPrompt,/BEZ MONEY MODE/,'money mode must use the money block');
assert.match(moneyPrompt,/MECHANICS LIBRARY/);
assert.doesNotMatch(moneyPrompt,/THE BIBLE IS A TECHNICAL MANUAL/,'money mode must drop the sermon framework');
assert.doesNotMatch(moneyPrompt,/THEOLOGICAL FRAMEWORK/,'money mode must drop the forge knowledge base');
assert.doesNotMatch(moneyPrompt,/BEZ — SUNO/,'money mode must not fall into the Suno branch');
assert.match(moneyPrompt,/BEZ MONEY — money questions only/,'money voice lock missing');
assert.match(moneyPrompt,/USER: my card charged me \$22 after I paid it off/);
console.log('bez-money: prompt is focused (no forge framework, no Suno), with the money voice lock');
// Bez-only mode keeps the old Bez block.
money=false;bez=true;
const bezPrompt=context.buildYahChatPrompt('explain the fee',{});
assert.match(bezPrompt,/BEZ CHAT MODE/,'bez mode must keep its own block');
assert.doesNotMatch(bezPrompt,/BEZ MONEY MODE/,'bez mode must not use the money block');
// Yah mode keeps the full framework.
bez=false;
const yahPrompt=context.buildYahChatPrompt('explain the fee',{});
assert.match(yahPrompt,/YAH CHAT MODE/,'yah mode must keep its block');
assert.match(yahPrompt,/THEOLOGICAL FRAMEWORK/,'yah mode keeps the forge framework');
assert.doesNotMatch(yahPrompt,/BEZ MONEY MODE/);
console.log('bez-money: bez and yah modes unchanged');