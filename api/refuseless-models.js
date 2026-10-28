import { handleOpenAiModelCatalog } from './openai-model-catalog.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  return handleOpenAiModelCatalog(req, {
    label: 'Refuseless',
    keyEnvs: ['REFUSELESS_API_KEY'],
    baseUrlEnv: 'REFUSELESS_BASE_URL',
    defaultBase: 'https://api.refuseless.com/v1',
    missingKeyMessage: 'Add REFUSELESS_API_KEY in Vercel environment variables, then redeploy.',
  });
}
