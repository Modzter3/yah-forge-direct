/**
 * Fetches live OpenRouter model list and fills Forge dropdowns with real ids.
 * Falls back silently (keeps static options) if the catalog cannot be loaded.
 */
(function () {
  var MODELS_URL = 'https://openrouter.ai/api/v1/models';

  var SELECT_IDS = [
    'modelSelect',
    'scriptureFetchModel',
    'apocFetchModel',
    'sealedFetchModel',
    'dismantleModel',
    'newsModel',
    'imagePromptModel',
  ];

  function providerFromId(id) {
    var i = String(id || '').indexOf('/');
    return i === -1 ? 'other' : id.slice(0, i);
  }

  function prettyProvider(slug) {
    if (!slug) return 'Other';
    return slug.replace(/-/g, ' ').replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
  }

  function sortModels(arr) {
    return arr.slice().sort(function (a, b) {
      var ca = a.context_length || 0;
      var cb = b.context_length || 0;
      if (cb !== ca) return cb - ca;
      var ta = a.created || 0;
      var tb = b.created || 0;
      if (tb !== ta) return tb - ta;
      var na = (a.name || a.id || '').toLowerCase();
      var nb = (b.name || b.id || '').toLowerCase();
      return na < nb ? -1 : na > nb ? 1 : 0;
    });
  }

  function buildGroupedOptions(models) {
    var byProv = {};
    for (var i = 0; i < models.length; i++) {
      var m = models[i];
      if (!m || !m.id) continue;
      var p = providerFromId(m.id);
      if (!byProv[p]) byProv[p] = [];
      byProv[p].push(m);
    }
    var provs = Object.keys(byProv).sort(function (a, b) {
      return a.toLowerCase().localeCompare(b.toLowerCase());
    });
    var frag = document.createDocumentFragment();
    for (var pi = 0; pi < provs.length; pi++) {
      var pkey = provs[pi];
      var list = sortModels(byProv[pkey]);
      var og = document.createElement('optgroup');
      og.label = prettyProvider(pkey) + ' — ' + list.length;
      for (var li = 0; li < list.length; li++) {
        var mo = list[li];
        var opt = document.createElement('option');
        opt.value = mo.id;
        var label = mo.name || mo.id;
        if (mo.context_length)
          label += ' (' + (mo.context_length >= 1000
            ? Math.round(mo.context_length / 1000) + 'k ctx'
            : mo.context_length + ' ctx') + ')';
        opt.textContent = label;
        og.appendChild(opt);
      }
      frag.appendChild(og);
    }
    return frag;
  }

  function preferredDefault(models) {
    var want = [
      'google/gemini-2.5-pro',
      'google/gemini-2.5-flash',
      'anthropic/claude-sonnet-4',
      'anthropic/claude-opus-4',
      'openai/gpt-4.1',
    ];
    for (var w = 0; w < want.length; w++) {
      for (var i = 0; i < models.length; i++) {
        if (models[i].id === want[w]) return want[w];
      }
    }
    for (var j = 0; j < models.length; j++) {
      if (models[j].id && models[j].id.indexOf('/') !== -1) return models[j].id;
    }
    return '';
  }

  function restoreOrDefault(selectEl, prevValue, models, flashBias) {
    if (!selectEl) return;
    if (prevValue) {
      for (var i = 0; i < selectEl.options.length; i++) {
        if (selectEl.options[i].value === prevValue) {
          selectEl.value = prevValue;
          return;
        }
      }
    }
    var def = preferredDefault(models);
    if (flashBias) {
      for (var k = 0; k < models.length; k++) {
        if (models[k].id && models[k].id.indexOf('gemini') !== -1 && models[k].id.indexOf('flash') !== -1) {
          def = models[k].id;
          break;
        }
      }
    }
    if (def) {
      for (var j = 0; j < selectEl.options.length; j++) {
        if (selectEl.options[j].value === def) {
          selectEl.value = def;
          return;
        }
      }
    }
    if (selectEl.options.length) selectEl.selectedIndex = 0;
  }

  function fillSelect(selectId, models, flashBias) {
    var el = document.getElementById(selectId);
    if (!el || el.tagName !== 'SELECT') return;
    var prev = el.value;
    el.innerHTML = '';
    el.appendChild(buildGroupedOptions(models));
    restoreOrDefault(el, prev, models, flashBias);
  }

  window.hydrateForgeModelSelects = function () {
    return fetch(MODELS_URL)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        var models = data.data || [];
        if (!models.length) throw new Error('empty catalog');

        for (var s = 0; s < SELECT_IDS.length; s++) {
          var id = SELECT_IDS[s];
          var flash = id === 'scriptureFetchModel' || id === 'apocFetchModel' || id === 'sealedFetchModel';
          fillSelect(id, models, flash);
        }

        if (typeof window.updateNewsSearchNote === 'function') window.updateNewsSearchNote();
      })
      .catch(function (err) {
        console.warn('[openrouter-models]', err.message || err);
      });
  };
})();
