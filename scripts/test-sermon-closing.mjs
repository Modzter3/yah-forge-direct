import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(match[1]);
function source(name){const start=html.indexOf('function '+name+'(');const end=html.indexOf('\nfunction ',start+1);return html.slice(start,end);}
const body='Teaching one.\n\nTeaching two.\n\nTeaching three.';
const s={selectedPartCount:1,isTheatreModeActive:()=>false,isLocalLlmChapterSermonActive:()=>false};
vm.createContext(s);
for(const name of ['looksLikeForgeClosingParagraph','stripPrematureForgeClosing','shouldStageForgeClosing','buildSermonClosingPrompt'])vm.runInContext(source(name),s);
const signoff='[low, tight] This has been Brother Bet. Peace, Israel. Yah First, last, and always. [pause]';
assert.equal(s.stripPrematureForgeClosing(body+'\n\n'+signoff+'\n\nYou think because I said peace we are done?'),body);
assert.equal(s.stripPrematureForgeClosing(body),body);
assert.equal(s.stripPrematureForgeClosing(body+'\n\n[quiet] Peace, Israel. [pause]'),body);
assert.equal(s.stripPrematureForgeClosing('Teaching about the door closing.\n\nMore teaching.'),'Teaching about the door closing.\n\nMore teaching.');
assert.equal(s.shouldStageForgeClosing(),true);
s.selectedPartCount=2;assert.equal(s.shouldStageForgeClosing(),false);s.selectedPartCount=1;
s.isLocalLlmChapterSermonActive=()=>true;assert.equal(s.shouldStageForgeClosing(),false);s.isLocalLlmChapterSermonActive=()=>false;
s.buildPartPrompt=(n,opts)=>{assert.equal(opts.allowClosing,true);return 'LENGTH MINIMUM\nRULE 6 -- CLOSING\nUse one topic-specific goodbye.\nVOICE & STYLE RULES:\nOther rules';};
const close=s.buildSermonClosingPrompt(1,body);assert.ok(close.includes('Use one topic-specific goodbye'));assert.ok(!close.includes('LENGTH MINIMUM'));assert.ok(close.includes('No new teaching'));
// Drive the actual stream completion callback: short body -> continuation -> closing -> commit.
let callback;const prompts=[];const commits=[];
Object.assign(s,{sermonGenCtx:{partContent:'',partContainer:{},continuationCount:0,yahVoiceRetryCount:0,driftRetryCount:0,explicitRetryCount:0},
getForgeStreamModel:()=> 'test',getSermonWebSearchParams:()=>({}),getModelMaxOutputTokens:()=>4000,
wrapPromptForGrokIfNeeded:p=>p,isYahStoryModeActive:()=>false,appendYahStoryApiParams:()=>{},ForgeLocalSermonProfile:null,
clearSermonWatchdogs:()=>{},armSermonWatchdogs:()=>{},finalizeSermonPartText:t=>t,marked:{parse:t=>t},
joinContinuationText:(a,b)=>a+'\n\n'+b,detectTruncation:()=>false,isForgePartUnderWordTarget:t=>!t.includes('Enough teaching'),
getForgeMaxContinuations:()=>3,theatreActComplete:()=>false,looksLikeYahStoryGuardrailRefusal:()=>false,
isRoughBezForgeActive:()=>false,forgeIsFlashTier:()=>false,isExplicitModeActive:()=>false,
SERMON_MAX_YAH_VOICE_RETRIES:1,SERMON_MAX_DRIFT_RETRIES:1,SERMON_MAX_EXPLICIT_RETRIES:1,
commitSermonPart:(n,t)=>commits.push(t),generatePart:()=>{},buildSermonContinuationPrompt:()=> 'BODY CONTINUATION ONLY',
buildPartPrompt:(n,opts)=>opts?.allowClosing?'RULE 6 -- CLOSING\nOne goodbye.\nVOICE & STYLE RULES:':'BODY ONLY'});
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
