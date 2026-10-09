import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/ai-polyfill.js',import.meta.url),'utf8');
async function run(events,{stream=true,breakStream=false}={}){
 const results=[];
 const encoder=new TextEncoder();
 const body=new ReadableStream({start(controller){
  for(const event of events)controller.enqueue(encoder.encode('data: '+(typeof event==='string'?event:JSON.stringify(event))+'\n\n'));
  // Enqueue first, then fail on the next read so partial text reaches the handler.
  if(breakStream){this.fail=true;}else controller.close();
 },pull(controller){if(this.fail)controller.error(new Error('connection lost'));}});
 const sandbox={window:{},fetch:async()=>new Response(body),Date,Math,JSON,TextDecoder};
 vm.runInNewContext(source,sandbox);
 sandbox.window.Poe.registerHandler('test',r=>results.push(r.responses[0]));
 await sandbox.window.Poe.sendUserMessage('@test prompt',{handler:'test',stream});
 return results;
}
const delta={choices:[{delta:{content:'A complete paragraph. [pause]'},finish_reason:null}]};
const done=reason=>({choices:[{delta:{},finish_reason:reason}]});
for(const reason of ['stop','length','content_filter']){
 const results=await run([delta,done(reason)]);
 assert.equal(results.at(-1).status,'complete');assert.equal(results.at(-1).finishReason,reason);
 assert.equal(results.at(-1).content,'A complete paragraph. [pause]');
}
let results=await run([delta,'[DONE]']);assert.equal(results.at(-1).status,'complete');
results=await run([delta]);assert.equal(results.at(-1).status,'error');assert.match(results.at(-1).statusText,/completion signal/);
results=await run([delta,{error:{message:'provider failed'}}]);assert.equal(results.at(-1).status,'error');assert.equal(results.at(-1).content,delta.choices[0].delta.content);
results=await run([delta],{breakStream:true});assert.equal(results.at(-1).status,'error');assert.equal(results.at(-1).content,delta.choices[0].delta.content);
results=await run([delta,done('length'),'[DONE]'],{stream:false});assert.equal(results.at(-1).finishReason,'length');
console.log('ai-stream-completion: provider stop reasons, DONE, missing completion, partial errors, and connection failures passed');
