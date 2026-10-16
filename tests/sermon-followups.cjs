const assert=require('node:assert/strict');require('../public/sermon-followups.js');const F=global.ForgeSermonFollowups;
const rows=Array.from({length:5},(_,i)=>({title:'Lesson '+i,avenue:'Textual inquiry',question:'What does passage '+i+' establish?',why:'Investigate the unresolved issue.',focus:['Read the passage in context.','Compare the two interpretations.','Explain what remains uncertain.'],references:['A source to verify'],priorCoverage:['The previous lesson proposed a chronology.']}));
const items=F.normalize('```json\n'+JSON.stringify(rows)+'\n```');assert.equal(items.length,5);
assert.throws(()=>F.normalize(JSON.stringify([rows[0],rows[0],rows[0]])));assert.throws(()=>F.normalize('{}'));
const source={title:'Timeline study',combined:'UNIQUE DETAIL FROM THE COMPLETED SERMON',desc:'A chronology study'};
const prompt=F.buildPrompt(source);assert.match(prompt,/UNIQUE DETAIL FROM THE COMPLETED SERMON/);assert.match(prompt,/unestablished claims as questions/);
const brief=F.buildBrief(items[0],source);for(const word of ['Subject:','Read the passage in context.','Starting passages','previous lesson','NEW point','voice, tone, and delivery options'])assert.ok(brief.includes(word),word);
assert.match(F.buildPrompt({...source,combined:'a'.repeat(100000)+'END_SENTINEL'}),/END_SENTINEL/);
console.log('Follow-up JSON validation, distinct choices, completed-sermon context, research brief, and long-sermon tail coverage passed');
