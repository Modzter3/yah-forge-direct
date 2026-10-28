import { handleOpenAiModelCatalog } from './openai-model-catalog.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  return handleOpenAiModelCatalog(req, {
    label: 'OpenCode Go',
    keyEnvs: ['OPENCODE_GO_API_KEY', 'OPENCODE_API_KEY'],
    baseUrlEnv: 'OPENCODE_GO_BASE_URL',
    defaultBase: 'https://opencode.ai/zen/go/v1',
    missingKeyMessage: 'Add OPENCODE_GO_API_KEY (or OPENCODE_API_KEY) in Vercel environment variables, then redeploy.',
  });
}
