const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('public/index.html','utf8');let checked=0;
for(const group of ['SEALED','APOC']){
 const block=html.match(new RegExp('var '+group+'_BOOKS=\\[([\\s\\S]*?)\\n\\];'))[1];
 const books=vm.runInNewContext('['+block+']');
 for(const book of books){
  const dirs=group==='SEALED'?['sealed','apocrypha']:['apocrypha','sealed'];
  const path=dirs.map(dir=>'public/corpus/'+dir+'/'+book.n+'.json').find(f=>fs.existsSync(f));
  assert.ok(path,group+': bundled file for '+book.n);
  const data=JSON.parse(fs.readFileSync(path,'utf8'));
  const expected=Object.keys(data.chapters).filter(k=>/^\d+$/.test(k)&&String(data.chapters[k]).trim()).map(Number).sort((a,b)=>a-b);
  const options=book.chapterIds?Array.from(book.chapterIds):Array.from({length:book.c},(_,i)=>i+1);
  assert.deepEqual(options,expected,group+': selector matches '+book.n);
  assert.equal(book.c,Math.max(...expected));checked++;
 }
}
console.log(checked+' sealed/apocrypha selectors match actual nonempty corpus chapter numbers, including gaps and introductions');
