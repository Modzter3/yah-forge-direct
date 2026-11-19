/* OpenRouter TTS — replaces Poe @ElevenLabs bots for Read Aloud and podcast playback. */
(function (global) {
  'use strict';

  var DEFAULT_MODEL = 'heygen/heygen-voice-1-turbo:free';
  var EXPRESSIVE_MODEL = 'elevenlabs/eleven-v3';
  var STORAGE_MODEL = 'yahForgeTtsModel';
  var STORAGE_EXPRESSIVE = 'yahForgeTtsExpressiveModel';
  var CHAR_LIMIT_EXPRESSIVE = 5000;
  var CHAR_LIMIT_STANDARD = 40000;

  function getConfiguredModels() {
    var base = DEFAULT_MODEL;
    var expressive = EXPRESSIVE_MODEL;
    try {
      var saved = localStorage.getItem(STORAGE_MODEL);
      if (saved && saved.trim()) base = saved.trim();
      var savedEx = localStorage.getItem(STORAGE_EXPRESSIVE);
      if (savedEx && savedEx.trim()) expressive = savedEx.trim();
    } catch (_) { /* ignore */ }
    return { base: base, expressive: expressive };
  }

  function pickModel(expressive) {
    var models = getConfiguredModels();
    return expressive ? models.expressive : models.base;
  }

  function describeModel(model) {
    if (!model) return 'OpenRouter TTS';
    if (model.indexOf(':free') !== -1) return 'OpenRouter free TTS';
    if (model.indexOf('elevenlabs/') === 0) return 'OpenRouter ElevenLabs TTS';
    return model.split('/').pop() || 'OpenRouter TTS';
  }

  function synthesize(opts) {
    opts = opts || {};
    var text = String(opts.text || '').trim();
    if (!text) return Promise.reject(new Error('No text to synthesize'));
    var expressive = !!opts.expressive;
    var limit = expressive ? CHAR_LIMIT_EXPRESSIVE : CHAR_LIMIT_STANDARD;
    if (text.length > limit) {
      text = text.slice(0, limit);
    }
    var model = opts.model || pickModel(expressive);
    return fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text,
        voice: opts.uiVoice || opts.voice || 'Brian',
        expressive: expressive,
        model: model,
        response_format: 'mp3',
        instructions: opts.instructions || '',
      }),
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (body) {
          var msg = body;
          try { msg = JSON.parse(body).error || msg; } catch (_) { /* plain text */ }
          throw new Error(msg || 'TTS request failed');
        });
      }
      return res.blob();
    }).then(function (blob) {
      if (!blob || !blob.size) throw new Error('No audio returned');
      var url = URL.createObjectURL(blob);
      return {
        url: url,
        model: model,
        revoke: function () {
          try { URL.revokeObjectURL(url); } catch (_) { /* ignore */ }
        },
      };
    });
  }

  var api = {
    synthesize: synthesize,
    pickModel: pickModel,
    describeModel: describeModel,
    getConfiguredModels: getConfiguredModels,
    DEFAULT_MODEL: DEFAULT_MODEL,
    EXPRESSIVE_MODEL: EXPRESSIVE_MODEL,
    museTtsAvailable: false,
  };
  global.ForgeTts = api;
})(typeof window !== 'undefined' ? window : globalThis);