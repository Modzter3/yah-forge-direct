const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('public/index.html','utf8');
// Compile all inline scripts (syntax guard for the page).
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);
// Markup: the News tab owns a provider picker with every catalog provider.
const sel=html.match(/<select class="model-select" id="newsProvider"[^>]*>([\s\S]*?)<\/select>/);
assert.ok(sel,'News tab provider select missing');
assert.match(sel[0],/onchange="setForgeLlmProvider\(this\.value\)"/,'News provider must drive the shared provider');
for(const provider of ['openrouter','nanogpt','opencode_go','clinepass','refuseless','local']){
 assert.ok(sel[1].includes('value="'+provider+'"'),'News provider select missing option: '+provider);
}
assert.match(html,/id="newsCustomModelLabel"/,'News custom-model label needs an id so it can be relabelled per provider');
assert.match(html,/id="newsModel"[\s\S]{0,200}onchange="onNewsModelDropdown\(\)"/,'News model select untouched');
console.log('news-provider: picker exists with all six providers and drives the shared provider');
// Functional: the provider sync keeps the News picker, label, placeholder and catalog in step.
function makeSandbox(){
 const elements={};
 const get=id=>{
  if(!elements[id])elements[id]={id:id,value:'',textContent:'',placeholder:'',innerHTML:'',tagName:'SELECT',style:{},classList:{add(){},remove(){},contains:()=>false},appendChild(){},parentElement:{style:{}},addEventListener(){},querySelector:()=>null,querySelectorAll:()=>[]};
  return elements[id];
 };
 const storage=new Map();
 const sandbox={
  console,
  document:{getElementById:get,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},readyState:'complete',createElement:()=>({style:{},classList:{add(){},remove(){}},appendChild(){}})},
  localStorage:{getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
  setInterval:()=>0,clearInterval(){},setTimeout:(fn)=>0,clearTimeout(){},
  fetch:async()=>({json:async()=>({ok:true}),status:200}),
  catalogs:0,
 };
 sandbox.hydrateForgeModelSelects=()=>{sandbox.catalogs++;return Promise.resolve();};
 sandbox.window=sandbox;
 sandbox.globalThis=sandbox;
 vm.runInNewContext(fs.readFileSync('public/forge-llm-provider.js','utf8'),sandbox);
 return {sandbox,get};
}
const fresh=makeSandbox();
assert.equal(fresh.get('newsProvider').value,'openrouter','News picker must start on the saved provider');
assert.equal(fresh.get('newsCustomModelLabel').textContent,'Custom OpenRouter ID:','label starts on OpenRouter');
const live=makeSandbox();
live.get('customNewsModel').value='stale/model';
live.sandbox.setForgeLlmProvider('nanogpt');
assert.equal(live.get('newsProvider').value,'nanogpt','News picker must follow the shared provider');
assert.match(live.get('newsCustomModelLabel').textContent,/Custom NanoGPT model ID/,'News custom label must follow the provider');
assert.notEqual(live.get('customNewsModel').placeholder,'','placeholder must be set per provider');
assert.equal(live.get('customNewsModel').value,'','switching provider clears the stale custom model id');
assert.ok(live.sandbox.catalogs>0,'switching provider must refill the model catalogs');
const sandbox=live.sandbox;
const get=live.get;
console.log('news-provider: picker, label, placeholder and catalog follow the shared provider');
// OpenCode Go / Refuseless round-trip.
sandbox.setForgeLlmProvider('refuseless');
assert.equal(get('newsProvider').value,'refuseless');
assert.match(get('newsCustomModelLabel').textContent,/Refuseless/);
sandbox.setForgeLlmProvider('opencode_go');
assert.equal(get('newsProvider').value,'opencode_go');
assert.match(get('newsCustomModelLabel').textContent,/OpenCode Go/);
console.log('news-provider: Refuseless and OpenCode Go round-trip');