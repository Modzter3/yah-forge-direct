import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
function source(name){const start=html.indexOf('function '+name+'(');const end=html.indexOf('\nfunction ',start+1);return html.slice(start,end);}
function sourceMany(names){
let block='';
for(const name of names){block+=source(name)+'\n';}
return block;
}
const s={};
vm.createContext(s);
vm.runInContext(source('buildChapterSourceTheologyGateBlock'),s);
const custom=s.buildChapterSourceTheologyGateBlock({book:'Pink',chapter:1,type:'custom'});
assert.ok(custom.includes('THEOLOGY GATE'));
assert.ok(custom.includes('FALSE DOCTRINE'));
assert.ok(/Author claim:/i.test(custom));
assert.ok(/rubric labels/i.test(custom));
const apoc=s.buildChapterSourceTheologyGateBlock({book:'Tobit',chapter:1,type:'apocrypha'});
assert.ok(/Torah/i.test(apoc));
assert.equal(s.buildChapterSourceTheologyGateBlock({book:'Enoch',chapter:1,type:'sealed'}),'');
vm.runInContext(sourceMany(['topicSourceHaystack','looksLikeOutsideTheologyBook','buildOutsideTheologyBookCrossExamBlock']),s);
const pinkTopic={title:'The Sovereignty of God',briefingText:'PART 1. Pink opens with Revelation chapter four. For thy pleasure they are and were created. '.repeat(40)};
assert.ok(s.looksLikeOutsideTheologyBook(pinkTopic));
const newsTopic={title:'Heat wave',briefingText:'Officials said temperatures may hit 110 according to the bureau forecast. '.repeat(8)};
assert.ok(!s.looksLikeOutsideTheologyBook(newsTopic));
const cross=s.buildOutsideTheologyBookCrossExamBlock(pinkTopic);
assert.ok(/STORY FORGE/i.test(cross));
assert.ok(/Author claim:/i.test(cross));
assert.ok(/rubric labels/i.test(cross));
console.log('book-forge-theology-gate: custom/apocrypha blocks, sealed skip, outside-theology story forge passed');
