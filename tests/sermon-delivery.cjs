const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 const page=await browser.newPage();
 await page.goto(process.env.FORGE_TEST_URL||'http://localhost:8765');
 await page.waitForFunction(()=>typeof buildSermonClosingPrompt==='function');
 const results=await page.evaluate(()=>{
  const checks=[];function ok(value,label){if(!value)throw Error(label);checks.push(label);}
  const toggle=document.getElementById('toggleElevenLabsTags');
  const draft='The household assembles.\n\n[low, warm] Give thanks for preservation. [pause]\n\n[quiet, steady] Honor the day. [pause]';
  // Isolate the closing policy from topic assignment setup.
  buildPartPrompt=()=> 'RULE 6 -- CLOSING: End warmly.\nVOICE & STYLE RULES:';
  toggle.checked=false;
  ok(buildSermonClosingPrompt(1,draft).includes('Eleven Tags is OFF'),'Closing explicitly disables tags');
  ok(buildSermonContinuationPrompt(1,draft,{finishThoughtOnly:true}).includes('Eleven Tags is OFF'),'Finishing request explicitly disables tags');
  ok(!stripDisabledElevenDeliveryTags(draft).includes('[pause]')&&!stripDisabledElevenDeliveryTags(draft).includes('[low, warm]'),'Off removes cues from final two paragraphs');
  const reported='Teaching ends here.\n\n(stern, authoritative) Stop looking at the bars. [pause]\n\n(sharp, prophetic) Step into the light. [pause]';
  ok(stripDisabledElevenDeliveryTags(reported)==='Teaching ends here.\n\nStop looking at the bars.\n\nStep into the light.','Reported closing loses parentheses and pauses');
  ok(stripDisabledElevenDeliveryTags('(Hebrews 10:1–14) Read the passage.\n\n(In this chapter) Joseph answers.\n\n(warm bread) Share food.')==='(Hebrews 10:1–14) Read the passage.\n\n(In this chapter) Joseph answers.\n\n(warm bread) Share food.','Ordinary parentheses survive');
  ok(buildSermonClosingPrompt(1,reported).endsWith(buildSermonDeliveryPolicy()),'Closing ends with toggle policy overriding draft cues');
  const references='Read [Leviticus 23:36], [Hebrews 10:1–14], [citation], and [warm fellowship](https://example.com).';
  ok(stripDisabledElevenDeliveryTags(references)===references,'Scripture citations and Markdown links survive');
  currentTopic=null;sermonPartsRaw=[];selectedPartCount=1;
  document.getElementById('togglePureTheatre').checked=false;
  ok(!finalizeSermonPartText(draft,1).includes('[pause]'),'Finalized off output is untagged');
  ok(!finalizeSermonPartText(reported,1).includes('(stern'),'Reported closing is clean in finalized output');
  toggle.checked=true;
  ok(buildSermonClosingPrompt(1,draft).includes('Eleven Tags is ON'),'Closing enables tags when selected');
  ok(finalizeSermonPartText(draft,1).includes('[low, warm]'),'Finalized on output retains tags');
  return checks;
 });console.log(results.join('\n'));await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
