/**
 * Global LLM provider selection: OpenRouter (default) vs OrcaRouter Local (RunPod).
 * Server keys stay on Vercel; client only sends provider id to /api/ai.
 */
(function (global) {
  var STORAGE_KEY = 'yahForgeLlmProvider';
  var LOCAL_MODEL_ID = 'local/orcarouter';
  var HEALTH_URL = '/api/local-llm-health';
  var lastHealth = { checkedAt: 0, ok: null, message: '' };

  var CATALOG_PROVIDERS = {
    openrouter: {
      label: 'OpenRouter',
      customLabel: 'Custom OpenRouter ID:',
      customPlaceholder: 'e.g. google/gemini-3-flash-preview',
      hint: 'OpenRouter + optional kie/... models via OPENROUTER_API_KEY and KIE_API_KEY.',
    },
    nanogpt: {
      label: 'NanoGPT',
      customLabel: 'Custom NanoGPT model ID:',
      customPlaceholder: 'Exact NanoGPT model ID',
      hint: 'NanoGPT — choose a model from its catalog or enter its exact model ID. Set NANOGPT_API_KEY in Vercel.',
    },
    opencode_go: {
      label: 'OpenCode Go',
      customLabel: 'Custom OpenCode Go model ID:',
      customPlaceholder: 'e.g. kimi-k3 or glm-5.3-flash',
      hint: 'OpenCode Go subscription — set OPENCODE_GO_API_KEY (or OPENCODE_API_KEY) in Vercel.',
    },
    clinepass: {
      label: 'ClinePass',
      customLabel: 'Custom ClinePass model slug:',
      customPlaceholder: 'e.g. cline-pass/kimi-k3',
      hint: 'ClinePass — use cline-pass/... slugs. Set CLINEPASS_API_KEY or CLINE_API_KEY in Vercel.',
    },
    refuseless: {
      label: 'Refuseless',
      customLabel: 'Custom Refuseless model ID:',
      customPlaceholder: 'e.g. glm-5.3-abliterated',
      hint: 'Refuseless abliterated lineup — set REFUSELESS_API_KEY in Vercel.',
    },
    local: {
      label: 'OrcaRouter Local',
      hint: 'OrcaRouter Local uses server env LOCAL_LLM_MODEL on your RunPod endpoint — no OpenRouter key. If RunPod is down, you will see "OrcaRouter Local offline" (no fallback).',
    },
  };

  function normalizeProviderId(v) {
    if (v === 'bonsai') return 'local';
    var s = String(v || '').trim().toLowerCase();
    if (CATALOG_PROVIDERS[s]) return s;
    return 'openrouter';
  }

  function isForgeCatalogLlmProvider(id) {
    var p = id != null ? normalizeProviderId(id) : getForgeLlmProvider();
    return p !== 'openrouter' && p !== 'local';
  }

  function getForgeLlmProvider() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      return normalizeProviderId(v === 'bonsai' ? 'local' : v);
    } catch (e) {}
    return 'openrouter';
  }

  function setForgeLlmProvider(id) {
    var previous = getForgeLlmProvider();
    var next = normalizeProviderId(id);
    if (next !== previous) {
      ['customYahChatModel', 'customModelInput'].forEach(function (inputId) {
        var input = document.getElementById(inputId);
        if (input) { input.value = ''; input.classList.remove('active-override'); }
      });
      ['yahChatModel', 'modelSelect'].forEach(function (selectId) {
        var el = document.getElementById(selectId); if (el) el.style.opacity = '1';
      });
      var chatModels = document.getElementById('yahChatModel');
      if (chatModels) {
        chatModels.innerHTML = '';
        var loading = document.createElement('option'); loading.value = ''; loading.textContent = 'Loading provider models...'; chatModels.appendChild(loading);
      }
    }
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
    var chatProvider = document.getElementById('yahChatProvider');
    if (chatProvider) chatProvider.value = getForgeLlmProvider();
    var chatLabel = document.getElementById('yahChatCustomModelLabel');
    var chatHint = document.getElementById('yahChatProviderHint');
    var chatCustom = document.getElementById('customYahChatModel');
    var provider = getForgeLlmProvider();
    var meta = CATALOG_PROVIDERS[provider] || CATALOG_PROVIDERS.openrouter;
    if (chatLabel) chatLabel.textContent = meta.customLabel || CATALOG_PROVIDERS.openrouter.customLabel;
    if (chatCustom) {
      chatCustom.placeholder = meta.customPlaceholder || CATALOG_PROVIDERS.openrouter.customPlaceholder;
      if (chatCustom.parentElement) chatCustom.parentElement.style.display = provider === 'local' ? 'none' : '';
    }
    if (chatHint) {
      chatHint.textContent = (provider !== 'openrouter' && provider !== 'local' ? meta.label + ' uses your server API key. ' : '') + 'Provider selection is shared with the sermon Forge.';
    }

    var hint = document.getElementById('forgeLlmProviderHint');
    var customRow = document.querySelector('.model-select-block .custom-model-row');
    var isLocal = provider === 'local';
    if (hint) hint.textContent = meta.hint || CATALOG_PROVIDERS.openrouter.hint;
    if (customRow) customRow.style.display = isLocal ? 'none' : '';
    updateVercelEnvKeysPanel(provider);
    updateLocalLlmHealthBadge(isLocal ? { ok: lastHealth.ok, error: lastHealth.message } : null);
  }

  function updateVercelEnvKeysPanel(provider) {
    var panel = document.getElementById('forgeVercelEnvKeysPanel');
    var active = document.getElementById('forgeVercelEnvKeysActive');
    if (!panel) return;
    var rows = panel.querySelectorAll('[data-forge-env-provider]');
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var match = row.getAttribute('data-forge-env-provider') === provider;
      row.style.background = match ? 'rgba(212,160,23,0.12)' : '';
      row.style.outline = match ? '1px solid var(--gold-dim)' : '';
    }
    if (active) {
      if (provider === 'opencode_go') {
        active.textContent = 'Selected: set OPENCODE_GO_API_KEY in Vercel, then redeploy.';
      } else if (provider === 'clinepass') {
        active.textContent = 'Selected: set CLINEPASS_API_KEY in Vercel (ClinePass models use cline-pass/... slugs), then redeploy.';
      } else if (provider === 'refuseless') {
        active.textContent = 'Selected: set REFUSELESS_API_KEY in Vercel, then redeploy.';
      } else {
        active.textContent = 'Optional: add keys above only for the subscription providers you use.';
      }
    }
    var chatEnv = document.getElementById('yahChatVercelEnvHint');
    if (chatEnv) {
      var envNames = {
        opencode_go: 'Vercel env: OPENCODE_GO_API_KEY (or OPENCODE_API_KEY)',
        clinepass: 'Vercel env: CLINEPASS_API_KEY (or CLINE_API_KEY)',
        refuseless: 'Vercel env: REFUSELESS_API_KEY',
      };
      if (envNames[provider]) {
        chatEnv.textContent = envNames[provider] + ' — add in Settings → Environment Variables, redeploy.';
        chatEnv.style.display = '';
      } else {
        chatEnv.textContent = '';
        chatEnv.style.display = 'none';
      }
    }
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
  global.isForgeCatalogLlmProvider = isForgeCatalogLlmProvider;
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
