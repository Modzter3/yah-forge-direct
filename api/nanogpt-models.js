export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'GET') return Response.json({error:'Method not allowed'}, {status:405});
  const apiKey = process.env.NANOGPT_API_KEY;
  if (!apiKey) return Response.json({error:'Add NANOGPT_API_KEY in Vercel environment variables, then redeploy.'}, {status:503});
  const base = (process.env.NANOGPT_BASE_URL || 'https://nano-gpt.com/api/v1').replace(/\/+$/, '');
  try {
    const upstream = await fetch(`${base}/models`, {
      headers: {Authorization:`Bearer ${apiKey}`}, signal:req.signal,
    });
    if (!upstream.ok) return Response.json({error:`NanoGPT model catalog returned HTTP ${upstream.status}. Check the server key and endpoint.`}, {status:502});
    const json = await upstream.json();
    if (!Array.isArray(json.data)) return Response.json({error:'Unexpected NanoGPT model catalog format.'}, {status:502});
    // Only model metadata is returned to the browser, never credentials or upstream headers.
    const data = json.data.filter(m=>m && typeof m.id === 'string').map(m=>({
      id:m.id, name:m.name || m.id, context_length:m.context_length || m.context_window || 0,
      pricing:m.pricing || null,
    }));
    return Response.json({data}, {headers:{'Cache-Control':'no-store'}});
  } catch (_) {
    return Response.json({error:'Could not reach the NanoGPT model catalog.'}, {status:502});
  }
}
