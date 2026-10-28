import { handleOpenAiModelCatalog } from './openai-model-catalog.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  return handleOpenAiModelCatalog(req, {
    label: 'ClinePass',
    keyEnvs: ['CLINEPASS_API_KEY', 'CLINE_API_KEY'],
    baseUrlEnv: 'CLINEPASS_BASE_URL',
    defaultBase: 'https://api.cline.bot/api/v1',
    missingKeyMessage: 'Add CLINEPASS_API_KEY (or CLINE_API_KEY) in Vercel environment variables, then redeploy.',
    filterModel: (m) => String(m.id || '').startsWith('cline-pass/'),
  });
}
