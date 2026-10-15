const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('public/index.html','utf8');
const storage=new Map();let modelCalls=0;
const ctx=vm.createContext({console,Promise,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},fetch:async url=>{try{const data=JSON.parse(fs.readFileSync('public'+decodeURIComponent(url),'utf8'));return {ok:true,json:async()=>data};}catch{return {ok:false,status:404}}},isLocalCorpusBook:(book,type)=>type==='bible'||ctx.ForgeLocalCorpus.hasImportedBook(book),fetchChapterTextFromModel:()=>{modelCalls++}});
vm.runInContext(fs.readFileSync('public/apoc-local-corpus.js','utf8'),ctx);ctx.window=ctx;
const start=html.indexOf('function fetchChapterText(book,chapter,type,callback){');const end=html.indexOf('\nfunction ',start+1);vm.runInContext(html.slice(start,end),ctx);
const load=(book,chapter,type)=>new Promise(resolve=>ctx.fetchChapterText(book,chapter,type,(error,text,source)=>resolve({error,text,source})));
(async()=>{
 const book='Gospel of Nicodemus (Acts of Pilate)';
 const local=await load(book,23,'sealed');assert.ok(local.text);assert.match(local.source,/corpus/);assert.equal(modelCalls,0);console.log('Nicodemus 23 loads bundled text without model');
 const missing=await load(book,27,'sealed');assert.match(missing.error,/Local corpus chapter unavailable/);assert.equal(modelCalls,0);console.log('Nicodemus 27 reports missing local chapter without model');
 assert.ok(!html.includes('{n:"'+book+'",c:27'));assert.ok(html.includes('{n:"'+book+'",c:23'));console.log('Nicodemus picker matches 23-chapter source');
 ctx.ForgeLocalCorpus.importBookJson({book:'Imported Book',chapters:{1:'1. Local verse.'}});
 const imported=await load('Imported Book',1,'sealed');assert.equal(imported.text,'1. Local verse.');assert.equal(modelCalls,0);
 const importedMissing=await load('Imported Book',2,'sealed');assert.ok(importedMissing.error);assert.equal(modelCalls,0);console.log('Imported corpus and missing imported chapter never call model');
 ctx.ForgeLocalCorpus.resolveChapterText=()=>Promise.reject(Error('File unavailable'));
 assert.ok((await load(book,1,'sealed')).error);assert.equal(modelCalls,0);console.log('Local loading errors never silently call model');
})().catch(e=>{console.error(e);process.exit(1)});
