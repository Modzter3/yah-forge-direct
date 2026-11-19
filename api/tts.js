/**
 * OpenRouter text-to-speech proxy (no Poe).
 * POST /api/tts  { text, voice, expressive?, model?, response_format? }
 */
export const config = { runtime: 'edge' };

const SPEECH_URL = 'https://openrouter.ai/api/v1/audio/speech';
const DEFAULT_MODEL = process.env.FORGE_TTS_MODEL || 'heygen/heygen-voice-1-turbo:free';
const EXPRESSIVE_MODEL = process.env.FORGE_TTS_EXPRESSIVE_MODEL || 'elevenlabs/eleven-v3';
const MAX_CHARS = 12000;

const HEYGEN = {
  Brian: 'gareth', George: 'bram', Will: 'vincent', Jessica: 'nadine', Lily: 'tabitha', River: 'weston',
};
const ELEVEN = {
  Brian: 'brian', George: 'george', Will: 'will', Jessica: 'jessica', Lily: 'lily', River: 'river',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405);
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return jsonError('Missing OPENROUTER_API_KEY. Add it in Vercel environment variables, then redeploy.', 500);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const text = String(body.text || body.input || '').trim();
  if (!text) return jsonError('Missing text', 400);

  const expressive = !!body.expressive;
  const model = String(body.model || '').trim() || (expressive ? EXPRESSIVE_MODEL : DEFAULT_MODEL);
  const uiVoice = String(body.voice || body.uiVoice || 'Brian').trim();
  const voice = resolveVoice(model, uiVoice);
  const input = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
  const responseFormat = pickResponseFormat(model, body.response_format);

  let upstream;
  try {
    upstream = await fetch(SPEECH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.FORGE_APP_URL || 'https://yah-forge-direct.vercel.app',
        'X-Title': "YAH's Word Forge",
      },
      body: JSON.stringify({
        model,
        input,
        voice,
        response_format: responseFormat,
        ...(body.instructions ? { instructions: String(body.instructions).slice(0, 500) } : {}),
      }),
    });
  } catch (err) {
    return jsonError(`Network error reaching OpenRouter TTS: ${err.message}`, 502);
  }

  if (!upstream.ok) {
    const raw = await safeReadText(upstream);
    let message = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600);
    try {
      const parsed = JSON.parse(raw);
      message = parsed?.error?.message || parsed?.error || message;
    } catch { /* keep message */ }
    return jsonError(message || `OpenRouter TTS ${upstream.status}`, upstream.status >= 400 ? upstream.status : 502);
  }

  let bytes = await upstream.arrayBuffer();
  let contentType = upstream.headers.get('content-type')
    || (responseFormat === 'pcm' ? 'audio/pcm' : 'audio/mpeg');
  const generationId = upstream.headers.get('x-generation-id') || '';

  if (responseFormat === 'pcm') {
    const sampleRate = parseSampleRateFromHeaders(upstream.headers) || 44100;
    bytes = wrapPcm16LeMonoWav(bytes, sampleRate);
    contentType = 'audio/wav';
  }

  return new Response(bytes, {
    status: 200,
    headers: {
      ...corsHeaders(),
      'Content-Type': contentType,
      ...(generationId ? { 'X-Generation-Id': generationId } : {}),
      'X-TTS-Model': model,
      'X-TTS-Voice': voice,
    },
  });
}

function pickResponseFormat(model, requested) {
  const r = String(requested || '').toLowerCase();
  if (r === 'pcm' || r === 'mp3') return r;
  const id = String(model || '').toLowerCase();
  if (id.includes('heygen/') || id.includes('google/') || id.includes('gemini')) return 'pcm';
  return 'mp3';
}

function parseSampleRateFromHeaders(headers) {
  const raw = headers.get('x-audio-sample-rate') || headers.get('X-Audio-Sample-Rate');
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** HeyGen / OpenRouter PCM: 16-bit LE mono, no header — wrap for <audio> playback. */
export function wrapPcm16LeMonoWav(pcmBytes, sampleRate = 44100) {
  const pcm = new Uint8Array(pcmBytes);
  const dataSize = pcm.length;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeStr = (off, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
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
  const out = new Uint8Array(44 + dataSize);
  out.set(new Uint8Array(header), 0);
  out.set(pcm, 44);
  return out.buffer;
}

export function resolveVoice(model, uiVoice) {
  const id = String(model || '').toLowerCase();
  if (id.includes('elevenlabs/')) {
    return ELEVEN[uiVoice] || uiVoice.toLowerCase();
  }
  if (id.includes('heygen/')) {
    return HEYGEN[uiVoice] || 'gareth';
  }
  return (HEYGEN[uiVoice] || ELEVEN[uiVoice] || uiVoice).toLowerCase();
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonError(message, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

async function safeReadText(res) {
  try { return await res.text(); } catch { return ''; }
}