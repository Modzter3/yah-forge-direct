/**
 * Shared GET /models proxy for OpenAI-compatible providers (keys stay on Vercel).
 */
export async function handleOpenAiModelCatalog(req, cfg) {
  if (req.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const keyCandidates = cfg.keyEnvs || (cfg.keyEnv ? [cfg.keyEnv] : []);
  let apiKey = '';
  for (const envName of keyCandidates) {
    const v = process.env[envName];
    if (v && String(v).trim()) {
      apiKey = String(v).trim();
      break;
    }
  }
  if (!apiKey) {
    return Response.json(
      { error: cfg.missingKeyMessage || `Add ${keyCandidates[0] || 'API key'} in Vercel, then redeploy.` },
      { status: 503 }
    );
  }

  const baseEnv = cfg.baseUrlEnv ? process.env[cfg.baseUrlEnv] : '';
  const base = String(baseEnv || cfg.defaultBase || '').replace(/\/+$/, '');
  if (!base) {
    return Response.json({ error: 'Provider base URL is not configured.' }, { status: 500 });
  }

  try {
    const upstream = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: req.signal,
    });
    if (!upstream.ok) {
      return Response.json(
        {
          error: `${cfg.label || 'Provider'} model catalog returned HTTP ${upstream.status}. Check the server key and endpoint.`,
        },
        { status: 502 }
      );
    }
    const json = await upstream.json();
    if (!Array.isArray(json.data)) {
      return Response.json({ error: `Unexpected ${cfg.label || 'provider'} model catalog format.` }, { status: 502 });
    }

    let data = json.data
      .filter((m) => m && typeof m.id === 'string')
      .map((m) => ({
        id: m.id,
        name: m.name || m.id,
        context_length: m.context_length || m.context_window || 0,
        pricing: m.pricing || null,
      }));

    if (typeof cfg.filterModel === 'function') {
      data = data.filter(cfg.filterModel);
    }

    return Response.json({ data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (_) {
    return Response.json(
      { error: `Could not reach the ${cfg.label || 'provider'} model catalog.` },
      { status: 502 }
    );
  }
}
