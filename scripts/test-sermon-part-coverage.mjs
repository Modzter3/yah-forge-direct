import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const sandbox={};vm.createContext(sandbox);
for(const name of ['buildForgeCoverageLedger','buildForgePartAdvanceBlock']){
 const start=html.indexOf('function '+name+'(');const end=html.indexOf('\nfunction ',start+1);
 vm.runInContext(html.slice(start,end),sandbox);
}
const first='# Part 1: Foundation\n\nELOHIM AND THE ROYAL WE\n\n[low, tight] Genesis chapter one verse twenty-six supplies the opening question about plural language. The royal we is the primary argument established here. [pause]\n\n'+Array.from({length:30},(_,i)=>'Middle teaching '+i+' develops distinct supporting details and examples for this same topic without forgetting the material before it. More supporting discussion follows.').join('\n\n')+'\n\n[quiet, steady] The closing example uses a CPU and monitor to explain the interface analogy. That technical connection is already established and must not be taught again. [pause]';
let ledger=sandbox.buildForgeCoverageLedger(2,[first]);
assert.ok(ledger.includes('Genesis chapter one verse twenty-six'));
assert.ok(ledger.includes('ELOHIM AND THE ROYAL WE'));
assert.ok(ledger.includes('CPU and monitor'));
assert.ok(!ledger.includes('[pause]'));assert.ok(!ledger.includes('[low, tight]'));
assert.equal(sandbox.buildForgeCoverageLedger(1,[first]),'');
assert.ok(!sandbox.buildForgeCoverageLedger(2,[first,'FUTURE PART']).includes('FUTURE PART'));
const firstRule=sandbox.buildForgePartAdvanceBlock(1,3,[]);
assert.ok(firstRule.includes('reserve unresolved objections'));assert.ok(firstRule.includes('Israelite technical-manual'));assert.ok(firstRule.includes('Bez keeps its street-oriented'));
const middle=sandbox.buildForgePartAdvanceBlock(2,3,[first]);
assert.ok(middle.includes('NEW question'));assert.ok(middle.includes('one sentence of context'));assert.ok(middle.includes('teach Y, not X again'));
assert.ok(middle.includes('A new metaphor carrying the same old conclusion is still repetition'));
const final=sandbox.buildForgePartAdvanceBlock(3,3,[first,first]);assert.ok(final.includes('NEW conclusions from established premises'));
const slice=sandbox.buildForgePartAdvanceBlock(2,3,[first],{assignedSlice:true});assert.ok(slice.includes('never moves material outside that slice'));assert.ok(!slice.includes('This middle part owns'));
assert.equal(sandbox.buildForgePartAdvanceBlock(1,1,[]),'');
const longLedger=sandbox.buildForgeCoverageLedger(8,Array(7).fill(first));assert.ok(longLedger.length<12000);assert.ok(longLedger.includes('PART 1 covered'));assert.ok(longLedger.includes('PART 7 covered'));
// Ensure these rules are used in the shipped generator, rather than just defined.
const start=html.indexOf('function buildPartPrompt(');const end=html.indexOf('\nfunction ',start+1);const generator=html.slice(start,end);
assert.ok(generator.includes('buildForgeCoverageLedger(partNum,sermonPartsRaw)'));
assert.ok(generator.includes('buildForgePartAdvanceBlock(partNum,totalParts,[]'));
assert.ok(!generator.includes('trimPartContextTail(prevBody'));
for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(match[1]);
console.log('sermon-part-coverage: beginning/end inventory, no future leakage, part roles, context exception, voice preservation, assigned slices, and bounded context passed');
