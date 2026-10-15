/* Editorial reading aids only. Original corpus text and numbering stay intact. */
(function(global){
'use strict';
var curated={
 'Testament of Solomon':[
 [1,'The afflicted worker and the ring'],[9,'Ornias and Beelzeboul'],[17,'Onoskelis'],[21,'Asmodeus'],[26,'Beelzeboul questioned'],[33,'Ashes and the seven spirits'],[43,'The headless spirit and the hound'],[51,'The lion and the dragon'],[57,'Obizuth'],[60,'The winged dragon and Enepsigos'],[67,'The sea spirit and the blade'],[72,'The spirits of the decans'],[90,'Further decans'],[110,'The testimony and the old man'],[117,'The Arabian king and Ephippas'],[124,'The pillar and the Red Sea'],[128,'Solomon’s final confession']
 ],
 'Book of Giants':[[1,'Conflict and the warning'],[17,'Visions and destruction'],[35,'Apostles and the Hearers'],[40,'Parables of giving and service'],[62,'The flight and Enoch’s warning']]
};
function verseIds(text){return Array.from(String(text).matchAll(/^(\d+)\.\s+/gm),function(m){return Number(m[1]);});}
function create(book,chapter,text){
 text=String(text||'');var totalWords=text.trim().split(/\s+/).length;
 var plan=Number(chapter)===1?curated[book]:null;
 if(!plan&&totalWords<3000)return null;
 var lines=Array.from(text.matchAll(/^(\d+)\.\s+.*(?:\n|$)/gm));
 if(lines.length<2)return null;
 var cuts=[{offset:0,title:plan?plan[0][1]:''}],words=0;
 if(plan){
  plan.slice(1).forEach(function(item){var line=lines.find(function(m){return Number(m[1])===item[0];});if(line)cuts.push({offset:line.index,title:item[1]});});
 }else{
  // Break only between complete source paragraphs, never inside a sentence.
  lines.forEach(function(line,i){var count=line[0].trim().split(/\s+/).length;
   if(i>0&&words+count>1400&&words>=900){cuts.push({offset:line.index,title:''});words=0;}
   words+=count;
  });
  // Avoid a tiny final section.
  if(cuts.length>1&&text.slice(cuts[cuts.length-1].offset).trim().split(/\s+/).length<350)cuts.pop();
 }
 var sections=cuts.map(function(c,i){var end=cuts[i+1]?cuts[i+1].offset:text.length;var body=text.slice(c.offset,end);var ids=verseIds(body);
  return {number:i+1,start:c.offset,end:end,title:c.title,firstVerse:ids[0],lastVerse:ids[ids.length-1],wordCount:body.trim().split(/\s+/).length};
 });
 return {book:book,chapter:Number(chapter),text:text,sections:sections};
}
function label(set,section){return 'Reading Section '+section.number+(section.title?' — '+section.title:'')+' · source '+set.chapter+':'+section.firstVerse+'–'+section.lastVerse+' · ~'+section.wordCount.toLocaleString()+' words';}
function select(set,from,to){
 from=Number(from);to=Number(to);
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<1||to<from||to>set.sections.length)throw new Error('Choose a valid reading-section range.');
 var first=set.sections[from-1],last=set.sections[to-1];
 var text=set.text.slice(first.start,last.end).trim();
 return {text:text,verseIds:verseIds(text),label:'Reading Section'+(from===to?' '+from:'s '+from+'–'+to)+' (source '+set.chapter+':'+first.firstVerse+'–'+last.lastVerse+')'};
}
global.ForgeReadingSections={create:create,label:label,select:select,verseIds:verseIds};
})(typeof window!=='undefined'?window:globalThis);
