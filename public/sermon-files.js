/* Local document transfer. No AI requests or uploads. */
(function(global){
'use strict';
var ACCEPT='.md,.markdown,.txt,.pdf,.docx,.json,text/plain,text/markdown,application/pdf,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
var toolsPromise;
function tools(){
 if(!toolsPromise)toolsPromise=import('/vendor/document-tools.mjs').catch(function(error){toolsPromise=null;throw error;});
 return toolsPromise;
}

function safeText(value){
 if(typeof value!=='string')throw new Error('Sermon text must be a string.');
 return value.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\]\(\s*(?:javascript|data|vbscript):[^)]*\)/gi,'](blocked)').trim();
}
function splitParts(text){
 var starts=[];var re=/^(?:#{1,6}\s*)?(?:PART|EPISODE)\s+\d+\s*[:\-–—]/gim;var m;
 while((m=re.exec(text)))starts.push(m.index);
 if(starts.length<2)return [text];
 return starts.map(function(start,i){return text.slice(i===0?0:start,starts[i+1]||text.length).trim();});
}
function normalizeEntry(entry,fallback){
 if(!entry||typeof entry!=='object'||Array.isArray(entry))throw new Error('Invalid sermon entry.');
 var combined=safeText(entry.combined);
 if(!combined)throw new Error('The sermon is empty.');
 var parts=entry.parts===undefined?splitParts(combined):entry.parts;
 if(!Array.isArray(parts)||!parts.length||parts.some(function(p){return typeof p!=='string'||!p.trim();}))throw new Error('Invalid sermon parts.');
 var title=typeof entry.title==='string'&&entry.title.trim()?entry.title.trim():fallback;
 var id=typeof entry.id==='string'||typeof entry.id==='number'?entry.id:global.crypto.randomUUID();
 return {id:id,title:title,desc:typeof entry.desc==='string'?entry.desc:'Imported sermon',category:typeof entry.category==='string'?entry.category:'doctrine',mode:typeof entry.mode==='string'?entry.mode:'standard',model:typeof entry.model==='string'?entry.model:'imported',parts:parts.map(safeText),partTitles:Array.isArray(entry.partTitles)?entry.partTitles.map(function(t){return String(t);}):[],seriesTitle:typeof entry.seriesTitle==='string'?entry.seriesTitle:title,combined:combined,date:typeof entry.date==='string'&&!isNaN(Date.parse(entry.date))?entry.date:new Date().toISOString(),wordCount:combined.split(/\s+/).length};
}
function parseText(text,name){
 var clean=safeText(text);if(!clean)throw new Error('No readable sermon text found.');
 var first=clean.split('\n').map(function(l){return l.trim();}).find(function(l){return l&&!/^[=*_\-]+$/.test(l);});
 var title=first&&first.length<180?first.replace(/^#+\s*/,''):name.replace(/\.[^.]+$/,'');
 return [normalizeEntry({title:title,combined:clean},title)];
}
function parseJson(text,name){
 var data=JSON.parse(text);var entries=Array.isArray(data)?data:(data&&Array.isArray(data.sermons)?data.sermons:[data]);
 if(!entries.length)throw new Error('The backup contains no sermons.');
 return entries.map(function(e){return normalizeEntry(e,name);});
}
async function readPdf(buffer){
 var lib=await tools();lib.pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdf.worker.min.mjs';
 var task=lib.pdfjs.getDocument({data:new Uint8Array(buffer),isEvalSupported:false});
 var pdf=await task.promise;var pages=[];
 try{for(var i=1;i<=pdf.numPages;i++){
  var page=await pdf.getPage(i);var content=await page.getTextContent();var lines=[],line='',y=null;
  content.items.forEach(function(item){if(!item.str)return;var nextY=item.transform[5];if(y!==null&&Math.abs(nextY-y)>2){lines.push(line);line='';}line+=(line?' ':'')+item.str;y=nextY;if(item.hasEOL){lines.push(line);line='';y=null;}});
  if(line)lines.push(line);pages.push(lines.join('\n'));
 }}finally{await pdf.destroy();}
 var text=pages.join('\n\n');if(!text.trim())throw new Error('This PDF has no readable text. Scanned PDFs need OCR first; import TXT or DOCX instead.');return text;
}
async function readFile(file){
 if(file.size>32*1024*1024)throw new Error('File exceeds the 32 MB import limit.');
 var ext=file.name.split('.').pop().toLowerCase();
 if(ext==='json')return parseJson(await file.text(),file.name);
 if(['md','markdown','txt'].indexOf(ext)!==-1)return parseText(await file.text(),file.name);
 if(ext==='pdf')return parseText(await readPdf(await file.arrayBuffer()),file.name);
 if(ext==='docx'){var lib=await tools();var result=await lib.mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});return parseText(result.value,file.name);}
 throw new Error('Choose MD, TXT, PDF, DOCX, or a sermon JSON backup.');
}
function mergeEntries(existing,incoming){
 var merged=existing.slice(),ids=new Set(existing.map(function(e){return e.id;})),added=0;
 incoming.forEach(function(entry){
  if(merged.some(function(e){return e.combined===entry.combined&&e.title===entry.title;}))return;
  if(ids.has(entry.id))entry=Object.assign({},entry,{id:global.crypto.randomUUID()});
  ids.add(entry.id);merged.push(entry);added++;
 });
 merged.sort(function(a,b){return new Date(b.date)-new Date(a.date);});return {entries:merged,added:added};
}
function plain(text){return text.replace(/^#{1,6}\s+/gm,'').replace(/\*\*([^*]+)\*\*/g,'$1').replace(/&lt;/g,'<').replace(/&gt;/g,'>');}
async function exportEntry(entry,format){
 var text=entry.combined;var blob;
 if(format==='json')blob=new Blob([JSON.stringify({format:'yah-forge-sermon',version:1,sermons:[entry]},null,2)],{type:'application/json'});
 else if(format==='md'||format==='txt')blob=new Blob([format==='txt'?plain(text):text],{type:format==='txt'?'text/plain;charset=utf-8':'text/markdown;charset=utf-8'});
 else if(format==='docx'){
  var lib=await tools();var doc=new lib.docx.Document({sections:[{children:plain(text).split('\n').map(function(line){return new lib.docx.Paragraph({children:[new lib.docx.TextRun(line)]});})}]});blob=await lib.docx.Packer.toBlob(doc);
 }else if(format==='pdf'){
  var lib=await tools();var fontResponse=await fetch('/vendor/DejaVuSans.ttf');if(!fontResponse.ok)throw new Error('PDF font could not load.');
  var bytes=new Uint8Array(await fontResponse.arrayBuffer()),binary='';for(var i=0;i<bytes.length;i++)binary+=String.fromCharCode(bytes[i]);
  var pdf=new lib.jsPDF();pdf.addFileToVFS('DejaVuSans.ttf',btoa(binary));pdf.addFont('DejaVuSans.ttf','DejaVuSans','normal');pdf.setFont('DejaVuSans');pdf.setFontSize(11);
  var lines=pdf.splitTextToSize(plain(text),180),y=18;
  lines.forEach(function(line){if(y>280){pdf.addPage();y=18;}pdf.text(line,15,y);y+=5.5;});blob=pdf.output('blob');
 }else throw new Error('Unsupported export format.');
 return blob;
}
function download(blob,name){var url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},60000);}
global.ForgeSermonFiles={accept:ACCEPT,parseText:parseText,parseJson:parseJson,normalizeEntry:normalizeEntry,readFile:readFile,mergeEntries:mergeEntries,exportEntry:exportEntry,download:download};
})(typeof window!=='undefined'?window:globalThis);
