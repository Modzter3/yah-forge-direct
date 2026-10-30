/**
 * Fetches live OpenRouter model list and fills every Forge model dropdown with real ids.
 * Prepends the full Kie.ai chat catalog (kie/...) so you can A/B against OpenRouter without switching providers.
 * Tabs: Sermon, Dismantle, Transcript, Destroy, News, Yah Chat, Bible/Apoc/Sealed fetch, Image prompts.
 * Falls back silently (keeps loading placeholder) if the catalog cannot be loaded.
 */
(function () {
  /** OpenRouter id — default for every Forge text model dropdown when catalog hydrates */
  window.FORGE_DEFAULT_TEXT_MODEL = 'google/gemini-3-flash-preview';
  window.getForgeDefaultTextModel = function () {
    return window.FORGE_DEFAULT_TEXT_MODEL || 'google/gemini-3-flash-preview';
  };

  var MODELS_URL = 'https://openrouter.ai/api/v1/models';
  // id -> true for models that advertise reasoning/thinking support. Filled from the live
  // catalog so the proxy only ever sends OpenRouter `reasoning` params to models that
  // actually accept them (119 of 456 catalog models do not).
  var reasoningIds = null;
  window.forgeModelSupportsReasoning = function (model) {
    if (!reasoningIds) return false;
    var id = String(model || '').trim().toLowerCase();
    if (!id) return false;
    if (reasoningIds[id] === true) return true;
    var base = id.replace(/:(free|batch|nitro|floor|extended|thinking|online)$/, '');
    return reasoningIds[base] === true;
  };
  var SERVER_CATALOG_URLS = {
    nanogpt: '/api/nanogpt-models',
    opencode_go: '/api/opencode-go-models',
    clinepass: '/api/clinepass-models',
    refuseless: '/api/refuseless-models',
  };
  var KIE_MODELS = (window.KIE_CHAT_MODELS && window.KIE_CHAT_MODELS.length)
    ? window.KIE_CHAT_MODELS
    : [{ id: 'kie/gpt-6-astra', name: 'GPT-6 Astra via Kie', context_length: 1050000, pricing: { prompt: '0.0000028', completion: '0.000014' } }];

  window.FORGE_MODEL_SELECT_IDS = [
    'modelSelect',
    'scriptureFetchModel',
    'apocFetchModel',
    'sealedFetchModel',
    'dismantleModel',
    'transcriptModel',
    'destroyModel',
    'yahChatModel',
    'newsModel',
    'imagePromptModel',
    'visualBeatModel',
  ];
  var SELECT_IDS = window.FORGE_MODEL_SELECT_IDS;

  function providerFromId(id) {
    var i = String(id || '').indexOf('/');
    return i === -1 ? 'other' : id.slice(0, i);
  }

  function prettyProvider(slug) {
    if (!slug) return 'Other';
    if (slug === 'kie') return 'Kie (discount)';
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

  /** OpenRouter: pricing.prompt / .completion are USD per token → $ per 1M tokens */
  function usdPer1M(tokenPriceStr) {
    var n = parseFloat(tokenPriceStr, 10);
    if (!isFinite(n) || n < 0) return null;
    return n * 1e6;
  }

  function fmtUsdPer1M(x) {
    if (x === null || !isFinite(x)) return '';
    if (x === 0) return '0';
    if (x < 0.0001) return x.toExponential(1);
    if (x < 0.01) return x.toFixed(4);
    if (x < 1) return x.toFixed(3);
    if (x < 100) return x.toFixed(2);
    return x.toFixed(1);
  }

  function pricingPer1mLabel(mo) {
    var p = mo.pricing;
    if (!p) return '';
    var in1m = usdPer1M(p.prompt);
    var out1m = usdPer1M(p.completion);
    if (in1m === null && out1m === null) return '';
    var si = in1m !== null ? fmtUsdPer1M(in1m) : '?';
    var so = out1m !== null ? fmtUsdPer1M(out1m) : '?';
    return 'in $' + si + ' / out $' + so + ' per 1M tok';
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
      if (a === 'kie') return -1;
      if (b === 'kie') return 1;
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
        var ctxStr = '';
        if (mo.context_length) {
          ctxStr = mo.context_length >= 1000
            ? Math.round(mo.context_length / 1000) + 'k ctx'
            : mo.context_length + ' ctx';
        }
        var priceStr = pricingPer1mLabel(mo);
        var meta = [];
        if (ctxStr) meta.push(ctxStr);
        if (priceStr) meta.push(priceStr);
        if (meta.length) label += ' (' + meta.join(' · ') + ')';
        opt.textContent = label;
        og.appendChild(opt);
      }
      frag.appendChild(og);
    }
    return frag;
  }

  function preferredDefault(models, catalogProvider) {
    var want = [
      window.getForgeDefaultTextModel(),
      'kie/gemini-3-flash',
      'google/gemini-3.6-flash',
      'google/gemini-2.5-flash',
      'google/gemini-2.5-pro',
      'upstage/solar-pro4',
      'anthropic/claude-sonnet-4',
      'anthropic/claude-opus-4',
      'openai/gpt-4.1',
    ];
    if (catalogProvider === 'opencode_go') {
      want = ['kimi-k3', 'glm-5.3-flash', 'deepseek-v4.1-flash'].concat(want);
    } else if (catalogProvider === 'clinepass') {
      want = ['cline-pass/kimi-k3', 'cline-pass/glm-5.3', 'cline-pass/deepseek-v4.1-flash'].concat(want);
    } else if (catalogProvider === 'refuseless') {
      want = ['glm-5.3-abliterated', 'glm-5.3-flash-abliterated'].concat(want);
    }
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

  function restoreOrDefault(selectEl, prevValue, models, flashBias, catalogProvider) {
    if (!selectEl) return;
    if (prevValue) {
      for (var i = 0; i < selectEl.options.length; i++) {
        if (selectEl.options[i].value === prevValue) {
          selectEl.value = prevValue;
          return;
        }
      }
    }
    var def = preferredDefault(models, catalogProvider);
    if (flashBias) {
      var flashWant = window.getForgeDefaultTextModel();
      for (var k = 0; k < models.length; k++) {
        if (models[k].id === flashWant) {
          def = flashWant;
          break;
        }
      }
      if (def !== flashWant) {
        for (var k2 = 0; k2 < models.length; k2++) {
          var mid = models[k2].id || '';
          if (mid.indexOf('gemini') !== -1 && mid.indexOf('flash') !== -1 && mid.indexOf('preview') !== -1) {
            def = mid;
            break;
          }
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

  function fillSelect(selectId, models, flashBias, catalogProvider) {
    var el = document.getElementById(selectId);
    if (!el || el.tagName !== 'SELECT') return;
    var prev = el.value;
    el.innerHTML = '';
    el.appendChild(buildGroupedOptions(models));
    restoreOrDefault(el, prev, models, flashBias, catalogProvider);
  }

  function catalogProviderLabel(provider) {
    if (provider === 'nanogpt') return 'NanoGPT';
    if (provider === 'opencode_go') return 'OpenCode Go';
    if (provider === 'clinepass') return 'ClinePass';
    if (provider === 'refuseless') return 'Refuseless';
    return provider;
  }

  function hydrateOpenRouterCatalog() {
    var provider = typeof window.getForgeLlmProvider === 'function' ? window.getForgeLlmProvider() : 'openrouter';
    var url = SERVER_CATALOG_URLS[provider] || MODELS_URL;
    var usesServerCatalog = !!SERVER_CATALOG_URLS[provider];
    return fetch(url)
      .then(function (r) {
        if (!r.ok) return r.json().catch(function(){return {};}).then(function(body){throw new Error(body.error || 'HTTP ' + r.status);});
        return r.json();
      })
      .then(function (data) {
        if (typeof window.getForgeLlmProvider === 'function' && window.getForgeLlmProvider() !== provider) return;
        var models = (data.data || []).slice();
        for (var k = 0; !usesServerCatalog && k < KIE_MODELS.length; k++) models.unshift(KIE_MODELS[k]);
        if (!models.length) throw new Error('empty catalog');

        reasoningIds = {};
        for (var ri = 0; ri < models.length; ri++) {
          var sp = models[ri] && models[ri].supported_parameters;
          if (sp && typeof sp.indexOf === 'function' && sp.indexOf('reasoning') !== -1) {
            reasoningIds[String(models[ri].id || '').toLowerCase()] = true;
          }
        }

        for (var s = 0; s < SELECT_IDS.length; s++) {
          var id = SELECT_IDS[s];
          var flash = id === 'scriptureFetchModel' || id === 'apocFetchModel' || id === 'sealedFetchModel';
          fillSelect(id, models, flash, usesServerCatalog ? provider : null);
        }

        if (typeof window.updateNewsSearchNote === 'function') window.updateNewsSearchNote();
        if (typeof window.hydrateKieMediaSelects === 'function') window.hydrateKieMediaSelects();
      })
      .catch(function (err) {
        console.warn('[openrouter-models]', err.message || err);
        if (typeof window.getForgeLlmProvider === 'function' && window.getForgeLlmProvider() !== provider) return;
        if (usesServerCatalog) {
          for (var i = 0; i < SELECT_IDS.length; i++) {
            var el = document.getElementById(SELECT_IDS[i]);
            if (el) {
              el.innerHTML = '';
              var opt = document.createElement('option');
              opt.value = '';
              opt.textContent = catalogProviderLabel(provider) + ' catalog unavailable — enter a custom model ID';
              el.appendChild(opt);
            }
          }
          if (typeof window.showToast === 'function') {
            window.showToast(catalogProviderLabel(provider) + ': ' + err.message);
          }
          return;
        }
        fillSelectsWithKieOnly();
      });
  }

  window.hydrateForgeModelSelects = hydrateOpenRouterCatalog;

  function fillSelectsWithKieOnly() {
    for (var s = 0; s < SELECT_IDS.length; s++) {
      fillSelect(SELECT_IDS[s], KIE_MODELS.slice(), false);
    }
    if (typeof window.hydrateKieMediaSelects === 'function') window.hydrateKieMediaSelects();
  }
})();
