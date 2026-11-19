/* OpenRouter TTS — replaces Poe @ElevenLabs bots for Read Aloud and podcast playback. */
(function (global) {
  'use strict';

  var DEFAULT_MODEL = 'fish-audio/s2.1-pro-free:free';
  var LEGACY_SLOW_MODEL = 'heygen/heygen-voice-1-turbo:free';
  var EXPRESSIVE_MODEL = 'elevenlabs/eleven-v3';
  var STORAGE_MODEL = 'yahForgeTtsModel';
  var STORAGE_EXPRESSIVE = 'yahForgeTtsExpressiveModel';
  var CHAR_LIMIT_EXPRESSIVE = 5000;
  var CHAR_LIMIT_STANDARD = 40000;
  var CHUNK_HEYGEN = 750;
  var CHUNK_FISH = 3500;
  var CHUNK_ELEVEN = 3500;

  function getConfiguredModels() {
    var base = DEFAULT_MODEL;
    var expressive = EXPRESSIVE_MODEL;
    try {
      var saved = localStorage.getItem(STORAGE_MODEL);
      if (saved && saved.trim()) {
        saved = saved.trim();
        if (saved === LEGACY_SLOW_MODEL || saved.indexOf('heygen/heygen-voice') === 0) {
          try { localStorage.setItem(STORAGE_MODEL, DEFAULT_MODEL); } catch (_) { /* ignore */ }
          base = DEFAULT_MODEL;
        } else base = saved;
      }
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
    if (model.indexOf('fish-audio/') === 0) return 'OpenRouter Fish Audio (MP3)';
    if (model.indexOf(':free') !== -1) return 'OpenRouter free TTS';
    if (model.indexOf('elevenlabs/') === 0) return 'OpenRouter ElevenLabs TTS';
    return model.split('/').pop() || 'OpenRouter TTS';
  }

  function chunkTargetForModel(model) {
    var id = String(model || '').toLowerCase();
    if (id.indexOf('fish-audio/') >= 0) return CHUNK_FISH;
    if (id.indexOf('heygen/') >= 0) return CHUNK_HEYGEN;
    if (id.indexOf('elevenlabs/') >= 0) return CHUNK_ELEVEN;
    return CHUNK_ELEVEN;
  }

  function chunkTextForTts(text, maxLen) {
    text = String(text || '').trim();
    if (!text || text.length <= maxLen) return [text];
    var parts = [];
    var sentences = text.match(/[^.!?\n]+(?:[.!?\n]+|$)|\S+/g) || [text];
    var buf = '';
    function flush() {
      if (buf.trim()) {
        parts.push(buf.trim());
        buf = '';
      }
    }
    sentences.forEach(function (piece) {
      var next = buf + piece;
      if (next.length > maxLen && buf) {
        flush();
        buf = piece;
      } else {
        buf = next;
      }
      while (buf.length > maxLen) {
        parts.push(buf.slice(0, maxLen).trim());
        buf = buf.slice(maxLen);
      }
    });
    flush();
    return parts.length ? parts : [text.slice(0, maxLen)];
  }

  function wrapPcm16LeMonoWav(pcm, sampleRate) {
    var pcmU8 = pcm instanceof Uint8Array ? pcm : new Uint8Array(pcm);
    var dataSize = pcmU8.length;
    var header = new ArrayBuffer(44);
    var view = new DataView(header);
    var writeStr = function (off, s) {
      var i;
      for (i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
    };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);
    var out = new Uint8Array(44 + dataSize);
    out.set(new Uint8Array(header), 0);
    out.set(pcmU8, 44);
    return new Blob([out], { type: 'audio/wav' });
  }

  function mergeAudioBlobs(blobs) {
    if (!blobs || !blobs.length) return Promise.reject(new Error('No audio returned'));
    if (blobs.length === 1) return Promise.resolve(blobs[0]);
    return Promise.all(blobs.map(function (b) { return b.arrayBuffer(); })).then(function (bufs) {
      var first = new Uint8Array(bufs[0]);
      var isMp3 = first[0] === 0xff && (first[1] & 0xe0) === 0xe0;
      if (isMp3) {
        var total = 0;
        var i;
        for (i = 0; i < bufs.length; i++) total += bufs[i].byteLength;
        var mp3Out = new Uint8Array(total);
        var off = 0;
        for (i = 0; i < bufs.length; i++) {
          mp3Out.set(new Uint8Array(bufs[i]), off);
          off += bufs[i].byteLength;
        }
        return new Blob([mp3Out], { type: 'audio/mpeg' });
      }
      var pcmParts = [];
      var pcmLen = 0;
      var j;
      for (j = 0; j < bufs.length; j++) {
        var u8 = new Uint8Array(bufs[j]);
        var pcm = u8.byteLength > 44 && u8[0] === 0x52 && u8[1] === 0x49 ? u8.slice(44) : u8;
        pcmParts.push(pcm);
        pcmLen += pcm.length;
      }
      var merged = new Uint8Array(pcmLen);
      var at = 0;
      for (j = 0; j < pcmParts.length; j++) {
        merged.set(pcmParts[j], at);
        at += pcmParts[j].length;
      }
      return wrapPcm16LeMonoWav(merged, 44100);
    });
  }

  function fetchTtsBlob(text, opts, model, expressive) {
    return fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text,
        voice: opts.uiVoice || opts.voice || 'Brian',
        expressive: expressive,
        model: model,
        instructions: opts.instructions || '',
      }),
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (body) {
          var msg = body;
          try { msg = JSON.parse(body).error || msg; } catch (_) { /* plain text */ }
          if (typeof msg === 'string' && msg.indexOf('FUNCTION_INVOCATION_TIMEOUT') >= 0) {
            throw new Error('TTS timed out. Long lines are split automatically — refresh and try again after deploy.');
          }
          throw new Error(msg || 'TTS request failed');
        });
      }
      return res.blob();
    });
  }

  function synthesize(opts) {
    opts = opts || {};
    var text = String(opts.text || '').trim();
    if (!text) return Promise.reject(new Error('No text to synthesize'));
    var expressive = !!opts.expressive;
    var limit = expressive ? CHAR_LIMIT_EXPRESSIVE : CHAR_LIMIT_STANDARD;
    if (text.length > limit) text = text.slice(0, limit);
    var model = opts.model || pickModel(expressive);
    var chunks = chunkTextForTts(text, chunkTargetForModel(model));
    function finish(blobs) {
      return mergeAudioBlobs(blobs).then(function (blob) {
        if (!blob || !blob.size) throw new Error('No audio returned');
        var url = URL.createObjectURL(blob);
        return {
          url: url,
          model: model,
          chunks: chunks.length,
          revoke: function () {
            try { URL.revokeObjectURL(url); } catch (_) { /* ignore */ }
          },
        };
      });
    }
    if (chunks.length === 1) {
      return fetchTtsBlob(chunks[0], opts, model, expressive).then(function (blob) {
        if (!blob || !blob.size) throw new Error('No audio returned');
        var url = URL.createObjectURL(blob);
        return {
          url: url,
          model: model,
          chunks: 1,
          revoke: function () {
            try { URL.revokeObjectURL(url); } catch (_) { /* ignore */ }
          },
        };
      });
    }
    var chain = Promise.resolve([]);
    chunks.forEach(function (chunk) {
      chain = chain.then(function (blobs) {
        return fetchTtsBlob(chunk, opts, model, expressive).then(function (blob) {
          if (!blob || !blob.size) throw new Error('No audio returned');
          blobs.push(blob);
          return blobs;
        });
      });
    });
    return chain.then(finish);
  }

  var api = {
    synthesize: synthesize,
    pickModel: pickModel,
    describeModel: describeModel,
    getConfiguredModels: getConfiguredModels,
    chunkTextForTts: chunkTextForTts,
    chunkTargetForModel: chunkTargetForModel,
    mergeAudioBlobs: mergeAudioBlobs,
    DEFAULT_MODEL: DEFAULT_MODEL,
    EXPRESSIVE_MODEL: EXPRESSIVE_MODEL,
    museTtsAvailable: false,
  };
  global.ForgeTts = api;
})(typeof window !== 'undefined' ? window : globalThis);