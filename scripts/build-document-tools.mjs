import {createRequire} from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const modules=path.resolve(process.argv[2]||path.join(root,'node_modules'));
const require=createRequire(path.join(modules,'../package.json'));
const {build}=require('esbuild');
const vendor=path.join(root,'public/vendor');fs.mkdirSync(vendor,{recursive:true});
await build({stdin:{contents:"export * as pdfjs from 'pdfjs-dist/build/pdf.mjs'; export * as mammoth from 'mammoth'; export * as docx from 'docx'; export {jsPDF} from 'jspdf';",resolveDir:path.dirname(modules)},nodePaths:[modules],bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'linked',outfile:path.join(vendor,'document-tools.mjs')});
fs.copyFileSync(path.join(modules,'pdfjs-dist/build/pdf.worker.min.mjs'),path.join(vendor,'pdf.worker.min.mjs'));
let licenses='';for(const pkg of ['pdfjs-dist','mammoth','docx','jspdf','dompurify','buffer']){const dir=path.join(modules,pkg);const name=fs.readdirSync(dir).find(f=>/^licen[sc]e(?:\.md|\.txt)?$/i.test(f));if(name)licenses+='\n'+pkg+'\n'+fs.readFileSync(path.join(dir,name),'utf8')+'\n';}
fs.writeFileSync(path.join(vendor,'document-tools-LICENSES.txt'),licenses);

fs.copyFileSync(path.join(modules,'dompurify/dist/purify.min.js'),path.join(vendor,'purify.min.js'));
