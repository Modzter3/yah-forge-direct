const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('public/index.html','utf8');
// Compile all inline scripts to catch accidental syntax errors in prompt strings.
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);
const blank=()=>({checked:false,value:'off',textContent:'',style:{},classList:{add(){},remove(){}},querySelector:()=>null});
let reasoningModels=['anthropic/claude-sonnet-5.5','google/gemini-3.8-flash'];// the app fills this from the live catalog
const context=vm.createContext({
 window:{},console,
 document:{getElementById:()=>blank(),querySelector:()=>null,querySelectorAll:()=>[],activeElement:null,addEventListener(){},body:{classList:{add(){},remove(){}}}},
 // Stands in for window.forgeModelSupportsReasoning (loaded from openrouter-models.js in the app).
 forgeModelSupportsReasoning:model=>reasoningModels.indexOf(String(model))!==-1,
});
// Pull the numeric constants the budget maths depends on straight out of the page.
for(const name of ['SERMON_MAX_CONTINUATIONS','FORGE_CHARS_PER_WORD','SERMON_STANDALONE_MIN_RATIO','SERMON_PART_CHARS_MIN_RATIO','SERMON_MIN_WORD_RATIO','selectedStandaloneWords','selectedStandaloneChars','selectedPartChars','selectedPartCount']){
 const m=html.match(new RegExp('var '+name+'\\s*=\\s*([0-9.]+)'));
 assert.ok(m,'constant not found: '+name);
 context[name]=parseFloat(m[1]);
}
const src=Object.create(null);
for(const m of html.matchAll(/\nfunction ([A-Za-z0-9_$]+)\s*\(/g)){const s=m.index+1;src[m[1]]=html.slice(s,html.indexOf('\nfunction ',s+1));}
const has=n=>Object.prototype.hasOwnProperty.call(src,n);
(function load(root){const q=[root],seen=new Set();while(q.length){const n=q.shift();if(seen.has(n)||!has(n))continue;seen.add(n);vm.runInContext(src[n],context);for(const c of src[n].matchAll(/([A-Za-z_$][\w$]*)\s*\(/g))if(has(c[1]))q.push(c[1]);}})('getForgeMaxTokens');
(function load(root){const q=[root],seen=new Set();while(q.length){const n=q.shift();if(seen.has(n)||!has(n))continue;seen.add(n);vm.runInContext(src[n],context);for(const c of src[n].matchAll(/([A-Za-z_$][\w$]*)\s*\(/g))if(has(c[1]))q.push(c[1]);}})('getForgeAdaptiveContinuationTokens');
(function load(root){const q=[root],seen=new Set();while(q.length){const n=q.shift();if(seen.has(n)||!has(n))continue;seen.add(n);vm.runInContext(src[n],context);for(const c of src[n].matchAll(/([A-Za-z_$][\w$]*)\s*\(/g))if(has(c[1]))q.push(c[1]);}})('getForgeMaxContinuations');

const SONNET='anthropic/claude-sonnet-5.5';
// 1. A reasoning model gets headroom because thinking tokens count against max_tokens.
const reasoned=context.getForgeMaxTokens(SONNET,1);
const plain=context.getForgeMaxTokens('openai/gpt-4.1',1);
assert.equal(reasoned,plain+4096,'reasoning models must get 4096 tokens of thinking headroom');
assert.ok(reasoned<=context.getModelMaxOutputTokens(SONNET),'headroom must respect the model cap');
assert.equal(context.getForgeMaxTokens('google/gemini-3.8-flash',1),context.getForgeMaxTokens('openai/gpt-4.1',1)+2048,'flash tier gets a smaller allowance');
reasoningModels=[];
assert.equal(context.getForgeMaxTokens(SONNET,1),plain+4096,'with no catalog the name fallback still protects a thinking model');
assert.equal(context.getForgeMaxTokens('meta-llama/llama-4-70b',1),plain,'non-reasoning families keep the old budget');
reasoningModels=['anthropic/claude-sonnet-5.5','google/gemini-3.8-flash'];
console.log('continuation-budget: reasoning headroom added to the first response');
// The name fallback must cover the async-catalog window and deployments without a catalog.
assert.equal(context.getForgeMaxTokens('anthropic/claude-sonnet-5.5',1),plain+4096,'name fallback: claude sonnet 5.5');
assert.equal(context.getForgeMaxTokens('openai/gpt-5.6-sol-pro',1),plain+4096,'name fallback: gpt-5.x');
assert.equal(context.getForgeMaxTokens('google/gemini-3.8-flash',1),plain+2048,'name fallback: gemini 3 flash');
assert.equal(context.getForgeMaxTokens('x-ai/grok-4.7',1),plain+4096,'name fallback: grok 4.x');
assert.equal(context.getForgeMaxTokens('anthropic/claude-haiku-3.5',1),plain,'haiku is not a thinking model');
assert.equal(context.getForgeMaxTokens('google/gemini-2.0-flash',1),plain,'gemini 2.0 has no thinking level');
assert.equal(context.getForgeMaxTokens('meta-llama/llama-4-70b',1),plain,'non-reasoning families stay untouched');
console.log('continuation-budget: name fallback covers the async catalog window');

// 2. Continuations get a real floor, the same headroom, and escalate when the model keeps blowing it.
const ctx={continuationOpts:{finishThoughtOnly:true},completionDiagnostics:[]};
const finishing=context.getForgeAdaptiveContinuationTokens(SONNET,'x'.repeat(20000),1,ctx);
assert.equal(finishing,4096+4096,'finishing continuation floor must clear 2048');
ctx.completionDiagnostics=[{part:1,phase:'continuation',truncated:true,requestedTokens:8192}];
const escalated=context.getForgeAdaptiveContinuationTokens(SONNET,'x'.repeat(20000),1,ctx);
assert.equal(escalated,12288+4096,'escalation must grow the budget by 1.5x plus headroom');
assert.ok(escalated<=context.getModelMaxOutputTokens(SONNET),'escalation stays under the cap');
console.log('continuation-budget: continuation floor and escalation');
// 3. The automatic continuation limit grows instead of giving up at two.
const quiet={completionDiagnostics:[]};
assert.equal(context.getForgeMaxContinuations(SONNET,1,quiet,1),2,'normal parts still get two continuations');
const thrashing={completionDiagnostics:[{part:1,truncated:true},{part:1,truncated:true}]};
assert.equal(context.getForgeMaxContinuations(SONNET,1,thrashing,1),4,'two truncations on this part earn more attempts');
const thrashingMore={completionDiagnostics:[{part:1,truncated:true},{part:1,truncated:true},{part:1,truncated:true},{part:1,truncated:true}]};
assert.equal(context.getForgeMaxContinuations(SONNET,1,thrashingMore,1),context.SERMON_MAX_CONTINUATIONS,'limit climbs toward the ceiling but never past it');
const otherPart={completionDiagnostics:[{part:2,truncated:true},{part:2,truncated:true}]};
assert.equal(context.getForgeMaxContinuations(SONNET,1,otherPart,1),2,'another part struggling must not inflate this one');
console.log('continuation-budget: automatic continuation limit scales with repeated truncation');
// 4. The give-up message tells the user what to change.
assert.match(html,/turn on Fast start \(less thinking leaves more room for the body\), or lower Chars \/ Part/,'the truncation notice must suggest the fix');
console.log('continuation-budget: truncation notice is actionable');