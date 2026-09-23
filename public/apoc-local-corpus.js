/**
 * Local apocrypha/sealed text — avoids web-search confusion for rare books.
 * Built-in: Book of Natasrym (Natsarim) from /corpus/book-of-natasrym.json
 * Optional: user override via localStorage (ForgeLocalCorpus.importJson).
 */
(function (global) {
  var CORPUS_URL = '/corpus/book-of-natasrym.json';
  var STORAGE_KEY = 'yahForgeLocalCorpusOverrides';
  var cache = null;
  var loadPromise = null;

  function normalizeBookName(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/[’']/g, "'")
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function bookMatches(corpusBook, aliases, requested) {
    var req = normalizeBookName(requested);
    if (!req) return false;
    var names = [corpusBook].concat(aliases || []);
    for (var i = 0; i < names.length; i++) {
      var n = normalizeBookName(names[i]);
      if (!n) continue;
      if (req === n || req.indexOf(n) !== -1 || n.indexOf(req) !== -1) return true;
    }
    if (req.indexOf('natsar') !== -1 || req.indexOf('natsarim') !== -1 || req.indexOf('kailedy') !== -1) {
      return true;
    }
    return false;
  }

  function readOverrides() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function writeOverrides(obj) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {}
  }

  function loadBuiltin() {
    if (cache) return Promise.resolve(cache);
    if (loadPromise) return loadPromise;
    loadPromise = fetch(CORPUS_URL)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        cache = data;
        return data;
      })
      .catch(function () {
        cache = null;
        return null;
      });
    return loadPromise;
  }

  function chapterKey(ch) {
    return String(parseInt(ch, 10));
  }

  function lookupInPayload(payload, chapter) {
    if (!payload || !payload.chapters) return null;
    var key = chapterKey(chapter);
    var text = payload.chapters[key];
    return text && String(text).trim() ? String(text).trim() : null;
  }

  function resolveLocalChapterText(book, chapter) {
    var ch = chapterKey(chapter);
    var overrides = readOverrides();
    var overrideBooks = overrides.books || {};
    for (var ob in overrideBooks) {
      if (!Object.prototype.hasOwnProperty.call(overrideBooks, ob)) continue;
      if (bookMatches(ob, overrideBooks[ob].aliases, book)) {
        var ot = lookupInPayload(overrideBooks[ob], ch);
        if (ot) {
          return Promise.resolve({
            text: ot,
            source: 'saved local corpus (' + ob + ')',
          });
        }
      }
    }
    return loadBuiltin().then(function (builtin) {
      if (!builtin || !bookMatches(builtin.book, builtin.aliases, book)) {
        return null;
      }
      var text = lookupInPayload(builtin, ch);
      if (!text) return null;
      return {
        text: text,
        source: 'built-in Book of Natasrym corpus',
      };
    });
  }

  function hasBuiltinNatasrym() {
    return loadBuiltin().then(function (b) {
      return !!(b && b.chapters);
    });
  }

  function importBookJson(json) {
    var data = typeof json === 'string' ? JSON.parse(json) : json;
    if (!data || !data.book || !data.chapters) {
      throw new Error('JSON must include book and chapters');
    }
    var overrides = readOverrides();
    if (!overrides.books) overrides.books = {};
    overrides.books[data.book] = {
      aliases: data.aliases || [],
      chapters: data.chapters,
      source: data.source || 'user import',
    };
    writeOverrides(overrides);
    return data.book;
  }

  function clearOverrides() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }

  global.ForgeLocalCorpus = {
    resolveLocalChapterText: resolveLocalChapterText,
    hasBuiltinNatasrym: hasBuiltinNatasrym,
    importBookJson: importBookJson,
    clearOverrides: clearOverrides,
    normalizeBookName: normalizeBookName,
  };
})(typeof window !== 'undefined' ? window : globalThis);
