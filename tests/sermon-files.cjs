const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 const page=await browser.newPage();page.on('pageerror',e=>console.error('PAGE',e.message));
 await page.goto((process.env.FORGE_TEST_URL||'http://localhost:8765')+'/sermon-files.js');
 await page.addScriptTag({url:'/sermon-files.js'});
 const results=await page.evaluate(async()=>{
  const F=ForgeSermonFiles,checks=[];function ok(v,msg){if(!v)throw Error(msg);checks.push(msg);}
  const text='THE EIGHTH DAY\n\nPart 1: The assembly\n[warm, steady] Gather with your household. Yah’s promise remains.\n\nPart 2: The dwelling\n[slow] Give thanks and rejoice. שָׁלוֹם';
  for(const extension of ['md','markdown','txt']){const [e]=await F.readFile(new File([text],'sermon.'+extension));ok(e.parts.length===2&&e.combined.includes('[warm, steady]'),extension+' import keeps parts and voice tags');}
  const entry=F.parseText(text,'sermon.txt')[0];
  for(const format of ['md','txt','json','docx','pdf']){
   const blob=await F.exportEntry(entry,format);const [e]=await F.readFile(new File([blob],'transfer.'+format));
   ok(e.combined.includes('Give thanks and rejoice.')&&e.combined.includes('[warm, steady]'),format+' export/import round trip');
   if(format==='json')ok(e.id===entry.id&&e.parts.length===2,'JSON preserves original ID and parts');
   if(format==='pdf'||format==='docx')ok(e.combined.includes('שָׁלוֹם'),format+' preserves Hebrew text');
  }
  ok(F.parseJson(JSON.stringify([entry]),'backup.json').length===1,'Legacy library backup imports');
  const collision={...entry,combined:'Different sermon',parts:['Different sermon']};const merged=F.mergeEntries([entry],[entry,collision]);ok(merged.added===1&&merged.entries[0].id!==merged.entries[1].id,'Duplicates skipped; conflicting IDs safely reassigned');
  for(const [name,content] of [['broken.json','{'],['empty.md',''],['wrong.exe','x']]){let rejected=false;try{await F.readFile(new File([content],name));}catch(e){rejected=true;}ok(rejected,name+' rejects invalid input');}
  const long={...entry,combined:Array(600).fill('A household gathers for the feast and gives thanks.').join('\n')};const pdf=await F.exportEntry(long,'pdf');const [again]=await F.readFile(new File([pdf],'long.pdf'));ok(again.combined.includes('A household gathers')&&again.wordCount>5000,'Multi-page PDF round trip');
  return checks;
 });console.log(results.join('\n'));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
