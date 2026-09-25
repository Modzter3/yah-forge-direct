/**
 * Global LLM provider selection: OpenRouter (default) vs OrcaRouter Local (RunPod).
 * Server keys stay on Vercel; client only sends provider id to /api/ai.
 */
(function (global) {
  var STORAGE_KEY = 'yahForgeLlmProvider';
  var LOCAL_MODEL_ID = 'local/orcarouter';
  var HEALTH_URL = '/api/local-llm-health';
  var lastHealth = { checkedAt: 0, ok: null, message: '' };

  function normalizeProviderId(v) {
    if (v === 'bonsai') return 'local';
    return v === 'local' ? 'local' : 'openrouter';
  }

  function getForgeLlmProvider() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      return normalizeProviderId(v === 'bonsai' ? 'local' : v);
    } catch (e) {}
    return 'openrouter';
  }

  function setForgeLlmProvider(id) {
    var next = normalizeProviderId(id);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (e) {}
    syncProviderUi();
    refreshModelCatalogForProvider();
    if (next === 'local') checkLocalLlmHealth(true);
    if (typeof global.updatePartRecommendation === 'function') global.updatePartRecommendation();
  }

  function getLocalLlmModelId() {
    return LOCAL_MODEL_ID;
  }

  function getBonsaiModelId() {
    return getLocalLlmModelId();
  }

  function localLlmCatalogEntry() {
    return {
      id: LOCAL_MODEL_ID,
      name: 'OrcaRouter Local (env LOCAL_LLM_MODEL)',
      context_length: 65536,
      pricing: null,
    };
  }

  function fillAllSelectsWithLocalLlm() {
    var entry = localLlmCatalogEntry();
    var ids =
      global.FORGE_MODEL_SELECT_IDS ||
      [
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
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (!el || el.tagName !== 'SELECT') continue;
      el.innerHTML = '';
      var opt = document.createElement('option');
      opt.value = entry.id;
      opt.textContent = entry.name + ' (65536 ctx)';
      opt.selected = true;
      el.appendChild(opt);
    }
  }

  function refreshModelCatalogForProvider() {
    if (getForgeLlmProvider() === 'local') {
      fillAllSelectsWithLocalLlm();
      return Promise.resolve();
    }
    if (typeof global.hydrateForgeModelSelects === 'function') {
      return global.hydrateForgeModelSelects();
    }
    return Promise.resolve();
  }

  function updateLocalLlmHealthBadge(data) {
    var el = document.getElementById('localLlmHealthStatus') || document.getElementById('bonsaiHealthStatus');
    if (!el) return;
    if (getForgeLlmProvider() !== 'local') {
      el.textContent = '';
      el.style.display = 'none';
      return;
    }
    el.style.display = 'inline';
    if (data && data.ok) {
      el.textContent = 'OrcaRouter Local online';
      el.style.color = 'var(--accent-teal, #2D8B7A)';
    } else {
      el.textContent = data && data.error ? data.error : 'OrcaRouter Local offline';
      el.style.color = 'var(--crimson-glow, #C41E3A)';
    }
  }

  function checkLocalLlmHealth(force) {
    var now = Date.now();
    if (!force && now - lastHealth.checkedAt < 45000 && lastHealth.ok !== null) {
      updateLocalLlmHealthBadge({ ok: lastHealth.ok, error: lastHealth.message });
      return Promise.resolve(lastHealth);
    }
    return fetch(HEALTH_URL, { method: 'GET', cache: 'no-store' })
      .then(function (r) {
        return r.json().then(function (body) {
          return { status: r.status, body: body };
        });
      })
      .then(function (res) {
        var ok = !!(res.body && res.body.ok);
        lastHealth = {
          checkedAt: Date.now(),
          ok: ok,
          message: ok ? '' : (res.body && res.body.error) || 'OrcaRouter Local offline',
        };
        if (ok && res.body && res.body.maxContext && global.ForgeLocalSermonProfile) {
          global.ForgeLocalSermonProfile.setEffectiveContextTokens(res.body.maxContext);
        }
        updateLocalLlmHealthBadge({ ok: ok, error: lastHealth.message });
        return lastHealth;
      })
      .catch(function () {
        lastHealth = {
          checkedAt: Date.now(),
          ok: false,
          message: 'OrcaRouter Local offline: health check failed',
        };
        updateLocalLlmHealthBadge({ ok: false, error: lastHealth.message });
        return lastHealth;
      });
  }

  function checkBonsaiHealth(force) {
    return checkLocalLlmHealth(force);
  }

  function syncProviderUi() {
    var sel = document.getElementById('forgeLlmProvider');
    if (sel) sel.value = getForgeLlmProvider();
    var hint = document.getElementById('forgeLlmProviderHint');
    var customRow = document.querySelector('.model-select-block .custom-model-row');
    var isLocal = getForgeLlmProvider() === 'local';
    if (hint) {
      hint.textContent = isLocal
        ? 'OrcaRouter Local uses server env LOCAL_LLM_MODEL on your RunPod endpoint — no OpenRouter key. If RunPod is down, you will see "OrcaRouter Local offline" (no fallback).'
        : 'OpenRouter + optional kie/... models via OPENROUTER_API_KEY and KIE_API_KEY.';
    }
    if (customRow) customRow.style.display = isLocal ? 'none' : '';
    updateLocalLlmHealthBadge(isLocal ? { ok: lastHealth.ok, error: lastHealth.message } : null);
  }

  function onForgeLlmProviderChange() {
    var sel = document.getElementById('forgeLlmProvider');
    setForgeLlmProvider(sel ? sel.value : 'openrouter');
  }

  function patchOpenRouterHydrate() {
    if (global.__forgeLlmProviderPatched) return;
    global.__forgeLlmProviderPatched = true;
    var orig = global.hydrateForgeModelSelects;
    if (typeof orig !== 'function') return;
    global.hydrateForgeModelSelects = function () {
      if (getForgeLlmProvider() === 'local') {
        fillAllSelectsWithLocalLlm();
        return Promise.resolve();
      }
      return orig.apply(global, arguments);
    };
  }

  function initForgeLlmProvider() {
    patchOpenRouterHydrate();
    syncProviderUi();
    refreshModelCatalogForProvider();
    if (getForgeLlmProvider() === 'local') checkLocalLlmHealth(false);
    setInterval(function () {
      if (getForgeLlmProvider() === 'local') checkLocalLlmHealth(false);
    }, 60000);
  }

  global.getForgeLlmProvider = getForgeLlmProvider;
  global.setForgeLlmProvider = setForgeLlmProvider;
  global.getLocalLlmModelId = getLocalLlmModelId;
  global.getBonsaiModelId = getBonsaiModelId;
  global.onForgeLlmProviderChange = onForgeLlmProviderChange;
  global.checkLocalLlmHealth = checkLocalLlmHealth;
  global.checkBonsaiHealth = checkBonsaiHealth;
  global.refreshModelCatalogForProvider = refreshModelCatalogForProvider;
  global.initForgeLlmProvider = initForgeLlmProvider;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initForgeLlmProvider);
  } else {
    initForgeLlmProvider();
  }
})(typeof window !== 'undefined' ? window : globalThis);
