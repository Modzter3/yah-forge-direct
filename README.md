# YAH Forge Direct

**YAH Forge Direct** is a self-hosted AI chat forge that runs on your own API keys instead of Poe. Drop it on Vercel in under 5 minutes.

## What's included

| File | Purpose |
|------|---------|
| `public/index.html` | Full UI — model selector, streaming chat, token counter |
| `public/ai-polyfill.js` | `window.Poe` compatibility shim that routes to `/api/ai` |
| `public/kie-catalog.js` | Kie chat + image + video generator lists for every dropdown |
| `api/ai.js` | Edge function: provider-agnostic, SSE-streaming backend |
| `api/kie-media.js` | Edge function: Kie image/video createTask + poll |
| `vercel.json` | Routing config for Vercel |
| `.env.example` | All supported environment variables with comments |

## Supported providers

Set `AI_PROVIDER` to one of:

| Value | Endpoint |
|-------|---------|
| `openrouter` *(default)* | `https://openrouter.ai/api/v1` |
| `openai` | `https://api.openai.com/v1` |
| `groq` | `https://api.groq.com/openai/v1` |
| `together` | `https://api.together.xyz/v1` |
| `fireworks` | `https://api.fireworks.ai/inference/v1` |
| `xai` | `https://api.x.ai/v1` |
| `kie` | `https://api.kie.ai` (chat via `/codex/v1/responses` or `/.../v1/chat/completions`) |
| `custom` | Set `AI_BASE_URL` to any OpenAI-compatible endpoint |

You can keep `AI_PROVIDER=openrouter` and still pick **`kie/...`** models in every dropdown. Those ids bill `KIE_API_KEY`.

**In-app Images / Video after a sermon** use Kie generators (Nano Banana 2, GPT Image 2.5, Flux-2, Veo 3.1, Sora 2, Kling, Wan, Hailuo, Runway, etc.). They call `/api/kie-media` (create task + poll). OpenRouter `openai/gpt-6-astra` stays at official $10 / $50.

## Quick start (local)

```bash
# 1. Clone / unzip this project
# 2. Copy the env file
cp .env.example .env.local

# 3. Fill in your key
echo "OPENROUTER_API_KEY=sk-or-..." >> .env.local

# 4. Install Vercel CLI and serve locally
npm i -g vercel
vercel dev
```

Open http://localhost:3000 — select a model, type a prompt, hit Send.

## Deploy to Vercel

```bash
vercel --prod
```

Then add your environment variables in the Vercel project dashboard under **Settings → Environment Variables**.

Required for discounted GPT-6 Astra:

```
KIE_API_KEY=your_kie_key
```

Paste the key at [Vercel → yah-forge-direct → Environment Variables](https://vercel.com/modzter3s-projects/yah-forge-direct/settings/environment-variables) for Production, Preview, and Development, then redeploy.

## Model aliases

The UI uses friendly names (e.g. `Gemini-3-Pro`) that map to real provider model IDs in `api/ai.js`. You can override any alias at runtime via the `MODEL_ALIASES_JSON` env var:

```
MODEL_ALIASES_JSON={"Gemini-3.1-Pro":"google/gemini-2.5-pro-preview","GPT-5.2":"openai/gpt-4o"}
```
