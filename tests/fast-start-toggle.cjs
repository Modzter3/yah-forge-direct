const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('public/index.html','utf8');
// Compile all inline scripts to catch accidental syntax errors in prompt strings.
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);
// The toggle must ship unchecked: fast start is opt-in, it trades reasoning depth for speed.
const markup=html.match(/<input type="checkbox" id="toggleFastStart"[^>]*>/);
assert.ok(markup,'Fast start toggle markup missing');
assert.doesNotMatch(markup[0],/checked/,'Fast start must default to off');
assert.match(html,/id="toggleFastStartWrap"/,'Fast start toggle wrapper missing');
console.log('fast-start: toggle exists, defaults off');
const blank=()=>({checked:false,value:'off',textContent:'',style:{},classList:{add(){},remove(){}},querySelector:()=>null});
let fastStart=false;
const el=id=>{
 if(id==='toggleFastStart')return Object.assign(blank(),{checked:fastStart});
 if(id==='toggleBehindTheVeil')return Object.assign(blank(),{checked:false});
 if(id==='toggleWebResearch')return Object.assign(blank(),{checked:false});
 return blank();
};
const context=vm.createContext({
 window:{},console,
 document:{getElementById:el,querySelector:()=>null,querySelectorAll:()=>[],activeElement:null,addEventListener(){},body:{classList:{add(){},remove(){}}}},
 currentTopic:null,currentChapterSource:null,currentChapterText:'',currentNewsContext:null,currentMode:'topic',
 selectedPartCount:1,selectedStandaloneWords:4000,selectedPartChars:0,
 sermonPartsRaw:[],sermonPartsTitles:[],sermonSeriesTitle:'',currentNewsArticles:[],usedNewsHeadlines:[]
});
const src=Object.create(null);
for(const m of html.matchAll(/\nfunction ([A-Za-z0-9_$]+)\s*\(/g)){const s=m.index+1;src[m[1]]=html.slice(s,html.indexOf('\nfunction ',s+1));}
const has=n=>Object.prototype.hasOwnProperty.call(src,n);
(function load(root){const q=[root],seen=new Set();while(q.length){const n=q.shift();if(seen.has(n)||!has(n))continue;seen.add(n);vm.runInContext(src[n],context);for(const c of src[n].matchAll(/([A-Za-z_$][\w$]*)\s*\(/g))if(has(c[1]))q.push(c[1]);}})('getSermonWebSearchParams');
assert.equal(context.isForgeFastStartEnabled(),false,'helper must read the checkbox');
const model='google/gemini-3.8-flash';
const off=context.getSermonWebSearchParams(model,1);
assert.equal(off.forge_fast_start,undefined,'no fast-start flag while the toggle is off');
assert.ok(off.max_tokens>0,'max_tokens still sized normally');
fastStart=true;
assert.equal(context.isForgeFastStartEnabled(),true);
const on=context.getSermonWebSearchParams(model,1);
assert.equal(on.forge_fast_start,true,'fast-start flag must ride along when the toggle is on');
assert.equal(on.max_tokens,off.max_tokens,'fast start must not change the token budget');
assert.equal(on.web_search,off.web_search,'fast start must not touch web research');
console.log('fast-start: flag rides the forge params only when the toggle is on');
// The transcript forge carries it too.
assert.match(html,/var params=\{max_tokens:getForgeMaxTokens\(model,selectedTranscriptPartCount\)\};\nif\(isForgeFastStartEnabled\(\)\)params\.forge_fast_start=true;/,'transcript forge must honour fast start');
console.log('fast-start: transcript forge wired');