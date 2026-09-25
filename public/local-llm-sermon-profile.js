/**
 * Local RunPod multi-part sermon orchestration (OpenRouter unchanged).
 */
(function (global) {
  var WORD_MIN = 1800;
  var WORD_TARGET = 2200;
  var WORD_MAX = 2800;
  var MAX_LOCAL_LLM_RETRIES = 1;
  var MAX_TRUNC_CONTINUATIONS = 1;
  /** Server default LOCAL_LLM_SERMON_MAX_TOKENS — client calc stays below this */
  var SERMON_TOKEN_CEILING = 4800;
  var TOKENS_PER_WORD = 1.45;
  /** Match llama-server n_ctx (override via window.__LOCAL_LLM_EFFECTIVE_CONTEXT or health check) */
  var DEFAULT_EFFECTIVE_CONTEXT = 65536;
  var CONTEXT_SAFETY_TOKENS = 512;
  var MIN_OUTPUT_BUDGET = 1024;
  var CHARS_PER_TOKEN_EST = 3.35;
  var SHRINK_WORD_TARGET = 1500;

  function isLocalLlmProvider() {
    try {
      return typeof global.getForgeLlmProvider === 'function' && (global.getForgeLlmProvider() === 'local' || global.getForgeLlmProvider() === 'bonsai');
    } catch (e) {
      return false;
    }
  }

  function isChapterSermonContext() {
    if (!isLocalLlmProvider()) return false;
    if (!global.currentChapterSource || !global.currentChapterVerseCount) return false;
    var t = global.currentChapterSource.type;
    return t === 'bible' || t === 'apocrypha' || t === 'sealed';
  }

  function getVerseRange(partNum, totalParts, totalVerses) {
    if (typeof global.getVerseRangeForPart === 'function') {
      return global.getVerseRangeForPart(partNum, totalParts, totalVerses);
    }
    return { start: 1, end: totalVerses, count: totalVerses };
  }

  function refLabel(book, chapter, vStart, vEnd) {
    var b = String(book || '').trim();
    var ch = parseInt(chapter, 10) || 1;
    if (vStart === vEnd) return b + ' ' + ch + ':' + vStart;
    return b + ' ' + ch + ':' + vStart + '-' + vEnd;
  }

  function assignedCoveredEndBeforePart(partNum, totalParts, verseCount) {
    if (partNum <= 1) return 0;
    var prev = getVerseRange(partNum - 1, totalParts, verseCount);
    return prev.end;
  }

  function buildVerseLedger(meta) {
    var coveredEnd = assignedCoveredEndBeforePart(meta.partNum, meta.totalParts, meta.verseCount);
    if (meta.partNum > 1 && meta.coveredThrough > 0) {
      coveredEnd = Math.max(coveredEnd, meta.coveredThrough);
    }
    var already =
      coveredEnd > 0
        ? refLabel(meta.book, meta.chapter, 1, coveredEnd)
        : '(none yet)';
    var doNot =
      coveredEnd > 0
        ? refLabel(meta.book, meta.chapter, 1, coveredEnd)
        : '(none yet)';
    var lines = [
      'SERMON STATE',
      'Book: ' + meta.book,
      'Chapter: ' + meta.chapter,
      'Part: ' + meta.partNum + ' of ' + meta.totalParts,
      'Cover ONLY: ' + refLabel(meta.book, meta.chapter, meta.range.start, meta.range.end),
      'Already covered: ' + already,
      'DO NOT reteach: ' + doNot,
      'Begin with: ' + refLabel(meta.book, meta.chapter, meta.range.start, meta.range.start),
      'End after completing: ' + refLabel(meta.book, meta.chapter, meta.range.end, meta.range.end),
      '',
      'Advance through the assigned verses IN ORDER. Cross-references are optional one-sentence support only — they never replace walking the assigned band.',
      'Write the sermon directly — no <think>, <thinking>, or hidden reasoning blocks.',
    ];
    return lines.join('\n');
  }

  function buildHardVerseDiscipline(meta) {
    return (
      'HARD VERSE DISCIPLINE (LOCAL LLM — MANDATORY):\n' +
      '- Never cite another chapter as though it belongs to ' +
      meta.book +
      ' chapter ' +
      meta.chapter +
      ' unless you label it explicitly as a cross-reference.\n' +
      '- Never invent verse text. Quote only from the chapter text provided in the prompt (or KJV wording you are certain of for this chapter).\n' +
      '- Do not skip ahead outside ' +
      refLabel(meta.book, meta.chapter, meta.range.start, meta.range.end) +
      '.\n' +
      '- Every major teaching point must anchor to a verse in this band (or a clearly labeled cross-reference).\n' +
      '- Cross-references must NOT replace progression through the assigned verses.\n' +
      '- Census counts, shekel totals, and other numeric facts must match the KJV chapter text exactly (do not guess or recompute).\n'
    );
  }

  function buildEndingContract(meta) {
    var p = 'NATURAL PART ENDING (LOCAL LLM):\n';
    p +=
      'When verse ' +
      meta.range.end +
      ' has been fully explained:\n' +
      '- Finish the current thought.\n';
    if (meta.partNum < meta.totalParts) {
      p += '- Write a SHORT transition into the next part (2-4 sentences max).\n';
    }
    p +=
      '- STOP immediately.\n' +
      '- Do NOT manufacture filler to consume token budget.\n' +
      '- Do NOT summarize the entire sermon unless this is the final part.\n' +
      '- Do NOT start Part ' +
      (meta.partNum + 1) +
      ' in this response.\n';
    return p;
  }

  function buildCompactContinuityBlock(state) {
    if (!state) return '';
    var lines = ['COMPACT SERMON CONTINUITY (do NOT expect full prior parts in context):'];
    lines.push(
      'Verses completed through: ' +
        (state.coveredThrough > 0
          ? refLabel(state.book, state.chapter, 1, state.coveredThrough)
          : '(none)')
    );
    if (state.transitionPoint) lines.push('Resume from: ' + state.transitionPoint);
    if (state.conclusions && state.conclusions.length) {
      lines.push('Major conclusions already established (do NOT re-argue at length):');
      for (var i = 0; i < state.conclusions.length; i++) lines.push('- ' + state.conclusions[i]);
    }
    if (state.doctrines && state.doctrines.length) {
      lines.push('Doctrines already explained (brief callback only if needed):');
      for (var j = 0; j < state.doctrines.length; j++) lines.push('- ' + state.doctrines[j]);
    }
    lines.push('');
    return lines.join('\n');
  }

  function wordsForVerseBand(range) {
    var c = range && range.count ? range.count : 5;
    var w = Math.round(WORD_TARGET + (c - 5) * 80);
    if (w < WORD_MIN) w = WORD_MIN;
    if (w > WORD_MAX) w = WORD_MAX;
    return w;
  }

  function maxTokensForWords(words) {
    return Math.min(SERMON_TOKEN_CEILING, Math.max(1024, Math.ceil(words * TOKENS_PER_WORD)));
  }

  function effectiveContextTokens() {
    var n = global.__LOCAL_LLM_EFFECTIVE_CONTEXT;
    if (typeof n === 'number' && n > 4096) return Math.floor(n);
    return DEFAULT_EFFECTIVE_CONTEXT;
  }

  function estimatePromptTokens(charLength) {
    var n = Math.ceil((charLength || 0) / CHARS_PER_TOKEN_EST);
    return Math.max(512, n);
  }

  function sliceChapterTextForBand(fullText, range, meta) {
    if (!fullText || !range) return '';
    var lines = String(fullText).split('\n');
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var m = line.match(/^(\d{1,3})\.\s/);
      if (m) {
        var vn = parseInt(m[1], 10);
        if (vn >= range.start && vn <= range.end) out.push(line);
      }
    }
    var hdr =
      'SLIM KJV EXCERPT — ' +
      refLabel(meta.book, meta.chapter, range.start, range.end) +
      ' ONLY (' +
      meta.verseCount +
      ' verses in full chapter). Primary exposition must use ONLY these verses; cross-refs stay one sentence.\n';
    return hdr + out.join('\n');
  }

  function captureFullChapterText(state) {
    if (!state) return;
    if (!state.fullChapterText && global.currentChapterText) {
      state.fullChapterText = String(global.currentChapterText);
    }
  }

  function chapterTextOverrideForPart(partNum, state) {
    if (!state) return null;
    captureFullChapterText(state);
    var full = state.fullChapterText || global.currentChapterText;
    if (!full) return null;
    var meta = buildPartMeta(partNum, state);
    return sliceChapterTextForBand(full, meta.range, meta);
  }

  function compactBasePromptForLocalLlm(basePrompt) {
    var p = String(basePrompt || '');
    p = p.replace(
      /\nTHIS CHAPTER HAS EXACTLY[\s\S]*?(?=\n(?:DO NOT HALLUCINATE VERSES|VERSE-BY-VERSE))/,
      '\n(Verse band assignments are in the LOCAL SERMON ORCHESTRATION block — follow that ledger exactly.)\n'
    );
    p = p.replace(
      /\nThe FULL scripture text for this chapter has been provided above\.[^\n]*\n/g,
      '\nOnly the assigned verse excerpt is in context — quote primary exposition from that excerpt.\n'
    );
    return p;
  }

  function isContextSizeError(errText) {
    var t = String(errText || '').toLowerCase();
    return (
      t.indexOf('context size has been exceeded') !== -1 ||
      t.indexOf('context length exceeded') !== -1 ||
      t.indexOf('exceeds the context') !== -1 ||
      t.indexOf('prompt is too long') !== -1
    );
  }

  function initSermonState() {
    if (!isChapterSermonContext()) return null;
    var src = global.currentChapterSource;
    return {
      book: src.book,
      chapter: src.chapter,
      totalParts: global.selectedPartCount,
      verseCount: global.currentChapterVerseCount,
      fullChapterText: global.currentChapterText ? String(global.currentChapterText) : '',
      coveredThrough: 0,
      conclusions: [],
      doctrines: [],
      transitionPoint: '',
      contextShrink: false,
      repetitionRetry: false,
    };
  }

  function buildPartMeta(partNum, state) {
    var totalParts = state.totalParts || global.selectedPartCount;
    var range = getVerseRange(partNum, totalParts, state.verseCount);
    return {
      book: state.book,
      chapter: state.chapter,
      partNum: partNum,
      totalParts: totalParts,
      verseCount: state.verseCount,
      range: range,
      coveredThrough: state.coveredThrough || 0,
      wordTarget: wordsForVerseBand(range),
    };
  }

  function auditVersePartition(totalVerses, totalParts) {
    var seen = {};
    var ranges = [];
    for (var p = 1; p <= totalParts; p++) {
      var r = getVerseRange(p, totalParts, totalVerses);
      ranges.push(r);
      for (var v = r.start; v <= r.end; v++) {
        if (seen[v]) return { ok: false, error: 'overlap at verse ' + v, ranges: ranges };
        seen[v] = true;
      }
    }
    for (var expect = 1; expect <= totalVerses; expect++) {
      if (!seen[expect]) return { ok: false, error: 'gap at verse ' + expect, ranges: ranges };
    }
    return { ok: true, ranges: ranges };
  }

  function augmentPartPrompt(basePrompt, partNum, state) {
    if (!state) return basePrompt;
    captureFullChapterText(state);
    var meta = buildPartMeta(partNum, state);
    if (state.contextShrink) {
      meta.wordTarget = Math.min(meta.wordTarget, SHRINK_WORD_TARGET);
    }
    var blocks = [
      '=== LOCAL SERMON ORCHESTRATION (overrides generic length padding) ===',
      buildVerseLedger(meta),
      '',
      buildHardVerseDiscipline(meta),
      '',
      buildEndingContract(meta),
      '',
      'LOCAL PART LENGTH: Aim for ~' +
        meta.wordTarget.toLocaleString() +
        ' words for this part (' +
        meta.range.count +
        ' verses). Quality and verse fidelity beat raw length — stop when the band is done.',
      '',
    ];
    if (partNum > 1) blocks.push(buildCompactContinuityBlock(state));
    if (state.contextShrink) {
      blocks.push(
        'CONTEXT SHRINK MODE: Prior attempt exceeded RunPod context. Keep this part shorter (~' +
          meta.wordTarget +
          ' words max). Tight paragraphs; no filler; finish the verse band and stop.\n'
      );
    }
    blocks.push('=== END LOCAL SERMON ORCHESTRATION ===\n\n');
    return blocks.join('\n') + compactBasePromptForLocalLlm(basePrompt);
  }

  function buildRetryPrompt(meta, reason, badSample) {
    var p =
      'LOCAL LLM REGENERATION REQUIRED — your previous attempt failed: ' +
      reason +
      '.\nDiscard that attempt. Follow the verse ledger exactly.\n\n';
    p += buildVerseLedger(meta) + '\n\n' + buildHardVerseDiscipline(meta) + '\n\n';
    if (/repetition|repeated|duplicate|loop/i.test(String(reason || ''))) {
      p +=
        'ANTI-LOOP (MANDATORY): Do NOT repeat the same sentence or paragraph. Do NOT reuse identical closing lines. ' +
        'Vary wording while keeping doctrine. Advance verse-by-verse — never paste the same block twice.\n\n';
    }
    if (/numeric|accuracy|273|263|1365|count|figure|drift|math|KJV figure/i.test(String(reason || ''))) {
      p +=
        'SCRIPTURE ACCURACY (MANDATORY): Use EXACT KJV counts, names, and amounts from the chapter excerpt — never guess or recalculate. ' +
        'If a verse gives a number in words (e.g. two hundred and threescore and thirteen = 273), use that exact figure.\n\n';
    }
    if (badSample) {
      p +=
        'FAILED OUTPUT EXCERPT (do not copy this structure):\n"' +
        String(badSample).slice(0, 600).replace(/"/g, "'") +
        '..."\n\n';
    }
    return p;
  }

  function normalizeWs(s) {
    return String(s || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function tailSlice(text, streaming) {
    var t = String(text || '');
    var maxChars = streaming ? 2200 : 4500;
    if (t.length <= maxChars) return t;
    return t.slice(-maxChars);
  }

  function detectTailSentenceLoop(tail) {
    var sentences = tail.match(/[^.!?]+[.!?]+/g) || [];
    if (sentences.length < 8) return null;
    var window = sentences.slice(-36);
    var freq = {};
    for (var i = 0; i < window.length; i++) {
      var key = normalizeWs(window[i]);
      if (key.length < 55) continue;
      freq[key] = (freq[key] || 0) + 1;
      if (freq[key] >= 4) {
        return { reason: 'same long sentence repeated four or more times near the end' };
      }
    }
    return null;
  }

  function detectConsecutiveTailRepeat(tail) {
    var norm = tail.replace(/\s+/g, ' ').trim();
    if (norm.length < 700) return null;
    var blockLen = Math.min(320, Math.max(140, Math.floor(norm.length / 4)));
    var block = norm.slice(-blockLen);
    if (block.length < 120) return null;
    var scan = norm.slice(-Math.min(2400, norm.length));
    var hits = 0;
    var idx = 0;
    while ((idx = scan.indexOf(block, idx)) !== -1) {
      hits++;
      if (hits >= 3) {
        return { reason: 'same closing block pasted multiple times in a row' };
      }
      idx += Math.max(1, Math.floor(blockLen * 0.85));
    }
    return null;
  }

  function detectDegeneration(text, opts) {
    opts = opts || {};
    var streaming = !!opts.streaming;
    var t = String(text || '');
    var minLen = streaming ? 3200 : 400;
    if (t.length < minLen) return null;

    var extendMatches = t.match(/\bExtend\s+\w+\s+amidst\s+\w+/gi) || [];
    if (extendMatches.length >= 3) {
      return { reason: 'repetitive "Extend X amidst Y" template loop' };
    }

    var tail = tailSlice(t, streaming);
    var paras = tail.split(/\n\n+/).map(function (p) {
      return p.trim();
    }).filter(function (p) {
      return p.length > 80;
    });
    if (paras.length >= 3) {
      var last = paras.slice(-5);
      for (var i = 0; i < last.length; i++) {
        for (var j = i + 1; j < last.length; j++) {
          if (normalizeWs(last[i]) === normalizeWs(last[j]) && last[i].length > 100) {
            return { reason: 'duplicate paragraph repeated near the end' };
          }
        }
      }
    }

    var sentences = tail.match(/[^.!?]+[.!?]+/g) || [];
    if (sentences.length >= 6) {
      var sentTail = sentences.slice(-10).map(normalizeWs);
      for (var a = 0; a < sentTail.length; a++) {
        var count = 0;
        for (var b = 0; b < sentTail.length; b++) {
          if (sentTail[b] === sentTail[a] && sentTail[a].length > 40) count++;
        }
        if (count >= 3) return { reason: 'same sentence repeated three or more times near the end' };
      }
    }

    var sentLoop = detectTailSentenceLoop(tail);
    if (sentLoop) return sentLoop;
    var chunkLoop = detectConsecutiveTailRepeat(tail);
    if (chunkLoop) return chunkLoop;

    return null;
  }

  function parseVerseNumbersInText(text, book, chapter) {
    var found = [];
    var ch = parseInt(chapter, 10);
    var bookEsc = String(book || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var re1 = new RegExp(bookEsc + '\\s+' + ch + '\\s*:\\s*(\\d{1,3})', 'gi');
    var re2 = new RegExp(bookEsc + '\\s+chapter\\s+' + ch + '\\s+verse[s]?\\s+(\\d{1,3})', 'gi');
    var re3 = /\bverse[s]?\s+(\d{1,3})\b/gi;
    var m;
    while ((m = re1.exec(text))) found.push(parseInt(m[1], 10));
    while ((m = re2.exec(text))) found.push(parseInt(m[1], 10));
    while ((m = re3.exec(text))) found.push(parseInt(m[1], 10));
    return found.filter(function (n) {
      return n > 0 && n < 200;
    });
  }

  function isCrossReferenceCue(text, idx) {
    var slice = String(text || '')
      .slice(Math.max(0, idx - 160), idx + 30)
      .toLowerCase();
    return /\b(compare|cross[- ]reference|cross reference|see also|as in|cf\.|echoes|turn to|look at|likewise in|remember in|parallel in)\b/.test(
      slice
    );
  }

  function isKjvNumberToken(w) {
    if (!w || w === 'and') return !!w;
    return kjvWordTokenValue(w) != null || w === 'thousand' || w === 'hundred';
  }

  function kjvWordTokenValue(w) {
    var map = {
      zero: 0,
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
      ten: 10,
      eleven: 11,
      twelve: 12,
      thirteen: 13,
      fourteen: 14,
      fifteen: 15,
      sixteen: 16,
      seventeen: 17,
      eighteen: 18,
      nineteen: 19,
      twenty: 20,
      thirty: 30,
      forty: 40,
      fifty: 50,
      sixty: 60,
      seventy: 70,
      eighty: 80,
      ninety: 90,
      score: 20,
      threescore: 60,
      fourscore: 80,
      twoscore: 40,
      fivescore: 100,
    };
    return map[w] != null ? map[w] : null;
  }

  function parseKjvNumberPhrase(phrase) {
    var t = String(phrase || '')
      .toLowerCase()
      .replace(/\b(a|an|the|and|of|apiece|by|poll|shekels?|shekel|gerahs?|males?|men|persons?|names?|years?|months?|days?|old|upward)\b/g, ' ')
      .replace(/[^a-z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!t) return null;
    var tokens = t.split(' ').filter(Boolean);
    var total = 0;
    var section = 0;
    for (var i = 0; i < tokens.length; i++) {
      var w = tokens[i];
      if (w === 'thousand') {
        if (section === 0) section = 1;
        total += section * 1000;
        section = 0;
        continue;
      }
      if (w === 'hundred') {
        if (section === 0) section = 1;
        total += section * 100;
        section = 0;
        continue;
      }
      var v = kjvWordTokenValue(w);
      if (v == null) continue;
      if (section > 0 && v < 10) section += v;
      else if (section > 0 && v >= 10 && v < 100) section += v;
      else section = v;
    }
    total += section;
    return total > 0 ? total : null;
  }

  function buildVerseTextMap(chapterText) {
    var map = {};
    if (!chapterText) return map;
    var lines = String(chapterText).split('\n');
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^(\d{1,3})\.\s*(.*)$/);
      if (m) map[parseInt(m[1], 10)] = m[2].trim();
    }
    return map;
  }

  function extractKjvNumberPhrases(text) {
    var words = String(text || '')
      .toLowerCase()
      .replace(/-/g, ' ')
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    var values = [];
    for (var i = 0; i < words.length; i++) {
      if (!isKjvNumberToken(words[i])) continue;
      var j = i;
      while (j < words.length) {
        if (words[j] === 'and') {
          j++;
          continue;
        }
        if (isKjvNumberToken(words[j])) {
          j++;
          continue;
        }
        break;
      }
      var phrase = words.slice(i, j).join(' ');
      var n = parseKjvNumberPhrase(phrase);
      if (n != null && n > 0) values.push(n);
      i = j - 1;
    }
    return values;
  }

  function extractNumbersFromKjvVerse(verseText) {
    var set = {};
    var t = String(verseText || '');
    var dm;
    var digitRe = /\b(\d{1,5})\b/g;
    while ((dm = digitRe.exec(t))) {
      var dn = parseInt(dm[1], 10);
      if (dn > 0) set[dn] = true;
    }
    var phrases = extractKjvNumberPhrases(t);
    for (var p = 0; p < phrases.length; p++) set[phrases[p]] = true;
    return set;
  }

  function extractDigitNumbers(text) {
    var out = [];
    var re = /\b(\d{2,5})\b/g;
    var m;
    while ((m = re.exec(String(text || '')))) {
      var n = parseInt(m[1], 10);
      if (n > 0) out.push({ n: n, index: m.index });
    }
    return out;
  }

  function extractWordNumbers(text) {
    var out = [];
    var t = String(text || '');
    var lower = t.toLowerCase();
    var words = lower.replace(/-/g, ' ').replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
    var charPos = 0;
    for (var i = 0; i < words.length; i++) {
      charPos = lower.indexOf(words[i], charPos);
      if (!isKjvNumberToken(words[i])) continue;
      var j = i;
      while (j < words.length) {
        if (words[j] === 'and') {
          j++;
          continue;
        }
        if (isKjvNumberToken(words[j])) {
          j++;
          continue;
        }
        break;
      }
      var phrase = words.slice(i, j).join(' ');
      var n = parseKjvNumberPhrase(phrase);
      if (n != null && n >= 10) out.push({ n: n, index: charPos >= 0 ? charPos : 0 });
      i = j - 1;
    }
    return out;
  }

  function verseNumberFromSpoken(token) {
    var ord = {
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
      ten: 10,
      eleven: 11,
      twelve: 12,
      thirteen: 13,
      fourteen: 14,
      fifteen: 15,
      sixteen: 16,
      seventeen: 17,
      eighteen: 18,
      nineteen: 19,
      twenty: 20,
      thirty: 30,
      forty: 40,
      fifty: 50,
    };
    var t = String(token || '').toLowerCase();
    if (ord[t] != null) return ord[t];
    var p = parseInt(t, 10);
    return p > 0 ? p : null;
  }

  function findVerseMentionAnchors(text, book, chapter) {
    var anchors = [];
    var t = String(text || '');
    var bookEsc = String(book || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var ch = parseInt(chapter, 10);
    var re1 = new RegExp(bookEsc + '\\s+' + ch + '\\s*:\\s*(\\d{1,3})', 'gi');
    var re2 = /\bverse[s]?\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|\d{1,3})\b/gi;
    var re3 = /\b(?:v|vs)\.?\s*(\d{1,3})\b/gi;
    var m;
    while ((m = re1.exec(t))) {
      anchors.push({ verse: parseInt(m[1], 10), index: m.index });
    }
    while ((m = re2.exec(t))) {
      var vn = verseNumberFromSpoken(m[1]);
      if (vn) anchors.push({ verse: vn, index: m.index });
    }
    while ((m = re3.exec(t))) {
      anchors.push({ verse: parseInt(m[1], 10), index: m.index });
    }
    return anchors;
  }

  function nearestCanonicalWrong(claimed, canonicalMap) {
    if (canonicalMap[claimed]) return null;
    var keys = Object.keys(canonicalMap)
      .map(function (k) {
        return parseInt(k, 10);
      })
      .filter(function (c) {
        return c >= 20;
      })
      .sort(function (a, b) {
        return b - a;
      });
    if (!keys.length) return null;
    var best = null;
    var bestDiff = 999999;
    for (var i = 0; i < keys.length; i++) {
      var c = keys[i];
      var diff = Math.abs(c - claimed);
      if (diff > 0 && diff <= 12 && diff < bestDiff) {
        bestDiff = diff;
        best = c;
      }
    }
    return best;
  }

  function validateChapterNumericAccuracy(text, meta, chapterText) {
    var errors = [];
    var verseMap = buildVerseTextMap(chapterText);
    if (!Object.keys(verseMap).length) return errors;

    var kjvByVerse = {};
    for (var vk in verseMap) {
      kjvByVerse[vk] = extractNumbersFromKjvVerse(verseMap[vk]);
    }

    var anchors = findVerseMentionAnchors(text, meta.book, meta.chapter);
    var seenKey = {};
    for (var a = 0; a < anchors.length; a++) {
      var anchor = anchors[a];
      if (anchor.verse < meta.range.start || anchor.verse > meta.range.end) continue;
      var canon = kjvByVerse[anchor.verse];
      if (!canon) continue;
      var windowText = String(text || '').slice(anchor.index, anchor.index + 1400);
      var nums = extractDigitNumbers(windowText).concat(extractWordNumbers(windowText));
      for (var n = 0; n < nums.length; n++) {
        var claimed = nums[n].n;
        if (claimed < 20) continue;
        var wrongFor = nearestCanonicalWrong(claimed, canon);
        if (wrongFor == null) continue;
        var key = anchor.verse + ':' + claimed + '->' + wrongFor;
        if (seenKey[key]) continue;
        seenKey[key] = true;
        errors.push(
          'Numbers ' +
            meta.chapter +
            ':' +
            anchor.verse +
            ' KJV figure is ' +
            wrongFor +
            ', not ' +
            claimed +
            ' (count/name/amount drift)'
        );
      }
    }

    var mulRe = /\b(\d{2,4})\s*[×x*]\s*(\d{1,2})\s*=?\s*(\d{3,5})\b/gi;
    var mm;
    while ((mm = mulRe.exec(String(text || '')))) {
      var a1 = parseInt(mm[1], 10);
      var a2 = parseInt(mm[2], 10);
      var product = parseInt(mm[3], 10);
      if (a2 === 5 && kjvByVerse[50] && kjvByVerse[50][1365] && product !== 1365) {
        var excessCanon = kjvByVerse[46] && kjvByVerse[46][273] ? 273 : null;
        if (excessCanon && a1 !== excessCanon) {
          errors.push(
            'Redemption math wrong: ' +
              a1 +
              ' × 5 = ' +
              product +
              ' but KJV Numbers 3:46 excess is ' +
              excessCanon +
              ' and 3:50 total is 1365 shekels'
          );
        }
      }
    }

    var tLower = String(text || '').toLowerCase();
    if (kjvByVerse[46] && kjvByVerse[46][273]) {
      if (
        (/\b263\b/.test(text) || /two hundred and sixty[- ]?three/.test(tLower)) &&
        /\b(?:redeem|excess|deficit|more than the levites|odd number|two hundred and threescore)\b/i.test(text)
      ) {
        errors.push('Numbers 3:46 excess firstborn count must be 273 (KJV), not 263');
      }
    }

    return errors;
  }

  function validateScriptureReferences(text, meta, opts) {
    var errors = [];
    var t = String(text || '');
    var book = meta.book;
    var ch = parseInt(meta.chapter, 10);
    var bookEsc = String(book).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    var wrongCh = new RegExp(bookEsc + '\\s+(?:chapter\\s+)?(\\d{1,3})\\s*:\\s*\\d+', 'gi');
    var wm;
    while ((wm = wrongCh.exec(t))) {
      var citedCh = parseInt(wm[1], 10);
      if (citedCh && citedCh !== ch && !isCrossReferenceCue(t, wm.index)) {
        errors.push(' cites ' + book + ' ' + citedCh + ' without clear cross-reference label (current chapter is ' + ch + ')');
        break;
      }
    }

    var wrongCh2 = new RegExp(bookEsc + '\\s+chapter\\s+(one|two|three|four|five|six|seven|eight|nine|ten|\\d+)', 'gi');
    var ord = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
    while ((wm = wrongCh2.exec(t))) {
      var token = wm[1].toLowerCase();
      var citedCh2 = ord[token] || parseInt(token, 10);
      if (citedCh2 && citedCh2 !== ch && !isCrossReferenceCue(t, wm.index)) {
        errors.push(' references ' + book + ' chapter ' + citedCh2 + ' as current exposition (assigned chapter ' + ch + ')');
        break;
      }
    }

    var nums = parseVerseNumbersInText(t, book, ch);
    var unlabeledOutOfBand = 0;
    var re3 = /\bverse[s]?\s+(\d{1,3})\b/gi;
    var vm;
    while ((vm = re3.exec(t))) {
      var vn = parseInt(vm[1], 10);
      if (vn >= meta.range.start && vn <= meta.range.end) continue;
      if (isCrossReferenceCue(t, vm.index)) continue;
      unlabeledOutOfBand++;
    }
    if (unlabeledOutOfBand >= 3) {
      errors.push(
        ' treats verses outside assigned band ' +
          meta.range.start +
          '-' +
          meta.range.end +
          ' as primary exposition (unlabeled verse references: ' +
          unlabeledOutOfBand +
          ')'
      );
    }

    opts = opts || {};
    var chapterText =
      opts.chapterText ||
      (opts.state && (opts.state.fullChapterText || global.currentChapterText)) ||
      global.currentChapterText ||
      '';
    if (chapterText && meta && meta.range) {
      var numErrs = validateChapterNumericAccuracy(text, meta, chapterText);
      for (var ne = 0; ne < numErrs.length; ne++) {
        if (errors.indexOf(numErrs[ne]) === -1) errors.push(numErrs[ne]);
      }
    }

    return { ok: errors.length === 0, errors: errors };
  }

  function extractTransitionPoint(text, meta) {
    var paras = String(text || '')
      .split(/\n\n+/)
      .map(function (p) {
        return p.trim();
      })
      .filter(Boolean);
    if (!paras.length) return '';
    var tail = paras[paras.length - 1];
    if (tail.length > 320) tail = tail.slice(-320);
    return 'After ' + refLabel(meta.book, meta.chapter, meta.range.end, meta.range.end) + ': ' + tail;
  }

  function extractBulletInsights(text, maxItems) {
    var lines = String(text || '')
      .split(/\n/)
      .map(function (l) {
        return l.trim();
      })
      .filter(function (l) {
        return l.length > 40 && l.length < 220 && /\b(verse|therefore|means|Levite|firstborn|covenant|charge|Nadab|Aaron)\b/i.test(l);
      });
    var out = [];
    for (var i = lines.length - 1; i >= 0 && out.length < maxItems; i--) {
      var line = lines[i];
      if (out.indexOf(line) === -1) out.unshift(line);
    }
    return out;
  }

  function updateStateAfterPart(state, partText, partNum) {
    if (!state) return state;
    var meta = buildPartMeta(partNum, state);
    state.coveredThrough = Math.max(state.coveredThrough || 0, meta.range.end);

    state.transitionPoint = extractTransitionPoint(partText, meta);
    var insights = extractBulletInsights(partText, 4);
    state.conclusions = (state.conclusions || []).concat(insights).slice(-6);
    state.doctrines = (state.doctrines || []).concat(insights.slice(0, 2)).slice(-5);
    return state;
  }

  function clampMaxTokensForPrompt(wantOut, promptCharLength) {
    if (!promptCharLength) return wantOut;
    var budget =
      effectiveContextTokens() - estimatePromptTokens(promptCharLength) - CONTEXT_SAFETY_TOKENS;
    if (budget < MIN_OUTPUT_BUDGET) budget = MIN_OUTPUT_BUDGET;
    return Math.min(wantOut, Math.min(SERMON_TOKEN_CEILING, budget));
  }

  function applyLocalBudgetParams(params, opts) {
    if (!params || !isLocalLlmProvider()) return params;
    opts = opts || {};
    var wantOut = params.max_tokens || SERMON_TOKEN_CEILING;
    if (typeof wantOut !== 'number' || wantOut < MIN_OUTPUT_BUDGET) wantOut = SERMON_TOKEN_CEILING;
    params.max_tokens = clampMaxTokensForPrompt(wantOut, opts.promptCharLength);
    params.temperature = params.temperature != null ? params.temperature : 0.7;
    params.top_p = params.top_p != null ? params.top_p : 0.8;
    params.top_k = params.top_k != null ? params.top_k : 20;
    params.min_p = params.min_p != null ? params.min_p : 0;
    params.repeat_penalty = params.repeat_penalty != null ? params.repeat_penalty : 1.08;
    return params;
  }

  function applyGenerationParams(params, partNum, state, opts) {
    if (!params || !state) return params;
    opts = opts || {};
    var meta = buildPartMeta(partNum, state);
    if (state.contextShrink) meta.wordTarget = Math.min(meta.wordTarget, SHRINK_WORD_TARGET);
    params.local_llm_sermon = true;
    var wantOut = maxTokensForWords(meta.wordTarget);
    params.max_tokens = clampMaxTokensForPrompt(wantOut, opts.promptCharLength);
    if (state.repetitionRetry) {
      params.temperature = 0.65;
      params.top_p = 0.8;
      params.repeat_penalty = 1.22;
    } else {
      params.temperature = 0.7;
      params.top_p = 0.8;
      params.repeat_penalty = 1.08;
    }
    params.top_k = 20;
    params.min_p = 0;
    return params;
  }

  /** RunPod-friendly verse band sizing (smaller parts → less context pressure). */
  function recommendedPartsForChapter(verseCount) {
    var vc = parseInt(verseCount, 10) || 0;
    if (vc <= 0) return 5;
    if (vc <= 8) return 2;
    if (vc <= 14) return 3;
    if (vc <= 22) return 4;
    return 5;
  }

  function shouldUseProfile() {
    return isChapterSermonContext();
  }

  function registerStreamAbort(key, controller) {
    if (!key || !controller) return;
    global.__forgeStreamAbortRegistry = global.__forgeStreamAbortRegistry || {};
    global.__forgeStreamAbortRegistry[key] = controller;
  }

  function abortStream(key) {
    if (!key || !global.__forgeStreamAbortRegistry) return false;
    var c = global.__forgeStreamAbortRegistry[key];
    if (c && !c.signal.aborted) {
      c.abort();
      return true;
    }
    return false;
  }

  function clearStreamAbort(key) {
    if (!key || !global.__forgeStreamAbortRegistry) return;
    delete global.__forgeStreamAbortRegistry[key];
  }

  var profile = {
    shouldUseProfile: shouldUseProfile,
    isChapterSermonContext: isChapterSermonContext,
    initSermonState: initSermonState,
    buildPartMeta: buildPartMeta,
    augmentPartPrompt: augmentPartPrompt,
    buildRetryPrompt: buildRetryPrompt,
    buildVerseLedger: buildVerseLedger,
    auditVersePartition: auditVersePartition,
    applyGenerationParams: applyGenerationParams,
    applyLocalBudgetParams: applyLocalBudgetParams,
    setEffectiveContextTokens: function (n) {
      if (typeof n === 'number' && n > 4096) global.__LOCAL_LLM_EFFECTIVE_CONTEXT = Math.floor(n);
    },
    detectDegeneration: detectDegeneration,
    validateScriptureReferences: validateScriptureReferences,
    updateStateAfterPart: updateStateAfterPart,
    registerStreamAbort: registerStreamAbort,
    abortStream: abortStream,
    clearStreamAbort: clearStreamAbort,
    maxTruncationContinuations: function () {
      return MAX_TRUNC_CONTINUATIONS;
    },
    maxRetries: function () {
      return MAX_LOCAL_LLM_RETRIES;
    },
    wordsForVerseBand: wordsForVerseBand,
    maxTokensForWords: maxTokensForWords,
    sermonTokenCeiling: function () {
      return SERMON_TOKEN_CEILING;
    },
    sliceChapterTextForBand: sliceChapterTextForBand,
    chapterTextOverrideForPart: chapterTextOverrideForPart,
    captureFullChapterText: captureFullChapterText,
    compactBasePromptForLocalLlm: compactBasePromptForLocalLlm,
    isContextSizeError: isContextSizeError,
    estimatePromptTokens: estimatePromptTokens,
    effectiveContextTokens: effectiveContextTokens,
    enableContextShrink: function (state) {
      if (state) state.contextShrink = true;
    },
    enableRepetitionRetry: function (state) {
      if (state) state.repetitionRetry = true;
    },
    recommendedPartsForChapter: recommendedPartsForChapter,
  };
  global.ForgeLocalSermonProfile = profile;
  global.ForgeBonsaiProfile = profile;
})(typeof window !== 'undefined' ? window : globalThis);
