import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
function source(name){const start=html.indexOf('function '+name+'(');const end=html.indexOf('\nfunction ',start+1);return html.slice(start,end);}
const s={};
vm.createContext(s);
vm.runInContext(source('buildChapterSourceTheologyGateBlock'),s);
const custom=s.buildChapterSourceTheologyGateBlock({book:'Pink',chapter:1,type:'custom'});
assert.ok(custom.includes('THEOLOGY GATE'));
assert.ok(custom.includes('FALSE DOCTRINE'));
assert.ok(/cross-examin/i.test(custom));
const apoc=s.buildChapterSourceTheologyGateBlock({book:'Tobit',chapter:1,type:'apocrypha'});
assert.ok(/Torah/i.test(apoc));
assert.equal(s.buildChapterSourceTheologyGateBlock({book:'Enoch',chapter:1,type:'sealed'}),'');
console.log('book-forge-theology-gate: custom/apocrypha blocks and sealed skip passed');
