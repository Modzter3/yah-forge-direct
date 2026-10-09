import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(match[1]);
function source(name){const start=html.indexOf('function '+name+'(');const end=html.indexOf('\nfunction ',start+1);return html.slice(start,end);}
const body='Teaching one.\n\nTeaching two.\n\nTeaching three.';
const s={selectedPartCount:1,isTheatreModeActive:()=>false,isLocalLlmChapterSermonActive:()=>false};
vm.createContext(s);
for(const name of ['looksLikeForgeClosingParagraph','stripPrematureForgeClosing','shouldStageForgeClosing','buildSermonClosingPrompt','detectTruncation','isSermonResponseTruncated','getForgeRemainingTokens','getForgeMaxContinuations'])vm.runInContext(source(name),s);
const signoff='[low, tight] This has been Brother Bet. Peace, Israel. Yah First, last, and always. [pause]';
assert.equal(s.stripPrematureForgeClosing(body+'\n\n'+signoff+'\n\nYou think because I said peace we are done?'),body);
assert.equal(s.stripPrematureForgeClosing(body),body);
assert.equal(s.stripPrematureForgeClosing(body+'\n\n[quiet] Peace, Israel. [pause]'),body);
assert.equal(s.stripPrematureForgeClosing('Teaching about the door closing.\n\nMore teaching.'),'Teaching about the door closing.\n\nMore teaching.');
assert.equal(s.shouldStageForgeClosing(),true);
s.selectedPartCount=2;assert.equal(s.shouldStageForgeClosing(),true);s.selectedPartCount=1;
s.isLocalLlmChapterSermonActive=()=>true;assert.equal(s.shouldStageForgeClosing(),false);s.isLocalLlmChapterSermonActive=()=>false;
s.buildPartPrompt=(n,opts)=>{assert.equal(opts.allowClosing,true);return 'LENGTH MINIMUM\nRULE 6 -- CLOSING\nUse one topic-specific goodbye.\nVOICE & STYLE RULES:\nOther rules';};
const close=s.buildSermonClosingPrompt(1,body);assert.ok(close.includes('Use one topic-specific goodbye'));assert.ok(!close.includes('LENGTH MINIMUM'));assert.ok(close.includes('No new teaching'));
// Drive the actual stream completion callback: short body -> continuation -> closing -> commit.
let callback;const prompts=[];const commits=[];
Object.assign(s,{sermonGenCtx:{partContent:'',partContainer:{},continuationCount:0,yahVoiceRetryCount:0,driftRetryCount:0,explicitRetryCount:0},
getForgeStreamModel:()=> 'test',getSermonWebSearchParams:()=>({}),getModelMaxOutputTokens:()=>4000,
wrapPromptForGrokIfNeeded:p=>p,isYahStoryModeActive:()=>false,appendYahStoryApiParams:()=>{},ForgeLocalSermonProfile:null,
clearSermonWatchdogs:()=>{},armSermonWatchdogs:()=>{},finalizeSermonPartText:t=>t,marked:{parse:t=>t},
joinContinuationText:(a,b)=>a+'\n\n'+b,isForgePartUnderWordTarget:t=>!t.includes('Enough teaching'),
getForgeMaxContinuations:()=>2,getForgeWordsPerPart:()=>2000,countForgeWords:t=>t.split(/\s+/).length,selectedStandaloneChars:0,selectedPartChars:0,FORGE_CHARS_PER_WORD:6,theatreActComplete:()=>false,looksLikeYahStoryGuardrailRefusal:()=>false,
isRoughBezForgeActive:()=>false,forgeIsFlashTier:()=>false,isExplicitModeActive:()=>false,
SERMON_MAX_YAH_VOICE_RETRIES:1,SERMON_MAX_DRIFT_RETRIES:1,SERMON_MAX_EXPLICIT_RETRIES:1,
commitSermonPart:(n,t)=>commits.push(t),generatePart:()=>{},buildSermonContinuationPrompt:()=> 'BODY CONTINUATION ONLY',
buildPartPrompt:(n,opts)=>opts?.allowClosing?'RULE 6 -- CLOSING\nOne goodbye.\nVOICE & STYLE RULES:':'BODY ONLY'});
s.AbortController=AbortController;
s.window={Poe:{registerHandler:(name,cb)=>callback=cb,sendUserMessage:(p,opts)=>{prompts.push({p,opts});return Promise.resolve();}}};
vm.runInContext(source('startSermonPartStream'),s);
s.startSermonPartStream(1,false);
callback({responses:[{status:'complete',content:body+'\n\n'+signoff}]});
assert.equal(prompts.length,2);assert.ok(!s.sermonGenCtx.partContentBeforeContinue.includes('Peace, Israel'));
callback({responses:[{status:'complete',content:'Enough teaching.\n\n'+signoff}]});
assert.equal(prompts.length,3);assert.ok(prompts[2].p.includes('FINAL CLOSING ONLY'));assert.equal(prompts[2].opts.parameters.max_tokens,800);
assert.ok(!s.sermonGenCtx.partContentBeforeContinue.includes('Peace, Israel'));
callback({responses:[{status:'complete',content:'One final goodbye.'}]});
assert.equal(prompts.length,3);assert.equal(commits.length,1);assert.ok(commits[0].endsWith('One final goodbye.'));assert.ok(!commits[0].includes('Peace, Israel'));
console.log('sermon-closing: removal, scope, prompts, and body/continuation/closing lifecycle passed');

// The actual cause: a completed paragraph ending in a voice tag looked truncated.
const tagged='This is a complete teaching paragraph with enough text to exercise truncation detection. [pause]';
assert.equal(s.detectTruncation(tagged),false);
assert.equal(s.detectTruncation(tagged+' [low, tight]'),false);
assert.equal(s.detectTruncation('This is an unfinished paragraph with enough words to be evaluated and they were [pause]'),true);
assert.equal(s.isSermonResponseTruncated({finishReason:'stop'},'A model-approved ending'),false);
assert.equal(s.isSermonResponseTruncated({finishReason:'length'},tagged),true);
assert.equal(s.isSermonResponseTruncated({},tagged),false);
// A complete tagged middle part must advance without buying another request.
function reset(partNum,totalParts){
 s.selectedPartCount=totalParts;
 s.sermonGenCtx={partNum,partContent:'',partContainer:{},continuationCount:0,yahVoiceRetryCount:0,driftRetryCount:0,explicitRetryCount:0};
 prompts.length=0;commits.length=0;
}
reset(1,2);
s.startSermonPartStream(1,false);
callback({responses:[{status:'complete',content:'Enough teaching. '+tagged,finishReason:'stop'}]});
assert.equal(prompts.length,1);assert.equal(commits.length,1);
// Only the final part buys the brief, separate closing.
reset(2,2);s.startSermonPartStream(2,false);
callback({responses:[{status:'complete',content:'Enough teaching. '+tagged,finishReason:'stop'}]});
assert.equal(prompts.length,2);assert.ok(prompts[1].p.includes('FINAL CLOSING ONLY'));
callback({responses:[{status:'complete',content:'One final goodbye. [pause]',finishReason:'stop'}]});
assert.equal(prompts.length,2);assert.equal(commits.length,1);
// Cutoffs cannot silently advance to the next part after exhausting retries.
s.document={getElementById:()=>null};s.escapeHtml=t=>t;
s.document.getElementById=id=>id==='generateBtn'?{}:null;
vm.runInContext(source('pauseSermonPart'),s);
reset(1,2);s.startSermonPartStream(1,false);
for(let i=0;i<3;i++)callback({responses:[{status:'complete',content:'This unfinished teaching sentence still needs more because they were',finishReason:'length'}]});
assert.equal(prompts.length,3);assert.equal(commits.length,0);assert.equal(s.sermonGenCtx.paused,true);
assert.ok(s.sermonGenCtx.partContainer.innerHTML.includes('Resume this part'));
// Interruption preserves the draft and makes no additional automatic request.
reset(1,2);s.startSermonPartStream(1,false);
callback({responses:[{status:'incomplete',content:tagged}]});
callback({responses:[{status:'error',content:tagged,statusText:'connection lost'}]});
assert.equal(prompts.length,1);assert.equal(commits.length,0);assert.equal(s.sermonGenCtx.paused,true);
assert.equal(s.sermonGenCtx.partContent,tagged);
// The stall watchdog also pauses, rather than committing an unfinished part.
vm.runInContext(source('finishCurrentSermonPart'),s);
reset(1,2);s.sermonGenCtx.partContent=tagged;s.finishCurrentSermonPart('stall');
assert.equal(commits.length,0);assert.equal(s.sermonGenCtx.paused,true);
// Paid continuation budgets shrink with the remaining content.
s.getForgeWordsPerPart=()=>2000;s.countForgeWords=t=>t.trim().split(/\s+/).length;
assert.equal(s.getForgeRemainingTokens('test','word '.repeat(1900),2),436);
assert.equal(s.getForgeRemainingTokens('test','word '.repeat(2100),2),256);
console.log('tagged endings, stop reasons, multipart closing, cutoff limits, interruptions, stalls, and remaining budgets passed');

// Provider refusals must not become more automatic paid continuation requests.
reset(1,2);s.startSermonPartStream(1,false);
callback({responses:[{status:'complete',content:tagged,finishReason:'content_filter'}]});
assert.equal(prompts.length,1);assert.equal(commits.length,0);assert.equal(s.sermonGenCtx.paused,true);
// Explicit resumption is a new bounded request, and late old callbacks are ignored.
vm.runInContext(source('resumePausedSermonPart'),s);
const oldCallback=callback;s.resumePausedSermonPart();
assert.equal(prompts.length,2);assert.equal(s.sermonGenCtx.paused,false);
oldCallback({responses:[{status:'complete',content:'STALE CONTENT',finishReason:'stop'}]});
assert.ok(!s.sermonGenCtx.partContent.includes('STALE CONTENT'));
const actualBudget=vm.runInNewContext(source('getForgeMaxContinuations')+';getForgeMaxContinuations("test",2)',{getForgeWordsPerPart:()=>2000,getModelMaxOutputTokens:()=>16384});
assert.equal(actualBudget,2);
console.log('provider refusals, explicit resume, stale callbacks, and default continuation limit passed');

// First post-fix production sample: a body sign-off must not survive before the closing.
const productionSignoff="[low, tight] I’ve given you the manual. I’ve decoded the symbols. Turn the key, Israel. This is your brother, Bet-Tsade-Lamed-Aleph-Lamed, and I’m signing off before the firewall drops... [pause]";
assert.equal(s.stripPrematureForgeClosing(body+'\n\n'+productionSignoff),body);
assert.equal(s.stripPrematureForgeClosing(body+"\n\nThis is your brother, Bet, signing off."),body);
console.log('production sign-off cleanup passed');
