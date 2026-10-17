const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});try{
const page=await browser.newPage();page.setDefaultTimeout(10000);const requests=[];let nanoFail=false;
const catalog=id=>({data:[{id,name:id,context_length:131072,pricing:{prompt:'0.000001',completion:'0.000002'}}]});
await page.route('https://openrouter.ai/api/v1/models',r=>r.fulfill({json:catalog('google/gemini-3-flash-preview')}));
await page.route('**/api/nanogpt-models',r=>nanoFail?r.fulfill({status:503,json:{error:'Test catalog offline'}}):r.fulfill({json:catalog('nano-test/model')}));
await page.route('**/api/ai',async r=>{requests.push(r.request().postDataJSON());await r.fulfill({contentType:'text/event-stream',body:'data: '+JSON.stringify({choices:[{delta:{content:'Test answer.'},finish_reason:null}]})+'\n\ndata: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n'});});
await page.goto(process.env.FORGE_TEST_URL||'http://localhost:8765');await page.waitForFunction(()=>typeof sendYahChat==='function');
await page.click("button[onclick=\"switchTab('yahchat',this)\"]");await page.selectOption('#yahChatProvider','nanogpt');await page.waitForFunction(()=>document.getElementById('yahChatModel').value==='nano-test/model');
assert.equal(await page.locator('#forgeLlmProvider').inputValue(),'nanogpt');assert.match(await page.locator('#yahChatCustomModelLabel').textContent(),/NanoGPT/);
await page.fill('#yahChatInput','Explain the passage.');await page.evaluate(()=>sendYahChat());await page.waitForFunction(()=>!yahChatBusy);
assert.equal(requests[0].provider,'nanogpt');assert.equal(requests[0].bot,'nano-test/model');
await page.fill('#customYahChatModel','custom/nano-model');await page.evaluate(()=>retryYahChatLastReply());await page.waitForFunction(()=>!yahChatBusy);assert.equal(requests.at(-1).bot,'custom/nano-model');assert.equal(requests.at(-1).provider,'nanogpt');
await page.reload();await page.click("button[onclick=\"switchTab('yahchat',this)\"]");await page.waitForFunction(()=>document.getElementById('yahChatModel').value==='nano-test/model');assert.equal(await page.locator('#yahChatProvider').inputValue(),'nanogpt');
await page.evaluate(()=>setForgeLlmProvider('openrouter'));await page.waitForFunction(()=>document.getElementById('yahChatModel').value==='google/gemini-3-flash-preview');assert.equal(await page.locator('#yahChatProvider').inputValue(),'openrouter');assert.equal(await page.locator('#customYahChatModel').inputValue(),'');
nanoFail=true;await page.evaluate(()=>setForgeLlmProvider('nanogpt'));await page.waitForFunction(()=>document.getElementById('yahChatModel').textContent.includes('unavailable'));
await page.fill('#yahChatInput','Keep this unsent question.');const before=requests.length;await page.evaluate(()=>sendYahChat());assert.equal(requests.length,before);assert.equal(await page.locator('#yahChatInput').inputValue(),'Keep this unsent question.');
console.log('Yah Chat: NanoGPT catalog, provider sync/persistence, send/retry API payloads, custom model, OpenRouter switch, and unavailable-catalog guard passed; no live model requests');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
