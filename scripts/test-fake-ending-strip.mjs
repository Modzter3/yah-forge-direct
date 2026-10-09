#!/usr/bin/env node
/** Smoke test for fake-ending strip helpers (mirrors public/index.html). */

function looksLikeForgeClosingParagraph(p) {
  const t = String(p || "").trim();
  if (!t || t.length > 1800) return false;
  return /\b(amen|shalom|selah|in the name of|until next time|thank you for tuning|thank you for listening|share this|share the (?:message|episode)|subscribe|tune in|keep the commandments|come out of her|the door (?:is )?clos|last warning|final warning|this is your warning|peace,?\s*(?:family|israel)|yah first,?\s*last|this has been brother|the message is (?:out|delivered|finished|complete)|wake up the brothers.*wake up the sisters|i'?ve (?:given you|laid) the (?:blueprint|meat)|the seal is set|what you do with it determines)\b/i.test(
    t
  );
}

function looksLikeFakeEndingRestartParagraph(p) {
  const t = String(p || "").trim();
  if (!t || t.length > 1200) return false;
  return (
    /\bYou think (?:I(?:'m| am)|we(?:'re| are)|that (?:was|is)|because I said|because I'?m about to)\b/i.test(t) ||
    /\b(?:Hell no[!]?|Not yet[!]?)[\s—-]*(?:We (?:aren't|are not) done|I'?m not (?:done|finished|letting you)|you (?:thought|think) (?:I was|we were|that was))\b/i.test(t) ||
    /\bYou think (?:because )?I said ["']?peace\b/i.test(t) ||
    /\b(?:close this broadcast|sign off this broadcast|walk away from the table)\b/i.test(t)
  );
}

function stripFakeEndingCyclesFromParas(paras, finalPartOnly) {
  if (!paras || paras.length < 5) return paras.join("\n\n");
  function isMarker(p) {
    return looksLikeForgeClosingParagraph(p) || looksLikeFakeEndingRestartParagraph(p);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < paras.length - 2; i++) {
      if (!isMarker(paras[i])) continue;
      let j = i + 1;
      if (j < paras.length && looksLikeFakeEndingRestartParagraph(paras[j])) j++;
      if (j >= paras.length) break;
      let teachLen = 0;
      let k = j;
      while (k < paras.length && !isMarker(paras[k])) {
        teachLen += paras[k].length;
        k++;
      }
      if (k >= paras.length && finalPartOnly) break;
      if (teachLen >= 120) {
        paras.splice(i, j - i);
        changed = true;
        break;
      }
    }
  }
  return paras.join("\n\n");
}

function stripFakeEndingCycles(text, totalParts) {
  const paras = String(text).replace(/\s+$/, "").split(/\n\s*\n/);
  return stripFakeEndingCyclesFromParas(paras, false);
}

const sample = `
# Title

Opening body with teaching content here about the Eighth Day and Leviticus twenty-three.

Peace, family. Yah First, last, and always. This has been Brother Bet.

You think I'm finished? Hell no! We are talking about the solemn assembly again with more engineering metaphors and repeated decode of Atzeret.

More teaching paragraph with enough length to count as real continuation material — symbols, verses, warnings, and practical protocol for Israel in twenty twenty-six when the system is rigged against the scattered seed.

Peace, family. Stay in the Word. Yah First, last, and always.

You think because I said peace that the weight is off your shoulders? Hell no!

Final teaching before the true close — assemble your family, study Hebrews, keep the fire burning on the real Eighth Day.

Peace, Israel. Yah First. Wake up the brothers. The message is delivered.
`.trim();

const out = stripFakeEndingCycles(sample, 1);
const closings = (out.match(/Peace, family/gi) || []).length;
const restarts = (out.match(/You think/gi) || []).length;
const finalClose = /Peace, Israel/i.test(out);

if (closings !== 0) {
  console.error("FAIL: expected 0 mid Peace, family, got", closings);
  process.exit(1);
}
if (restarts !== 0) {
  console.error("FAIL: expected 0 You think restarts, got", restarts);
  process.exit(1);
}
if (!finalClose) {
  console.error("FAIL: expected final Peace, Israel close");
  process.exit(1);
}
console.log("OK: stripped mid-sermon fake endings; kept final close");
