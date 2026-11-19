const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});try{
const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto(process.env.FORGE_TEST_URL||'http://localhost:8765');await page.waitForFunction(()=>typeof forgeSermonPodcast==='function'&&typeof ForgeSermonPodcast!=='undefined');
const result=await page.evaluate(()=>{
 const checks=[];function ok(v,label){if(!v)throw Error(label);checks.push(label);}
 const turns=Array.from({length:16},(_,i)=>({speaker:i%2?'B':'A',text:'Turn '+(i+1)+' stays on the written sermon and then reads a phrase that is actually in the source.'}));
 const episode={title:'Waters Above',turns};
 const handlers={},requests=[];window.Poe={registerHandler:(id,cb)=>handlers[id]=cb,sendUserMessage:(prompt,options)=>{requests.push({prompt,options});return Promise.resolve();}};
 const deliver=(request,data)=>handlers[request.options.handler]({responses:[{status:'complete',content:typeof data==='string'?data:JSON.stringify(data)}]});
 currentTopic={id:-1,title:'Firmament',desc:'A lesson on the waters above',cat:'doctrine'};
 sermonPartsRaw=['SERMON_BODY_UNIQUE'];sermonPartsCombined=sermonPartsRaw[0];sermonSeriesTitle='Waters Above the Expanse';
 currentChapterSource={book:'Genesis',chapter:1,readingLabel:'Chapter 1'};currentChapterText='SOURCE_TEXT_UNIQUE In the beginning the firmament divided the waters.';
 forgeSermonPodcast('live');
 ok(requests.length===1&&requests[0].prompt.includes('SERMON_BODY_UNIQUE')&&requests[0].prompt.includes('SOURCE_TEXT_UNIQUE'),'Podcast prompt includes the sermon and its source');
 deliver(requests[0],episode);
 ok(document.querySelectorAll('#sermonPodcastBody .podcast-turn').length===16,'Sixteen turns render');
 ok(document.querySelector('#sermonPodcastBody .podcast-title').textContent==='Waters Above','Episode title renders');
 const before=requests.length;forgeSermonPodcast('live');ok(requests.length===before,'Same sermon reuses the episode');
 forgeSermonPodcast('live',true);const bad=requests.at(-1);deliver(bad,'not a script');
 ok(document.getElementById('sermonPodcastBody').textContent.includes('Repairing'),'Broken reply asks for a repair');
 const repair=requests.at(-1);ok(repair!==bad&&repair.prompt.includes('not a usable two-host'),'Repair prompt is sent once');
 deliver(repair,episode);ok(document.querySelectorAll('#sermonPodcastBody .podcast-turn').length===16,'Repaired script renders');
 const ttsBefore=requests.length;playSermonPodcast('sermonPodcastBody');
 const tts=requests.slice(ttsBefore);
 ok(tts.length>=2&&tts[0].options.parameters.voice==='Brian'&&tts[1].options.parameters.voice==='Jessica','Two-voice playback requests Ezra then Miriam');
 ok(tts[0].prompt.includes('ElevenLabs'),'Playback uses the sermon TTS bot');
 sermonLibrary=[{id:'saved',title:'Saved lesson',desc:'Saved',combined:'SAVED_SERMON_ONLY',parts:['SAVED_SERMON_ONLY'],date:new Date().toISOString(),category:'doctrine',model:'test',wordCount:2}];
 activeLibIndex=0;forgeSermonPodcast('library');
 ok(requests.at(-1).prompt.includes('SAVED_SERMON_ONLY')&&requests.at(-1).prompt.includes('No separate source text was stored'),'Saved sermon without a source stays inside the sermon');
 return checks;
});console.log(result.join('\n'));}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
