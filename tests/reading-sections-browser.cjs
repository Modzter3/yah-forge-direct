const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844}});let aiCalls=0;
 page.on('request',r=>{if(r.url().includes('/api/ai'))aiCalls++;});
 await page.goto(process.env.FORGE_TEST_URL||'http://localhost:8765');
 await page.waitForFunction(()=>typeof updateReadingSections==='function');
 await page.click("button[onclick=\"switchTab('sealed',this)\"]");
 const index=await page.evaluate(()=>SEALED_BOOKS.findIndex(b=>b.n==='Testament of Solomon'));
 await page.selectOption('#sealedBook',String(index));
 await page.waitForFunction(()=>readingSectionStates.sealed&&readingSectionStates.sealed.set&&!readingSectionStates.sealed.loading);
 assert.equal(await page.locator('#sealedReadingStart option').count(),18);
 await page.selectOption('#sealedReadingStart','2');await page.selectOption('#sealedReadingEnd','3');
 const result=await page.evaluate(async()=>{
  openSealedSermon();
  if(!currentChapterSource.readingSelection)throw Error('Selection missing from sermon source');
  const loaded=await new Promise(resolve=>fetchSelectedChapterText(currentChapterSource,(error,text)=>resolve({error,text})));
  if(loaded.error)throw Error(loaded.error);currentChapterText=loaded.text;
  currentChapterVerseCount=countVersesInText(loaded.text);selectedPartCount=2;
  return {source:currentChapterSource,text:loaded.text,count:currentChapterVerseCount,first:getVerseRangeForPart(1,2,currentChapterVerseCount),second:getVerseRangeForPart(2,2,currentChapterVerseCount),prompt:buildPartPrompt(1)};
 });
 assert.deepEqual(result.source.readingSelection,{from:2,to:3});assert.match(result.text,/^9\. /);assert.ok(!result.text.includes('\n21. '));assert.equal(result.count,12);
 assert.deepEqual(result.first,{start:9,end:14,count:6});assert.deepEqual(result.second,{start:15,end:20,count:6});
 assert.match(result.prompt,/READING SELECTION BOUNDARY/);assert.match(result.prompt,/not the entire chapter/);assert.match(result.prompt,/Verses 9 through 14/);
 await page.evaluate(()=>closeModal());
 await page.selectOption('#sealedReadingStart','all');
 const full=await page.evaluate(()=>{const source={book:'Testament of Solomon',chapter:1,type:'sealed'};applyReadingSectionSource('sealed',source);return source;});assert.ok(!full.readingSelection);
 await page.selectOption('#sealedBook',String(await page.evaluate(()=>SEALED_BOOKS.findIndex(b=>b.n==='Gospel of Nicodemus (Acts of Pilate)'))));
 assert.equal(await page.locator('#sealedReadingWrap').evaluate(e=>e.style.display),'none');
 await page.selectOption('#sealedChapter','23');await page.waitForFunction(()=>!readingSectionStates.sealed.loading);assert.equal(await page.locator('#sealedReadingWrap').evaluate(e=>e.style.display),'none');
 await page.click("button[onclick=\"switchTab('apocrypha',this)\"]");
 const apoc=await page.evaluate(()=>APOC_BOOKS.findIndex(b=>b.n==='Book of Giants'));await page.selectOption('#apocBook',String(apoc));await page.waitForFunction(()=>readingSectionStates.apoc&&readingSectionStates.apoc.set&&!readingSectionStates.apoc.loading);assert.equal(await page.locator('#apocReadingStart option').count(),6);
 const later=await page.evaluate(async()=>{
  const result=await ForgeLocalCorpus.resolveChapterText('Pistis Sophia',4,'sealed');const set=ForgeReadingSections.create('Pistis Sophia',4,result.text);
  const chosen=ForgeReadingSections.select(set,3,4);currentChapterSource={book:set.book,chapter:4,type:'sealed',readingSelection:{from:3,to:4},readingVerseIds:chosen.verseIds};
  const count=countVersesInText(chosen.text);return {first:chosen.verseIds[0],last:chosen.verseIds.at(-1),count:count,range:getVerseRangeForPart(1,1,count)};
 });assert.ok(later.first>1000);assert.equal(later.range.start,later.first);assert.equal(later.range.end,later.last);assert.equal(later.range.count,later.count);
 assert.equal(aiCalls,0);console.log('Phone-width browser: section range → original source excerpt → correct multipart verse assignments → bounded sermon prompt; full text, normal chapters, both panels, and zero AI fetches passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
