/**
 * ElevenLabs bracket-tag cleanup for forge TTS (shared with tests).
 * Typos, film directions, broken tags, sparse paragraph healing.
 * Tag detection is generic: v4 accepts descriptive natural-language direction,
 * so any [bracket phrase] counts, not a fixed one-word list.
 */

import { fileURLToPath } from 'node:url';

const HEAL_ROTATE = [
  '[bitter, flat]',
  '[low, holding back]',
  '[tired, almost whispering]',
  '[dry, mocking]',
  '[quiet, steady]',
  '[sharp, clipped]',
  '[heavy, slow]',
  '[leaning in]',
];

export const ELEVEN_TAG_MAX_WORDS = 5;
export const ELEVEN_TAG_MAX_CHARS = 36;

export function getElevenBracketTags(text) {
  const out = [];
  const re = /\[([^\[\]\n]{2,160})\]/g;
  const s = String(text || '');
  let m;
  while ((m = re.exec(s))) {
    const t = m[1].trim();
    if (!/[a-z]/i.test(t)) continue;
    if (/^[A-Z0-9 \-—–:'.,]+$/.test(t)) continue;
    if (/^\d/.test(t)) continue;
    out.push(t);
  }
  return out;
}

export function isElevenPacingOnlyTag(tag) {
  return /^(?:pause|beat|drawn out|long pause|short pause|silence)$/i.test(String(tag || '').trim());
}

export function isElevenDescriptiveTag(tag) {
  const t = String(tag || '').trim();
  return t.split(/\s+/).length >= 2;
}

export function isElevenTagTooLong(tag) {
  const t = String(tag || '').trim();
  return t.split(/\s+/).length > ELEVEN_TAG_MAX_WORDS || t.length > ELEVEN_TAG_MAX_CHARS;
}

export function shortenElevenTag(inner) {
  const t = String(inner || '').trim();
  if (!isElevenTagTooLong(t)) return t;
  const segs = t.split(/\s*,\s*/);
  let out = segs[0];
  if (isElevenTagTooLong(out)) {
    const words = out.split(/\s+/).slice(0, ELEVEN_TAG_MAX_WORDS);
    while (words.length > 1 && words.join(' ').length > ELEVEN_TAG_MAX_CHARS) words.pop();
    return words.join(' ').replace(/[,;:\s]+$/, '');
  }
  for (let i = 1; i < segs.length; i++) {
    const next = out + ', ' + segs[i];
    if (isElevenTagTooLong(next)) break;
    out = next;
  }
  return out;
}

export function shortenLongElevenTags(text) {
  const s = String(text || '');
  return s.replace(/\[([^\[\]\n]{2,160})\]/g, (m, inner, offset) => {
    if (s.charAt(offset + m.length) === '(') return m;
    if (!/[a-z]/i.test(inner)) return m;
    if (/^[A-Z0-9 \-—–:'.,]+$/.test(inner.trim())) return m;
    if (/^\d/.test(inner.trim()) || /\d+:\d+/.test(inner)) return m;
    const short = shortenElevenTag(inner);
    return short === inner.trim() ? m : '[' + short + ']';
  });
}

export function addElevenParagraphPauses(text) {
  const parts = String(text || '').split(/(\r?\n[ \t]*\r?\n)/);
  for (let i = 0; i < parts.length; i += 2) {
    const raw = parts[i];
    const p = raw.replace(/\s+$/, '');
    if (!p.trim()) continue;
    const trimmed = p.trim();
    if (/^#{1,6}\s/.test(trimmed)) continue;
    if (/^PART\s+\d/i.test(trimmed)) continue;
    if (/(^|\n)\s*(?:={3,}|-{3,}|\*{3,})\s*(\n|$)/.test(p)) continue;
    if (/\[pause\]\s*$/i.test(p)) continue;
    parts[i] = p + ' [pause]' + raw.slice(p.length);
  }
  return parts.join('');
}

export function countElevenMidParagraphPauses(text) {
  const all = getElevenBracketTags(text).filter((x) => /^pause$/i.test(x)).length;
  const closing = (String(text || '').match(/\[pause\][ \t]*(?:\n[ \t]*\n|\s*$)/gi) || []).length;
  return Math.max(0, all - closing);
}

export function countElevenTooLongTags(text) {
  return getElevenBracketTags(text).filter((t) => isElevenTagTooLong(t)).length;
}

export function isElevenLoudTag(tag) {
  return /\b(?:shout\w*|yell\w*|scream\w*|roar\w*|bellow\w*|boom\w*|furious|fury|wrath\w*|heated|thunder\w*)\b/i.test(
    String(tag || '')
  );
}

export function countElevenEmotionTags(text) {
  return getElevenBracketTags(text).filter((t) => !isElevenPacingOnlyTag(t)).length;
}

export function countElevenDescriptiveTags(text) {
  return getElevenBracketTags(text).filter((t) => !isElevenPacingOnlyTag(t) && isElevenDescriptiveTag(t)).length;
}

function isElevenDirectionTagToken(token){
var tags=getElevenBracketTags(token);
return tags.length===1&&!isElevenPacingOnlyTag(tags[0])&&!/\d+:\d+/.test(tags[0]);
}
export function countElevenMisplacedDirectionTags(text){
var total=0;
String(text||'').split(/\n\s*\n/).forEach(function(p){
if(/^\s*(?:#{1,6}\s|PART\s+\d)/i.test(p))return;
var tail=p.match(/(?:\s*\[[^\[\]\n]{2,160}\])+\s*$/);
if(!tail)return;
var tokens=tail[0].match(/\[[^\[\]\n]{2,160}\]/g)||[];
tokens.forEach(function(token){if(isElevenDirectionTagToken(token))total++;});
});
return total;
}
export function normalizeElevenTagPlacement(text){
var parts=String(text||'').split(/(\r?\n[ \t]*\r?\n)/);
for(var i=0;i<parts.length;i+=2){
var raw=parts[i];
if(/^\s*(?:#{1,6}\s|PART\s+\d)/i.test(raw))continue;
var tail=raw.match(/(?:\s*\[[^\[\]\n]{2,160}\])+\s*$/);
if(!tail)continue;
var tokens=tail[0].match(/\[[^\[\]\n]{2,160}\]/g)||[];
var directions=tokens.filter(isElevenDirectionTagToken);
if(!directions.length)continue;
var body=raw.slice(0,tail.index).trimEnd();
if(!body.trim())continue;
// A paragraph's sole delivery note belongs before the whole paragraph. If it
// already starts with a direction, the trailing change belongs before its last sentence.
var leading=body.trimStart().match(/^\[[^\[\]\n]{2,160}\]/);
var insertAt=body.length-body.trimStart().length;
if(leading&&isElevenDirectionTagToken(leading[0])){
var boundary=/[.!?…]["'”’)]*\s+(?=\S)/g;
var m;
while((m=boundary.exec(body)))insertAt=m.index+m[0].length;
if(insertAt===body.length-body.trimStart().length)directions=[];
}
parts[i]=body.slice(0,insertAt)+(directions.length?directions.join(' ')+' ':'')+body.slice(insertAt);
var remaining=tokens.filter(function(token){return !isElevenDirectionTagToken(token);});
if(remaining.length)parts[i]+=' '+remaining.join(' ');
parts[i]+=raw.slice(raw.trimEnd().length);
}
return parts.join('');
}

export function sanitizeElevenLabsTaggedText(text) {
  if (!text) return '';
  let t = String(text);
  t = t.replace(/\[(\s*[a-zA-Z][^\]]*?)\s*\n+\s*\]/g, '[$1]');
  t = t.replace(/\[(scouts)\]/gi, '[scoffs]');
  t = t.replace(/\bPEPE THIS\b/gi, 'PEEP THIS');
  t = t.replace(/\bHOLOCUUST\b/gi, 'HOLOCAUST');
  t = t.replace(/\[pacing (?:aggressively|wildly)\]/gi, '[fast, pushing hard]');
  t = t.replace(/\[slams fist on the podium\]/gi, '[slow, heavy]');
  t = t.replace(/\[screaming\]/gi, '[shouting, cracking]');
  t = shortenLongElevenTags(t);
  return t;
}

function isSkippableParagraph(p) {
  const s = p.trim();
  if (s.length < 280) return true;
  if (/^PART\s+\d/i.test(s)) return true;
  if (/^=+$/.test(s.replace(/\s/g, ''))) return true;
  if (/^#+\s/.test(s)) return true;
  return false;
}

export function healSparseElevenTaggedParagraphs(text, rotateOffset = 0) {
  if (!text) return '';
  const parts = String(text).split(/\n\s*\n/);
  let ri = rotateOffset;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].trim();
    if (isSkippableParagraph(p)) continue;
    let em = countElevenEmotionTags(p);
    const need = Math.max(2, Math.floor(p.length / 300));
    if (em >= need) continue;
    const sentences = p.split(/(?<=[.!?…])\s+(?=[A-Z\["])/);
    if (sentences.length < 3) continue;
    const out = [];
    for (let s = 0; s < sentences.length; s++) {
      if (s > 0 && s % 2 === 0 && em < need) {
        out.push(HEAL_ROTATE[ri % HEAL_ROTATE.length]);
        ri++;
        em++;
      }
      out.push(sentences[s]);
    }
    parts[i] = out.join(' ');
  }
  return parts.join('\n\n');
}

export function polishElevenLabsTaggedText(text) {
  return addElevenParagraphPauses(normalizeElevenTagPlacement(healSparseElevenTaggedParagraphs(normalizeElevenTagPlacement(sanitizeElevenLabsTaggedText(text)))));
}

export function looksLikeParagraphsUnderTaggedEleven(text) {
  if (countElevenMisplacedDirectionTags(text) > 0) return true;
  const body = String(text || '')
    .trim()
    .replace(/^#\s+.+\n+/m, '');
  const paras = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 80 && !/^#+\s/.test(p));
  for (const p of paras) {
    if (isSkippableParagraph(p)) continue;
    const need = Math.max(2, Math.floor(p.length / 300));
    if (countElevenEmotionTags(p) < need) return true;
  }
  return false;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const fs = await import('node:fs');
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: node eleven-tags-polish.mjs <sermon.txt> [out.txt]');
    process.exit(1);
  }
  const src = fs.readFileSync(path, 'utf8');
  const out = polishElevenLabsTaggedText(src);
  const dest = process.argv[3] || path.replace(/(\.\w+)?$/, '-polished$1');
  fs.writeFileSync(dest, out);
  console.log('Wrote', dest, '(' + out.length + ' chars)');
}
