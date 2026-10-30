import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/ai-polyfill.js',import.meta.url),'utf8');
async function run(events,{stream=true,breakStream=false,onReasoning}={}){
 const results=[];
 const encoder=new TextEncoder();
 const body=new ReadableStream({start(controller){
  for(const event of events)controller.enqueue(encoder.encode('data: '+(typeof event==='string'?event:JSON.stringify(event))+'\n\n'));
  // Enqueue first, then fail on the next read so partial text reaches the handler.
  if(breakStream){this.fail=true;}else controller.close();
 },pull(controller){if(this.fail)controller.error(new Error('connection lost'));}});
 const sandbox={window:{},fetch:async()=>new Response(body),Date,Math,JSON,TextDecoder};
 vm.runInNewContext(source,sandbox);
 if(onReasoning)sandbox.window.onForgeReasoningProgress=onReasoning;
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
// Reasoning deltas must never enter the draft, but must report thinking progress.
const think=[];
results=await run([
 {choices:[{delta:{reasoning:'weighing the verse '},finish_reason:null}]},
 {choices:[{delta:{reasoning_details:[{type:'reasoning.text',text:'and the symbol'}]},finish_reason:null}]},
 delta,done('stop'),'[DONE]',
],{onReasoning:info=>think.push(info)});
assert.equal(results.at(-1).content,delta.choices[0].delta.content,'reasoning must not leak into the draft');
assert.equal(think.length,2,'each reasoning delta reports progress');
assert.equal(think.at(-1).chars,'weighing the verse and the symbol'.length);
assert.equal(think[0].first,true,'first reasoning delta is flagged');
console.log('ai-stream-completion: reasoning deltas reported as progress without polluting output');
// The client tells the proxy whether the selected model accepts reasoning params.
{
 let body=null;
 const sandbox={window:{forgeModelSupportsReasoning:m=>m==='reasoner/model'},fetch:async(_,init)=>{body=JSON.parse(init.body);return new Response('data: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});},Date,Math,JSON,TextDecoder};
 vm.runInNewContext(source,sandbox);
 sandbox.window.Poe.registerHandler('cap',()=>{});
 await sandbox.window.Poe.sendUserMessage('@reasoner/model hi',{handler:'cap',stream:true});
 assert.equal(body.parameters.forge_supports_reasoning,true,'reasoning-capable model must be flagged');
 await sandbox.window.Poe.sendUserMessage('@plain/model hi',{handler:'cap',stream:true});
 assert.equal(body.parameters.forge_supports_reasoning,false,'non-reasoning model must be flagged false');
 console.log('ai-stream-completion: model reasoning capability flagged to the proxy');
}
console.log('ai-stream-completion: provider stop reasons, DONE, missing completion, partial errors, and connection failures passed');
