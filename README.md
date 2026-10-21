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

**In-app Images / Video after a sermon** use Kie generators (Nano Banana 2, GPT Image 2.5, Flux-2, Kling 3.0 / O3, Wan 3.0, Seedance 2.5, Veo 3.1, Sora 2). They call `/api/kie-media` (create task + poll). OpenRouter `openai/gpt-6-astra` stays at official $10 / $50.

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

### Cline automation

For Cline or another local agent, install dependencies and optionally set the deployment URL:

```powershell
npm ci
$env:YAHFORGE_URL = 'https://yah-forge-direct.vercel.app'
npm run yahforge -- generate --topic 'Forgiveness and restoration' --parts 3 --eleven-tags
```

Outputs are written to `yahforge-output/<timestamp>-<topic>/` as `sermon.md` and `sermon.json`. Add `--visuals` for Kie stills, or `--visuals --videos` for both stills and motion clips; those options can incur provider charges. The client drives YahForge's existing browser workflow, preserving its prompt construction, multipart continuity, retries, tagging, and visual planning rather than duplicating them.

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

## NanoGPT on Vercel

Add `NANOGPT_API_KEY` to the Vercel project's Production environment (and Preview if needed), then redeploy. Select **NanoGPT** in the app's LLM provider menu. Every text model dropdown loads NanoGPT's catalog; custom inputs accept its exact model IDs. Keys remain on the server.

NanoGPT uses the OpenAI-compatible base `https://nano-gpt.com/api/v1`. Optional `NANOGPT_BASE_URL` overrides it; `NANOGPT_DEFAULT_MODEL` supplies an exact fallback ID. You can leave `AI_PROVIDER=openrouter` to retain the existing default, or set `AI_PROVIDER=nanogpt` for server-default NanoGPT routing. Existing OpenRouter keys, base overrides, and model redirects are not reused for NanoGPT requests. A missing key or unavailable catalog is reported without silently billing another provider.

This integration supports text/image chat and streaming. OpenRouter-specific web retrieval is not enabled for NanoGPT; disable web research for NanoGPT generation or use OpenRouter when retrieval is needed.

## Transfer sermons between devices

Library → Import accepts Markdown (`.md`, `.markdown`), plain text (`.txt`), text-based PDF (`.pdf`), Word (`.docx`), and sermon backups (`.json`). Select multiple files together. Imports save to the local Library and skip matching sermons. Scanned PDFs need OCR first; old `.doc` files should be saved as `.docx`.

Choose a format beside **Export to File** in a sermon or saved sermon. TXT is the default. For Windows → iPhone, save the file to iCloud Drive, then open this app on your phone and choose Library → Import. JSON preserves sermon parts and metadata; PDF and Word imports extract text. The Library’s Export button still backs up the entire library as JSON. File conversion runs locally without AI tokens.

Document tools are checked in for static deployment. Rebuild them with `npm ci && npm run build:document-tools`. For the browser round-trip checks, serve `public` on port 8765 (`python3 -m http.server 8765 --directory public`), install Chromium using `npx playwright install chromium`, and run `npm run test:sermon-files`. Set `CHROMIUM_PATH` to use an existing Chromium binary or `FORGE_TEST_URL` to change the server URL.

## Reading sections for long scrolls

In **Sealed Scrolls** or **Apocrypha**, Testament of Solomon and Book of Giants offer labeled **Reading Sections**. Select the first section and the last section to cover one section or a consecutive range. Select **Full source text** to use the whole original chapter. Ordinary chapter selection remains available for other books.

Other corpus chapters over 3,000 words also offer smaller reading sections between complete numbered source paragraphs. These are editorial reading aids, not original chapter divisions. The original corpus files, wording, and reference numbers remain unchanged. Sermon generation uses only the selected excerpt and allocates its original reference numbers across parts. Manual pasted text still overrides automatic corpus retrieval.

Run `npm run test:reading-sections` to verify lossless section coverage. With `public` served locally and Chromium available, run `npm run test:reading-sections-browser` to check both panels, range selection, retrieval, and multipart prompts. It accepts the same `CHROMIUM_PATH` and `FORGE_TEST_URL` options as the other browser checks.

## Follow-up lessons

After a completed sermon, **Where to Go Deeper** offers five different follow-up paths based on the completed text. Choose **Use This for Next Lesson** to fill the Topics field with a detailed study brief: central question, investigation objectives, sources to verify, and continuity guidance. Review or edit it, press **Forge** to configure the next lesson, then generate when ready. Selecting a path does not start a sermon request.

Saved sermons offer **Explore Follow-up Lessons** in the Library reader. Planning uses one request through the selected model; repeated views reuse choices during the session, and **Explore Different Avenues** requests alternatives. Research leads and earlier sermon claims still need verification. These choices replace the former topic-only Hidden Threads suggestions.

Run `npm run test:sermon-followups` for brief/schema checks. With `public` served locally, `npm run test:sermon-followups-browser` tests planning, choosing and editing a topic, saved sermons, retries, stale responses, and request reuse with a stubbed model. Browser options are `CHROMIUM_PATH` and `FORGE_TEST_URL`.

## NanoGPT in Yah Chat

In **Yah Chat**, select **NanoGPT** under **LLM provider**, then pick a catalog model or enter its exact NanoGPT ID. This uses the existing server-side `NANOGPT_API_KEY`. The provider setting is shared with the sermon Forge and persists after refresh. Switching providers clears stale custom model overrides. If the NanoGPT catalog is unavailable, enter a custom model ID before sending; the typed message is preserved.

With `public` served locally, run `npm run test:yah-chat-nanogpt` (supports `CHROMIUM_PATH` and `FORGE_TEST_URL`) to test catalog selection, provider synchronization and persistence, send/retry payloads, and catalog failures with stubbed API responses.
