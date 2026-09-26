/**
 * Local scripture corpora — KJV Bible + apocrypha + sealed scrolls (+ Natasrym).
 * Optional: user override via localStorage (ForgeLocalCorpus.importJson).
 */
(function (global) {
  var NATASRYM_URL = '/corpus/book-of-natasrym.json';
  var KJV_DIR = '/corpus/kjv/';
  var KJV_MANIFEST_URL = KJV_DIR + 'manifest.json';
  var APOC_DIR = '/corpus/apocrypha/';
  var APOC_MANIFEST_URL = APOC_DIR + 'manifest.json';
  var SEALED_DIR = '/corpus/sealed/';
  var SEALED_MANIFEST_URL = SEALED_DIR + 'manifest.json';
  var STORAGE_KEY = 'yahForgeLocalCorpusOverrides';
  var natasrymCache = null;
  var natasrymLoadPromise = null;
  var kjvManifest = null;
  var kjvManifestPromise = null;
  var kjvBookCache = {};
  var apocManifest = null;
  var apocManifestPromise = null;
  var apocBookCache = {};
  var sealedManifest = null;
  var sealedManifestPromise = null;
  var sealedBookCache = {};

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

  function loadNatasrymBuiltin() {
    if (natasrymCache) return Promise.resolve(natasrymCache);
    if (natasrymLoadPromise) return natasrymLoadPromise;
    natasrymLoadPromise = fetch(NATASRYM_URL)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        natasrymCache = data;
        return data;
      })
      .catch(function () {
        natasrymCache = null;
        return null;
      });
    return natasrymLoadPromise;
  }

  function loadKjvManifest() {
    if (kjvManifest) return Promise.resolve(kjvManifest);
    if (kjvManifestPromise) return kjvManifestPromise;
    kjvManifestPromise = fetch(KJV_MANIFEST_URL)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        kjvManifest = data;
        return data;
      })
      .catch(function () {
        kjvManifest = null;
        return null;
      });
    return kjvManifestPromise;
  }

  function loadApocManifest() {
    if (apocManifest) return Promise.resolve(apocManifest);
    if (apocManifestPromise) return apocManifestPromise;
    apocManifestPromise = fetch(APOC_MANIFEST_URL)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        apocManifest = data;
        return data;
      })
      .catch(function () {
        apocManifest = null;
        return null;
      });
    return apocManifestPromise;
  }

  function loadSealedManifest() {
    if (sealedManifest) return Promise.resolve(sealedManifest);
    if (sealedManifestPromise) return sealedManifestPromise;
    sealedManifestPromise = fetch(SEALED_MANIFEST_URL)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        sealedManifest = data;
        return data;
      })
      .catch(function () {
        sealedManifest = null;
        return null;
      });
    return sealedManifestPromise;
  }

  function corpusFileForBook(book) {
    return String(book || '').replace(/\//g, '-') + '.json';
  }

  function loadCorpusBook(dir, cache, book) {
    var file = corpusFileForBook(book);
    if (cache[file]) return Promise.resolve(cache[file]);
    var url = dir + encodeURIComponent(file).replace(/%2F/g, '/');
    return fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        cache[file] = data;
        return data;
      })
      .catch(function () {
        return null;
      });
  }

  function loadKjvBook(book) {
    return loadCorpusBook(KJV_DIR, kjvBookCache, book);
  }

  function loadApocBook(book) {
    return loadCorpusBook(APOC_DIR, apocBookCache, book);
  }

  function loadSealedBook(book) {
    return loadCorpusBook(SEALED_DIR, sealedBookCache, book);
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

  function resolveKjvChapterText(book, chapter) {
    return loadKjvBook(book).then(function (payload) {
      if (!payload || !bookMatches(payload.book, payload.aliases, book)) {
        return null;
      }
      var text = lookupInPayload(payload, chapter);
      if (!text) return null;
      return {
        text: text,
        source: 'built-in KJV corpus',
      };
    });
  }

  function resolveFromCorpusDir(loadBookFn, label, book, chapter) {
    return loadBookFn(book).then(function (payload) {
      if (!payload || !bookMatches(payload.book, payload.aliases, book)) {
        return null;
      }
      var text = lookupInPayload(payload, chapter);
      if (!text) return null;
      return {
        text: text,
        source: 'built-in ' + label + ' corpus',
      };
    });
  }

  function resolveApocSealedChapterText(book, chapter, type) {
    var overrides = readOverrides();
    var overrideBooks = overrides.books || {};
    for (var ob in overrideBooks) {
      if (!Object.prototype.hasOwnProperty.call(overrideBooks, ob)) continue;
      if (bookMatches(ob, overrideBooks[ob].aliases, book)) {
        var ot = lookupInPayload(overrideBooks[ob], chapter);
        if (ot) {
          return Promise.resolve({
            text: ot,
            source: 'saved local corpus (' + ob + ')',
          });
        }
      }
    }

    if (type === 'sealed') {
      return resolveFromCorpusDir(loadSealedBook, 'sealed scroll', book, chapter).then(function (local) {
        if (local) return local;
        return resolveFromCorpusDir(loadApocBook, 'apocrypha', book, chapter);
      });
    }

    if (type === 'apocrypha') {
      return resolveFromCorpusDir(loadApocBook, 'apocrypha', book, chapter);
    }

    return resolveFromCorpusDir(loadApocBook, 'apocrypha', book, chapter).then(function (local) {
      if (local) return local;
      return loadNatasrymBuiltin().then(function (builtin) {
        if (!builtin || !bookMatches(builtin.book, builtin.aliases, book)) {
          return null;
        }
        var text = lookupInPayload(builtin, chapter);
        if (!text) return null;
        return {
          text: text,
          source: 'built-in Book of Natasrym corpus',
        };
      });
    });
  }

  function resolveChapterText(book, chapter, type) {
    if (type === 'bible') {
      return resolveKjvChapterText(book, chapter);
    }
    if (type === 'apocrypha' || type === 'sealed') {
      return resolveApocSealedChapterText(book, chapter, type);
    }
    return Promise.resolve(null);
  }

  /** @deprecated use resolveChapterText */
  function resolveLocalChapterText(book, chapter) {
    return resolveApocSealedChapterText(book, chapter, 'apocrypha');
  }

  function hasBuiltinNatasrym() {
    return loadNatasrymBuiltin().then(function (b) {
      return !!(b && b.chapters);
    });
  }

  function hasBuiltinKjv() {
    return loadKjvManifest().then(function (m) {
      return !!(m && m.totalBooks === 66);
    });
  }

  function hasBuiltinApocrypha() {
    return loadApocManifest().then(function (m) {
      return !!(m && m.totalBooks > 0);
    });
  }

  function hasBuiltinSealed() {
    return loadSealedManifest().then(function (m) {
      return !!(m && m.totalBooks > 0);
    });
  }

  function bookInManifest(manifest, bookName) {
    if (!manifest || !manifest.books) return false;
    var req = normalizeBookName(bookName);
    for (var i = 0; i < manifest.books.length; i++) {
      var entry = manifest.books[i];
      if (bookMatches(entry.book, [], bookName)) return true;
      if (normalizeBookName(entry.book) === req) return true;
    }
    return false;
  }

  function hasBuiltinChapterText(book, type) {
    type = type || 'apocrypha';
    if (type === 'bible') {
      return loadKjvManifest().then(function (m) {
        return bookInManifest(m, book);
      });
    }
    if (type === 'sealed') {
      return loadSealedManifest().then(function (m) {
        if (bookInManifest(m, book)) return true;
        return loadApocManifest().then(function (am) {
          return bookInManifest(am, book);
        });
      });
    }
    return loadApocManifest().then(function (m) {
      return bookInManifest(m, book);
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
    resolveChapterText: resolveChapterText,
    resolveKjvChapterText: resolveKjvChapterText,
    resolveLocalChapterText: resolveLocalChapterText,
    hasBuiltinNatasrym: hasBuiltinNatasrym,
    hasBuiltinKjv: hasBuiltinKjv,
    hasBuiltinApocrypha: hasBuiltinApocrypha,
    hasBuiltinSealed: hasBuiltinSealed,
    hasBuiltinChapterText: hasBuiltinChapterText,
    importBookJson: importBookJson,
    clearOverrides: clearOverrides,
    normalizeBookName: normalizeBookName,
  };
})(typeof window !== 'undefined' ? window : globalThis);
