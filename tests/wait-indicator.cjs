const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('public/index.html','utf8');
// Compile all inline scripts to catch accidental syntax errors in prompt strings.
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);
// Load the waiting-for-model indicator exactly as the page defines it.
const start=html.indexOf('// --- Waiting-for-model indicator');
const end=html.indexOf('function isRoughBezForgeActive(){');
assert.ok(start>0&&end>start,'wait indicator block not found');
let now=1000000;
const timers=new Map();let nextTimer=1;let cleared=[];
const context=vm.createContext({
 window:{},
 Date:{now:()=>now},
 setInterval:(fn,ms)=>{const id=nextTimer++;timers.set(id,{fn,ms});return id;},
 clearInterval:id=>{cleared.push(id);timers.delete(id);},
});
vm.runInContext(html.slice(start,end),context);
const tick=()=>{for(const t of timers.values())t.fn();};
const rendered=[];
context.beginForgeWait(text=>rendered.push(text));
assert.equal(rendered.at(-1),'Model is thinking… 0s','initial label');
assert.equal([...timers.values()][0].ms,1000,'indicator ticks once a second');
now+=5000;tick();
assert.equal(rendered.at(-1),'Model is thinking… 5s','elapsed seconds tick');
// Reasoning progress from the streaming polyfill must show up without polluting the draft.
context.window.onForgeReasoningProgress({chars:1234,elapsedMs:5000});
assert.match(rendered.at(-1),/chars of reasoning so far/,'reasoning volume reported');
assert.match(rendered.at(-1),/1,?234/,'reasoning char count rendered');
now+=1000;tick();
assert.equal(rendered.at(-1),'Model is thinking… 6s — 1,234 chars of reasoning so far','label keeps elapsed and reasoning');
// First answer token flips the phase.
context.markForgeWaitWriting();
assert.equal(rendered.at(-1),'Writing… 6s','writing phase label');
now+=2000;tick();
assert.equal(rendered.at(-1),'Writing… 8s','writing phase keeps ticking');
// Ending the wait stops the timer and ignores stray reasoning events.
context.endForgeWait();
assert.equal(timers.size,0,'timer cleared when the part finishes');
const before=rendered.length;
now+=5000;context.window.onForgeReasoningProgress({chars:9999});
assert.equal(rendered.length,before,'no rendering after the wait ends');
// A stale loader must not throw when the DOM element is gone.
context.beginForgeWait(()=>{throw new Error('detached node');});
assert.doesNotThrow(()=>{now+=1000;tick();},'render failures are swallowed');
context.endForgeWait();
console.log('wait-indicator: thinking/writing phases, elapsed ticks, reasoning volume, and clean shutdown passed');