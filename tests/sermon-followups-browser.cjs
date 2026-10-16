const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});try{
const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto(process.env.FORGE_TEST_URL||'http://localhost:8765');await page.waitForFunction(()=>typeof requestSermonFollowups==='function');
const result=await page.evaluate(()=>{
 const checks=[];function ok(v,label){if(!v)throw Error(label);checks.push(label);}
 const rows=Array.from({length:5},(_,i)=>({title:'Follow-up '+i,avenue:'Source comparison',question:'How does passage '+i+' relate to the promise?',why:'Explore a new question.',focus:['Compare the primary texts.','Examine their chronology.','Explain any unresolved difference.'],references:['Genesis 1'],priorCoverage:['A previous interpretation was proposed.']}));
 const handlers={},requests=[];window.Poe={registerHandler:(id,cb)=>handlers[id]=cb,sendUserMessage:(prompt,options)=>{requests.push({prompt,options});return Promise.resolve();}};
 const deliver=(request,data=rows)=>handlers[request.options.handler]({responses:[{status:'complete',content:JSON.stringify(data)}]});
 currentTopic={id:-1,title:'Original timeline lesson',desc:'A specific subject',cat:'doctrine'};openModal();sermonPartsRaw=['UNIQUE COMPLETED SERMON DETAIL'];sermonPartsCombined=sermonPartsRaw[0];sermonSavedThisSession=true;
 fetchHiddenThreads();ok(requests.length===1&&requests[0].prompt.includes('UNIQUE COMPLETED SERMON DETAIL'),'Finished-sermon planning sends actual content once');fetchHiddenThreads();ok(requests.length===1,'Repeated click during planning does not duplicate a request');deliver(requests[0]);
 ok(document.querySelectorAll('#hiddenThreadsBody .ht-card').length===5,'Five follow-up avenues displayed');
 chooseSermonFollowup('hiddenThreadsBody',2);const brief=document.getElementById('customTopicInput').value;
 ok(brief.includes('Subject: How does passage 2')&&brief.includes('Compare the primary texts.')&&brief.includes('NEW point'),'Picking avenue fills a detailed topic brief');
 ok(requests.length===1,'Choosing avenue makes no generation request');forgeCustomTopic();
 ok(currentTopic.title==='Follow-up 2'&&currentTopic.customBrief===brief&&!currentTopic.isBriefing,'Forge opens selected follow-up as a sermon, not an article');
 ok(requests.length===1,'Opening sermon configuration makes no generation request');
 document.getElementById('customTopicInput').value=brief+'\nAdditional focus: compare the source wording.';forgeCustomTopic();ok(!currentTopic.isBriefing&&currentTopic.customBrief.includes('Additional focus:'),'Edited study brief remains a sermon topic');
 closeModal();requestSermonFollowups({title:'Old source',combined:'Old sermon'},'hiddenThreadsBody');const old=requests.at(-1);
 requestSermonFollowups({title:'New source',combined:'New sermon'},'hiddenThreadsBody');const fresh=requests.at(-1);deliver(old);
 ok(sermonFollowupViews.hiddenThreadsBody.loading,'Stale source response ignored');deliver(fresh);
 const before=requests.length;requestSermonFollowups({title:'New source',combined:'New sermon'},'hiddenThreadsBody');ok(requests.length===before,'Existing choices reused without another request');
 refreshSermonFollowups('hiddenThreadsBody');const bad=requests.at(-1);deliver(bad,{});ok(document.getElementById('hiddenThreadsBody').textContent.includes('Try Again'),'Malformed model response offers retry');
 sermonLibrary=[{id:'saved',title:'Saved source',desc:'Saved description',combined:'SAVED SERMON DETAIL',parts:['SAVED SERMON DETAIL'],date:new Date().toISOString(),category:'doctrine',model:'test',wordCount:3}];openLibraryEntry(0);showLibraryFollowups();const saved=requests.at(-1);ok(saved.prompt.includes('SAVED SERMON DETAIL'),'Saved sermon supports follow-up planning');deliver(saved);chooseSermonFollowup('libraryFollowupsBody',1);
 ok(document.getElementById('customTopicInput').value.includes('Follow-up to: Saved source'),'Library choice stages correct source topic');
 return checks;
});console.log(result.join('\n'));}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
