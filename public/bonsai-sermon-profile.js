/**
 * Bonsai-only multi-part sermon orchestration (OpenRouter unchanged).
 */
(function (global) {
  var WORD_MIN = 1800;
  var WORD_TARGET = 2200;
  var WORD_MAX = 2800;
  var MAX_BONSAI_RETRIES = 1;
  var MAX_TRUNC_CONTINUATIONS = 1;

  function isBonsaiProvider() {
    try {
      return typeof global.getForgeLlmProvider === 'function' && global.getForgeLlmProvider() === 'bonsai';
    } catch (e) {
      return false;
    }
  }

  function isChapterSermonContext() {
    if (!isBonsaiProvider()) return false;
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

  function buildVerseLedger(meta) {
    var coveredEnd = meta.coveredThrough || 0;
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
    ];
    return lines.join('\n');
  }

  function buildHardVerseDiscipline(meta) {
    return (
      'HARD VERSE DISCIPLINE (BONSAI — MANDATORY):\n' +
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
      '- Cross-references must NOT replace progression through the assigned verses.\n'
    );
  }

  function buildEndingContract(meta) {
    var p = 'NATURAL PART ENDING (BONSAI):\n';
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
    return Math.min(4096, Math.max(1024, Math.ceil(words * 1.45)));
  }

  function initSermonState() {
    if (!isChapterSermonContext()) return null;
    var src = global.currentChapterSource;
    return {
      book: src.book,
      chapter: src.chapter,
      totalParts: global.selectedPartCount,
      verseCount: global.currentChapterVerseCount,
      coveredThrough: 0,
      conclusions: [],
      doctrines: [],
      transitionPoint: '',
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
      range: range,
      coveredThrough: state.coveredThrough || 0,
      wordTarget: wordsForVerseBand(range),
    };
  }

  function augmentPartPrompt(basePrompt, partNum, state) {
    if (!state) return basePrompt;
    var meta = buildPartMeta(partNum, state);
    var blocks = [
      '=== BONSAI SERMON ORCHESTRATION (overrides generic length padding) ===',
      buildVerseLedger(meta),
      '',
      buildHardVerseDiscipline(meta),
      '',
      buildEndingContract(meta),
      '',
      'BONSAI PART LENGTH: Aim for ~' +
        meta.wordTarget.toLocaleString() +
        ' words for this part (' +
        meta.range.count +
        ' verses). Quality and verse fidelity beat raw length — stop when the band is done.',
      '',
    ];
    if (partNum > 1) blocks.push(buildCompactContinuityBlock(state));
    blocks.push('=== END BONSAI ORCHESTRATION ===\n\n');
    return blocks.join('\n') + basePrompt;
  }

  function buildRetryPrompt(meta, reason, badSample) {
    var p =
      'BONSAI REGENERATION REQUIRED — your previous attempt failed: ' +
      reason +
      '.\nDiscard that attempt. Follow the verse ledger exactly.\n\n';
    p += buildVerseLedger(meta) + '\n\n' + buildHardVerseDiscipline(meta) + '\n\n';
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

  function detectDegeneration(text) {
    var t = String(text || '');
    if (t.length < 400) return null;

    var extendMatches = t.match(/\bExtend\s+\w+\s+amidst\s+\w+/gi) || [];
    if (extendMatches.length >= 3) {
      return { reason: 'repetitive "Extend X amidst Y" template loop' };
    }

    var paras = t.split(/\n\n+/).map(function (p) {
      return p.trim();
    }).filter(function (p) {
      return p.length > 80;
    });
    if (paras.length >= 3) {
      var last = paras.slice(-6);
      for (var i = 0; i < last.length; i++) {
        for (var j = i + 1; j < last.length; j++) {
          if (normalizeWs(last[i]) === normalizeWs(last[j]) && last[i].length > 100) {
            return { reason: 'duplicate paragraph repeated' };
          }
        }
      }
    }

    var sentences = t.match(/[^.!?]+[.!?]+/g) || [];
    if (sentences.length >= 6) {
      var tail = sentences.slice(-8).map(normalizeWs);
      for (var a = 0; a < tail.length; a++) {
        var count = 0;
        for (var b = 0; b < tail.length; b++) {
          if (tail[b] === tail[a] && tail[a].length > 40) count++;
        }
        if (count >= 3) return { reason: 'same sentence repeated three or more times' };
      }
    }

    var triGramCounts = {};
    var words = t.toLowerCase().replace(/[^a-z0-9\s']/g, ' ').split(/\s+/).filter(Boolean);
    for (var w = 0; w < words.length - 5; w++) {
      var phrase = words.slice(w, w + 6).join(' ');
      triGramCounts[phrase] = (triGramCounts[phrase] || 0) + 1;
      if (triGramCounts[phrase] >= 4 && phrase.length > 25) {
        return { reason: 'excessive repeated phrase sequence' };
      }
    }

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

  function validateScriptureReferences(text, meta) {
    var errors = [];
    var t = String(text || '');
    var book = meta.book;
    var ch = parseInt(meta.chapter, 10);
    var bookEsc = String(book).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    var wrongCh = new RegExp(bookEsc + '\\s+(?:chapter\\s+)?(\\d{1,3})\\s*:\\s*\\d+', 'gi');
    var wm;
    while ((wm = wrongCh.exec(t))) {
      var citedCh = parseInt(wm[1], 10);
      if (citedCh && citedCh !== ch && !/cross[- ]reference/i.test(t.slice(Math.max(0, wm.index - 80), wm.index + 40))) {
        errors.push(' cites ' + book + ' ' + citedCh + ' without clear cross-reference label (current chapter is ' + ch + ')');
        break;
      }
    }

    var wrongCh2 = new RegExp(bookEsc + '\\s+chapter\\s+(one|two|three|four|five|six|seven|eight|nine|ten|\\d+)', 'gi');
    var ord = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
    while ((wm = wrongCh2.exec(t))) {
      var token = wm[1].toLowerCase();
      var citedCh2 = ord[token] || parseInt(token, 10);
      if (citedCh2 && citedCh2 !== ch && !/cross[- ]reference/i.test(t.slice(Math.max(0, wm.index - 80), wm.index + 40))) {
        errors.push(' references ' + book + ' chapter ' + citedCh2 + ' as current exposition (assigned chapter ' + ch + ')');
        break;
      }
    }

    var nums = parseVerseNumbersInText(t, book, ch);
    var outOfBand = nums.filter(function (n) {
      return n < meta.range.start || n > meta.range.end;
    });
    if (outOfBand.length >= 3) {
      errors.push(
        ' treats verses outside assigned band ' +
          meta.range.start +
          '-' +
          meta.range.end +
          ' as primary exposition (e.g. verse ' +
          outOfBand.slice(0, 3).join(', ') +
          ')'
      );
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
    var nums = parseVerseNumbersInText(partText, meta.book, meta.chapter);
    var maxInBand = meta.range.start - 1;
    for (var i = 0; i < nums.length; i++) {
      if (nums[i] >= meta.range.start && nums[i] <= meta.range.end && nums[i] > maxInBand) {
        maxInBand = nums[i];
      }
    }
    if (maxInBand >= meta.range.start) state.coveredThrough = Math.max(state.coveredThrough || 0, maxInBand);
    else state.coveredThrough = Math.max(state.coveredThrough || 0, meta.range.end);

    state.transitionPoint = extractTransitionPoint(partText, meta);
    var insights = extractBulletInsights(partText, 4);
    state.conclusions = (state.conclusions || []).concat(insights).slice(-6);
    state.doctrines = (state.doctrines || []).concat(insights.slice(0, 2)).slice(-5);
    return state;
  }

  function applyGenerationParams(params, partNum, state) {
    if (!params || !state) return params;
    var meta = buildPartMeta(partNum, state);
    params.bonsai_sermon = true;
    params.max_tokens = maxTokensForWords(meta.wordTarget);
    params.temperature = 0.8;
    params.top_p = 0.9;
    params.top_k = 20;
    params.repeat_penalty = 1.1;
    params.frequency_penalty = 0;
    params.presence_penalty = 0;
    return params;
  }

  function shouldUseProfile() {
    return isChapterSermonContext();
  }

  global.ForgeBonsaiProfile = {
    shouldUseProfile: shouldUseProfile,
    isChapterSermonContext: isChapterSermonContext,
    initSermonState: initSermonState,
    buildPartMeta: buildPartMeta,
    augmentPartPrompt: augmentPartPrompt,
    buildRetryPrompt: buildRetryPrompt,
    buildVerseLedger: buildVerseLedger,
    applyGenerationParams: applyGenerationParams,
    detectDegeneration: detectDegeneration,
    validateScriptureReferences: validateScriptureReferences,
    updateStateAfterPart: updateStateAfterPart,
    maxTruncationContinuations: function () {
      return MAX_TRUNC_CONTINUATIONS;
    },
    maxRetries: function () {
      return MAX_BONSAI_RETRIES;
    },
    wordsForVerseBand: wordsForVerseBand,
  };
})(typeof window !== 'undefined' ? window : globalThis);
