/** Official ClinePass slugs — https://docs.cline.bot/getting-started/clinepass */
export const CLINEPASS_BUILTIN_MODELS = [
  { id: 'cline-pass/glm-5.3', name: 'GLM-5.3 (ClinePass)', context_length: 200000, pricing: null },
  { id: 'cline-pass/glm-5.3-flash', name: 'GLM-5.3 Flash (ClinePass)', context_length: 200000, pricing: null },
  { id: 'cline-pass/kimi-k3', name: 'Kimi K3 (ClinePass)', context_length: 256000, pricing: null },
  { id: 'cline-pass/deepseek-v4-pro', name: 'DeepSeek V4 Pro (ClinePass)', context_length: 128000, pricing: null },
  { id: 'cline-pass/deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash (ClinePass)', context_length: 128000, pricing: null },
  { id: 'cline-pass/mimo-v2.5', name: 'MiMo-V2.5 (ClinePass)', context_length: 128000, pricing: null },
  { id: 'cline-pass/mimo-v2.5-pro', name: 'MiMo-V2.5-Pro (ClinePass)', context_length: 128000, pricing: null },
  { id: 'cline-pass/minimax-m3', name: 'MiniMax M3 (ClinePass)', context_length: 200000, pricing: null },
  { id: 'cline-pass/muse-spark-1.3-contributor', name: 'Muse Spark 1.3 Contributor (ClinePass)', context_length: 128000, pricing: null },
  { id: 'cline-pass/qwen3.8-max', name: 'Qwen3.8 Max (ClinePass)', context_length: 256000, pricing: null },
  { id: 'cline-pass/qwen3.7-max', name: 'Qwen3.7 Max (ClinePass)', context_length: 256000, pricing: null },
  { id: 'cline-pass/qwen3.7-plus', name: 'Qwen3.7 Plus (ClinePass)', context_length: 1000000, pricing: null },
];

export function mergeClinePassCatalog(liveRows) {
  const byId = new Map();
  for (const row of CLINEPASS_BUILTIN_MODELS) byId.set(row.id, { ...row });
  for (const row of liveRows || []) {
    const id = normalizeClinePassModelId(row && row.id);
    if (!id) continue;
    const prev = byId.get(id) || { id, name: id, context_length: 0, pricing: null };
    byId.set(id, {
      id,
      name: (row && row.name) || prev.name,
      context_length: (row && (row.context_length || row.context_window)) || prev.context_length,
      pricing: (row && row.pricing) != null ? row.pricing : prev.pricing,
    });
  }
  return Array.from(byId.values());
}

export function normalizeClinePassModelId(raw) {
  const id = String(raw || '').trim();
  if (!id) return '';
  if (id.startsWith('cline-pass/')) return id;
  if (id.startsWith('cline_pass/')) return 'cline-pass/' + id.slice('cline_pass/'.length);
  return '';
}

export function isClinePassModelRow(m) {
  if (!m || typeof m.id !== 'string') return false;
  if (normalizeClinePassModelId(m.id)) return true;
  const owned = m.owned_by || m.provider;
  if (String(owned || '').toLowerCase() === 'cline-pass') {
    const slug = String(m.id).replace(/^cline-pass\//, '');
    return slug ? `cline-pass/${slug}` : '';
  }
  return false;
}

export function mapUpstreamClinePassRow(m) {
  let id = normalizeClinePassModelId(m.id);
  if (!id && String(m.owned_by || '').toLowerCase() === 'cline-pass') {
    id = `cline-pass/${String(m.id).replace(/^cline-pass\//, '')}`;
  }
  if (!id) return null;
  return {
    id,
    name: m.name || id,
    context_length: m.context_length || m.context_window || 0,
    pricing: m.pricing || null,
  };
}
