export const config = { runtime: 'edge' };

const KIE_BASE = (process.env.KIE_BASE_URL || 'https://api.kie.ai').replace(/\/+$/, '');

const IMAGE_MODELS = {
  'nano-banana-2': { model: 'nano-banana-2', via: 'jobs', family: 'nano' },
  'nano-banana-2-lite': { model: 'nano-banana-2-lite', via: 'jobs', family: 'nano' },
  'flux-2/pro-text-to-image': { model: 'flux-2/pro-text-to-image', via: 'jobs', family: 'flux' },
  'flux-2/flex-text-to-image': { model: 'flux-2/flex-text-to-image', via: 'jobs', family: 'flux' },
  'grok-imagine/text-to-image': { model: 'grok-imagine/text-to-image', via: 'jobs', family: 'grok-image' },
  'gpt-image-2-5-sunburst-text-to-image': { model: 'gpt-image-2-5-sunburst-text-to-image', via: 'jobs', family: 'gpt-image' },
  'gpt-image-2-text-to-image': { model: 'gpt-image-2-text-to-image', via: 'jobs', family: 'gpt-image' },
};

const VIDEO_MODELS = {
  veo3_fast: { model: 'veo3_fast', via: 'veo' },
  veo3: { model: 'veo3', via: 'veo' },
  veo3_lite: { model: 'veo3_lite', via: 'veo' },
  'grok-imagine/text-to-video': { model: 'grok-imagine/text-to-video', via: 'jobs', family: 'grok-video' },
};

function buildImageInput(spec, prompt, aspectRatio) {
  const ratio = aspectRatio || '16:9';
  if (spec.family === 'grok-image') {
    return { prompt, aspect_ratio: ratio, nsfw_checker: false };
  }
  if (spec.family === 'gpt-image') {
    return { prompt, aspect_ratio: ratio, resolution: '1K' };
  }
  const input = { prompt, aspect_ratio: ratio, resolution: '1K' };
  if (spec.family === 'flux') input.nsfw_checker = false;
  return input;
}

function buildVideoJobInput(spec, prompt, aspectRatio) {
  if (spec.family === 'grok-video') {
    return {
      prompt,
      aspect_ratio: aspectRatio || '16:9',
      mode: 'normal',
      duration: 6,
      resolution: '480p',
    };
  }
  return { prompt, aspect_ratio: aspectRatio || '16:9' };
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

function resolveKieKey() {
  return process.env.KIE_API_KEY || process.env.KIE_SECRET_KEY || process.env.AI_API_KEY || '';
}

function authHeaders(key) {
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

function kieErr(parsed, raw, fallback) {
  const msg = parsed?.msg || parsed?.error?.message || parsed?.error || parsed?.message;
  if (typeof msg === 'string' && msg.trim()) return msg.trim();
  return String(raw || fallback || 'Kie request failed').slice(0, 600);
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const key = resolveKieKey();
  if (!key) {
    return json({ error: 'Missing KIE_API_KEY. Add it in Vercel → Settings → Environment Variables, then redeploy.' }, 500);
  }

  const url = new URL(req.url);
  if (req.method === 'GET') {
    const taskId = url.searchParams.get('taskId') || '';
    const kind = (url.searchParams.get('kind') || 'image').toLowerCase();
    const viaParam = (url.searchParams.get('via') || '').toLowerCase();
    if (!taskId) return json({ error: 'Missing taskId' }, 400);
    return pollTask(key, kind, taskId, viaParam);
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const kind = String(body.kind || 'image').toLowerCase();
  const prompt = String(body.prompt || '').trim();
  if (prompt.length < 3) return json({ error: 'Prompt is too short' }, 400);

  const count = Math.min(10, Math.max(1, parseInt(body.count, 10) || 1));
  const aspectRatio = String(body.aspectRatio || '16:9');

  if (kind === 'image') {
    const spec = IMAGE_MODELS[body.model] || IMAGE_MODELS['nano-banana-2'];
    const tasks = [];
    const input = buildImageInput(spec, prompt, aspectRatio);
    for (let i = 0; i < count; i++) {
      const created = await createJob(key, spec.model, input);
      if (created.error) return json({ error: created.error }, created.status || 502);
      tasks.push({ taskId: created.taskId, via: spec.via, kind: 'image' });
    }
    return json({ tasks });
  }

  if (kind === 'video') {
    const spec = VIDEO_MODELS[body.model] || VIDEO_MODELS.veo3_fast;
    if (spec.via === 'veo') {
      const created = await createVeo(key, {
        prompt,
        model: spec.model,
        generationType: 'TEXT_2_VIDEO',
        aspect_ratio: aspectRatio,
        enableTranslation: true,
      });
      if (created.error) return json({ error: created.error }, created.status || 502);
      return json({ tasks: [{ taskId: created.taskId, via: 'veo', kind: 'video' }] });
    }
    const created = await createJob(key, spec.model, buildVideoJobInput(spec, prompt, aspectRatio));
    if (created.error) return json({ error: created.error }, created.status || 502);
    return json({ tasks: [{ taskId: created.taskId, via: 'jobs', kind: 'video' }] });
  }

  return json({ error: 'Unknown kind. Use image or video.' }, 400);
}

async function createJob(key, model, input) {
  let res;
  try {
    res = await fetch(`${KIE_BASE}/api/v1/jobs/createTask`, {
      method: 'POST',
      headers: authHeaders(key),
      body: JSON.stringify({ model, input }),
    });
  } catch (err) {
    return { error: `Network error creating Kie job: ${err.message}`, status: 502 };
  }
  const raw = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch { parsed = null; }
  const taskId = parsed?.data?.taskId || parsed?.taskId;
  if (!res.ok || parsed?.code && parsed.code !== 200 || !taskId) {
    return { error: kieErr(parsed, raw, 'Kie createTask failed'), status: res.status || 502 };
  }
  return { taskId };
}

async function createVeo(key, payload) {
  let res;
  try {
    res = await fetch(`${KIE_BASE}/api/v1/veo/generate`, {
      method: 'POST',
      headers: authHeaders(key),
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return { error: `Network error creating Veo job: ${err.message}`, status: 502 };
  }
  const raw = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch { parsed = null; }
  const taskId = parsed?.data?.taskId || parsed?.taskId;
  if (!res.ok || parsed?.code && parsed.code !== 200 || !taskId) {
    return { error: kieErr(parsed, raw, 'Kie Veo generate failed'), status: res.status || 502 };
  }
  return { taskId };
}

async function pollTask(key, kind, taskId, viaParam) {
  const via = viaParam === 'veo' || viaParam === 'jobs'
    ? viaParam
    : (String(taskId).toLowerCase().startsWith('veo') ? 'veo' : 'jobs');
  const endpoint = via === 'veo'
    ? `${KIE_BASE}/api/v1/veo/record-info?taskId=${encodeURIComponent(taskId)}`
    : `${KIE_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`;

  let res;
  try {
    res = await fetch(endpoint, { headers: { Authorization: `Bearer ${key}` } });
  } catch (err) {
    return json({ status: 'error', error: err.message }, 502);
  }
  const raw = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch { parsed = null; }
  if (!res.ok) {
    return json({ status: 'error', error: kieErr(parsed, raw, 'Kie poll failed') }, res.status || 502);
  }

  const data = parsed?.data || parsed || {};
  const state = String(data.state || data.status || '').toLowerCase();
  const flag = data.successFlag;
  const urls = extractResultUrls(data);

  if (state === 'success' || flag === 1 || (urls.length && (state === 'success' || flag == null))) {
    if (urls.length) return json({ status: 'success', urls, rawState: state || flag });
  }
  if (state === 'fail' || flag === 2 || flag === 3) {
    return json({ status: 'fail', error: data.errorMessage || data.failMsg || parsed?.msg || 'Generation failed' });
  }
  return json({ status: 'generating', urls, rawState: state || flag });
}

function extractResultUrls(data) {
  const out = [];
  const push = (u) => {
    if (typeof u === 'string' && /^https?:\/\//i.test(u) && out.indexOf(u) === -1) out.push(u);
  };
  const walk = (val) => {
    if (!val) return;
    if (typeof val === 'string') {
      const t = val.trim();
      if (t.startsWith('{') || t.startsWith('[')) {
        try { walk(JSON.parse(t)); } catch { /* ignore */ }
      } else if (t.startsWith('http')) {
        push(t);
      }
      return;
    }
    if (Array.isArray(val)) {
      for (const item of val) walk(item);
      return;
    }
    if (typeof val === 'object') {
      if (typeof val.url === 'string') push(val.url);
      if (typeof val.resultImageUrl === 'string') push(val.resultImageUrl);
      if (typeof val.resultVideoUrl === 'string') push(val.resultVideoUrl);
      if (typeof val.videoUrl === 'string') push(val.videoUrl);
      if (typeof val.resultUrl === 'string') push(val.resultUrl);
      if (val.resultUrls) walk(val.resultUrls);
      if (val.originUrls) walk(val.originUrls);
      if (val.response) walk(val.response);
      if (val.info) walk(val.info);
      if (val.resultJson) walk(val.resultJson);
    }
  };
  walk(data);
  return out;
}
