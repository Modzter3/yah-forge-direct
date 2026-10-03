/**
 * ElevenLabs bracket-tag cleanup for forge TTS (shared with tests).
 * Typos, film directions, broken tags, sparse paragraph healing.
 * Tag detection is generic: v4 accepts descriptive natural-language direction,
 * so any [bracket phrase] counts, not a fixed one-word list.
 */

import { fileURLToPath } from 'node:url';

const HEAL_ROTATE = [
  '[pause]',
  '[bitter and flat, like reading a bill you already know you cannot pay]',
  '[low and slow, holding back anger]',
  '[tired, almost whispering, talking to one person]',
  '[dry, mocking, one eyebrow up]',
  '[quiet and steady, every word placed on purpose]',
  '[sharp and clipped, losing patience]',
  '[heavy, like carrying it]',
];

export function getElevenBracketTags(text) {
  const out = [];
  const re = /\[([^\[\]\n]{2,100})\]/g;
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
  return t.split(/\s+/).length >= 3 || /,/.test(t);
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

export function looksLikeElevenTagsOneWordHeavy(text) {
  const emotion = countElevenEmotionTags(text);
  if (emotion < 10) return false;
  return countElevenDescriptiveTags(text) < Math.ceil(emotion * 0.55);
}

export function sanitizeElevenLabsTaggedText(text) {
  if (!text) return '';
  let t = String(text);
  t = t.replace(/\[(\s*[a-zA-Z][^\]]*?)\s*\n+\s*\]/g, '[$1]');
  t = t.replace(/\[(scouts)\]/gi, '[scoffs]');
  t = t.replace(/\bPEPE THIS\b/gi, 'PEEP THIS');
  t = t.replace(/\bHOLOCUUST\b/gi, 'HOLOCAUST');
  t = t.replace(/\[pacing (?:aggressively|wildly)\]/gi, '[fast, pushing hard, no room to breathe]');
  t = t.replace(/\[slams fist on the podium\]/gi, '[hitting every word hard, slow and heavy]');
  t = t.replace(/\[screaming\]/gi, '[shouting, voice cracking]');
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
