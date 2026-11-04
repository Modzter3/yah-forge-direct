const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('public/index.html','utf8');
// Compile all inline scripts (syntax guard for the page).
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);
// The proxy must not reject these providers any more -- it runs them without retrieval.
const proxy=fs.readFileSync('api/ai.js','utf8');
assert.doesNotMatch(proxy,/web search is not configured in this integration/,'proxy must stop 400-ing on web_search');
assert.match(proxy,/NO_WEB_SEARCH_PROVIDERS\.has\(providerName\)\) \{ delete params\.web_search; delete params\.plugins; \}/,'proxy must strip the web flags for these providers');
console.log('web-search-gate: proxy strips instead of rejecting');
// No flow may ask a non-OpenRouter provider for web search any more.
const lines=html.split('\n');
const offenders=lines.filter(l=>/web_search:true/.test(l)&&!/forgeCanWebSearch/.test(l)&&!/newsScanLive/.test(l));
assert.equal(offenders.length,0,'unconditional web_search request left behind: '+String(offenders[0]).slice(0,160));
const sends=[];
lines.forEach((l,i)=>{if(/params\.web_search=true;/.test(l))sends.push({i:i,ctx:l+' '+(lines[i-1]||'')+' '+(lines[i-2]||'')});});
assert.ok(sends.length>=5,'expected the known send sites, found '+sends.length);
const ungated=sends.filter(s=>!/forgeCanWebSearch|newsScanLive/.test(s.ctx));
assert.equal(ungated.length,0,'ungated params.web_search send on line '+((ungated[0]||{}).i+1)+': '+String((ungated[0]||{}).ctx).slice(0,200));
console.log('web-search-gate: every web_search send is behind forgeCanWebSearch');
// Helper behaviour across providers and models.
const blank=()=>({checked:false,value:'off',textContent:'',style:{},classList:{add(){},remove(){}},querySelector:()=>null});
let provider='openrouter';
const context=vm.createContext({
 window:{},console,
 document:{getElementById:()=>blank(),querySelector:()=>null,querySelectorAll:()=>[]},
 getForgeLlmProvider:()=>provider,
});
const src={};
for(const m of html.matchAll(/\nfunction ([A-Za-z0-9_$]+)\s*\(/g)){const s=m.index+1;src[m[1]]=html.slice(s,html.indexOf('\nfunction ',s+1));}
for(const name of ['forgeModelLower','forgeIsGemini','forgeIsClaude','forgeIsOpenAI','forgeIsKie','forgeSupportsWebBrowse','forgeProviderSupportsWebSearch','forgeCanWebSearch','forgeProviderLabel']){
 vm.runInContext(src[name],context);
}
assert.equal(context.forgeCanWebSearch('google/gemini-3.8-flash'),true,'OpenRouter + Gemini can search');
assert.equal(context.forgeCanWebSearch('anthropic/claude-sonnet-5.5'),true,'OpenRouter + Claude can search');
assert.equal(context.forgeCanWebSearch('openai/gpt-5.6-sol'),true,'OpenRouter + OpenAI can search');
assert.equal(context.forgeCanWebSearch('z-ai/glm-5.3-flash-uncensored'),false,'non-browsing model cannot search');
for(const p of ['nanogpt','opencode_go','clinepass','refuseless','local']){
 provider=p;
 assert.equal(context.forgeProviderSupportsWebSearch(),false,p+' has no web plugin here');
 assert.equal(context.forgeCanWebSearch('anthropic/claude-sonnet-5.5'),false,p+' must never be asked to browse');
 assert.ok(context.forgeProviderLabel().length>0,p+' needs a label for the notice');
}
provider='openrouter';
assert.equal(context.forgeCanWebSearch('anthropic/claude-sonnet-5.5'),true,'back on OpenRouter the gate reopens');
console.log('web-search-gate: gate opens only for OpenRouter + a browsing model');
// The user is told what happened instead of hitting a dead end.
assert.match(html,/No live retrieval\./,'results need a no-retrieval banner');
assert.match(html,/onclick="setForgeLlmProvider\([\\']*openrouter[\\']*\)"/,'the notice needs a one-click switch to OpenRouter');
assert.match(fs.readFileSync('public/openrouter-models.js','utf8'),/catch\(function \(err\) \{\n        console\.warn\('\[openrouter-models\]'[\s\S]{0,200}updateNewsSearchNote/,'the notice must refresh even when the catalog fails');
console.log('web-search-gate: banner, switch button, and note refresh on catalog failure');