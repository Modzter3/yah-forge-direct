import { checkBonsaiHealth, getBonsaiConfig, BONSAI_OFFLINE_PREFIX } from './bonsai-provider.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (req.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const cfg = getBonsaiConfig();
  const health = await checkBonsaiHealth(cfg);
  const status = health.ok ? 200 : 503;
  const body = {
    provider: 'bonsai',
    label: 'Bonsai RunPod',
    ok: health.ok,
    offline: !health.ok,
    model: cfg.model || health.model,
    baseUrl: cfg.baseUrl ? cfg.baseUrl.replace(/\/v1\/?$/, '/v1') : '',
    ...(health.ok
      ? { message: 'Bonsai RunPod online' }
      : { error: `${BONSAI_OFFLINE_PREFIX}${health.error ? `: ${health.error}` : ''}` }),
  };
  return json(body, status);
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}
