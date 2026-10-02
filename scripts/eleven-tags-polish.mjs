/**
 * ElevenLabs bracket-tag cleanup for forge TTS (shared with tests).
 * Typos, film directions, broken tags, sparse paragraph healing.
 */

import { fileURLToPath } from 'node:url';

const ELEVEN_EMOTION_TAG_RX =
  /\[(?:shouts?|whispering|whispers?|softly|laughs?|sighs|gasps|scoffs|booming|sarcastically|sad|angry|excited|tired|upset|sorrowful|awe|happily|worried|surprised|furious|heartbroken|disgusted|passionate|intense|tender|broken|exhausted|desperate|mocking|bitter|solemn|commanding|intimate|grief|wrath|trembling|stunned|cold|heated|clears throat|drawn out|rushed|emphasized|shouting|screaming|breathless|menacing growl)\]/gi;

const FILM_TAG_REPLACEMENTS = [
  [/\[pacing aggressively\]/gi, '[rushed]'],
  [/\[pacing wildly\]/gi, '[breathless]'],
  [/\[slams fist on the podium\]/gi, '[shouting]'],
  [/\[screaming\]/gi, '[shouting]'],
];

const TAG_ROTATE = [
  '[pause]',
  '[furious]',
  '[bitter]',
  '[whispers]',
  '[shouting]',
  '[angry]',
  '[emphasized]',
  '[scoffs]',
];

export function sanitizeElevenLabsTaggedText(text) {
  if (!text) return '';
  let t = String(text);
  t = t.replace(/\[(\s*[a-zA-Z][^\]]*?)\s*\n+\s*\]/g, '[$1]');
  t = t.replace(/\[(scouts)\]/gi, '[scoffs]');
  t = t.replace(/\bPEPE THIS\b/gi, 'PEEP THIS');
  t = t.replace(/\bHOLOCUUST\b/gi, 'HOLOCAUST');
  for (const [re, rep] of FILM_TAG_REPLACEMENTS) t = t.replace(re, rep);
  t = t.replace(/\[(voice dropping to a low, menacing growl)\]/gi, '[menacing growl]');
  return t;
}

function countEmotionTagsInParagraph(p) {
  const m = p.match(ELEVEN_EMOTION_TAG_RX);
  return m ? m.length : 0;
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
    const raw = parts[i];
    const p = raw.trim();
    if (isSkippableParagraph(p)) continue;
    let em = countEmotionTagsInParagraph(p);
    const need = Math.max(2, Math.floor(p.length / 300));
    if (em >= need) continue;
    const sentences = p.split(/(?<=[.!?…])\s+(?=[A-Z\["])/);
    if (sentences.length < 3) continue;
    const out = [];
    for (let s = 0; s < sentences.length; s++) {
      if (s > 0 && s % 2 === 0 && em < need) {
        out.push(TAG_ROTATE[ri % TAG_ROTATE.length]);
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
  return healSparseElevenTaggedParagraphs(sanitizeElevenLabsTaggedText(text));
}

export function looksLikeParagraphsUnderTaggedEleven(text) {
  const body = String(text || '')
    .trim()
    .replace(/^#\s+.+\n+/m, '');
  const paras = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 80 && !/^#+\s/.test(p));
  for (const p of paras) {
    if (isSkippableParagraph(p)) continue;
    const em = countEmotionTagsInParagraph(p);
    const need = Math.max(2, Math.floor(p.length / 300));
    if (em < need) return true;
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
