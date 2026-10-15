const assert=require('node:assert/strict'),fs=require('node:fs');
require('../public/reading-sections.js');const R=global.ForgeReadingSections;
let checked=0;
for(const file of fs.readdirSync('public/corpus/sealed').filter(f=>f.endsWith('.json')&&f!=='manifest.json')){
 const book=JSON.parse(fs.readFileSync('public/corpus/sealed/'+file,'utf8'));
 for(const [chapter,text] of Object.entries(book.chapters)){
  const set=R.create(book.book,chapter,text);if(!set)continue;
  assert.equal(set.sections.map(s=>text.slice(s.start,s.end)).join(''),text,'Every character preserved: '+book.book+' '+chapter);
  for(const section of set.sections){
   const selected=R.select(set,section.number,section.number);
   assert.equal(selected.text,text.slice(section.start,section.end).trim());
   assert.equal(selected.verseIds[0],section.firstVerse);
   assert.equal(selected.verseIds.at(-1),section.lastVerse);
   assert.match(R.label(set,section),/^Reading Section /);
  }
  assert.equal(R.select(set,1,set.sections.length).text,text.trim());
  assert.throws(()=>R.select(set,2,1));assert.throws(()=>R.select(set,0,1));assert.throws(()=>R.select(set,1,999));checked++;
 }
}
const text=JSON.parse(fs.readFileSync('public/corpus/sealed/Testament of Solomon.json','utf8')).chapters[1];
const set=R.create('Testament of Solomon',1,text);const selected=R.select(set,2,3);
assert.equal(selected.verseIds[0],9);assert.equal(selected.verseIds.at(-1),20);
assert.match(selected.text,/^9\. /);assert.ok(!selected.text.includes('\n21. '));
assert.equal(R.create('Genesis',1,'1. Short chapter.'),null);
console.log(checked+' chapter/continuous-text section sets preserve every character and original reference; section ranges and invalid inputs verified');
