import assert from 'node:assert/strict';
import handler from '../api/ai.js';
// All provider requests are intercepted; these checks make no paid API calls.
process.env.AI_API_KEY='test-only';
process.env.AI_PROVIDER='openrouter';
const originalFetch=globalThis.fetch;
try {
 let receivedSignal;
 globalThis.fetch=async(_url,init)=>{receivedSignal=init.signal;return Response.json({choices:[{message:{content:'An unfinished thought'},finish_reason:'length'}]});};
 const request=new Request('http://local/api/ai',{method:'POST',body:JSON.stringify({query:'test',bot:'openai/gpt-4.1'})});
 const response=await handler(request.clone());
 assert.equal(response.status,200);
 assert.match(await response.text(),/"finish_reason":"length"/);
 assert.equal(receivedSignal.aborted,false);
 let cancelled=false;
 globalThis.fetch=async()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"test"}}]}\n\n'));},cancel(){cancelled=true;}}),{headers:{'content-type':'text/event-stream'}});
 const streaming=await handler(request);
 const reader=streaming.body.getReader();
 await reader.read();await reader.cancel();
 // Flush cancellation through the pass-through writer and upstream reader.
 for(let i=0;i<20&&!cancelled;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(cancelled,true);
 console.log('ai-provider-completion: JSON stop reasons, request abort signal, and upstream cancellation passed');
} finally { globalThis.fetch=originalFetch; }
