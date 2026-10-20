#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

function usage() {
  console.log(`YahForge automation client

Usage:
  npm run yahforge -- generate --topic "Topic or full brief" [options]

Options:
  --url <url>              YahForge URL (default: YAHFORGE_URL or production)
  --topic <text>           Required sermon topic or detailed brief
  --parts <1-7>            Number of parts (default: 1)
  --model <provider/id>    Optional exact model id
  --provider <name>        openrouter, nanogpt, or local (default: openrouter)
  --words <n>              One-part target words supported by the Forge UI
  --eleven-tags            Run YahForge's Eleven v4 tagging pass
  --visuals                Generate the visual package (may spend Kie credits)
  --videos                 Include generated video clips with --visuals
  --beats <3-8>            Visual beat count (default: 5)
  --output <directory>     Output directory (default: ./yahforge-output/<timestamp>)
  --headed                 Show the browser while running
  --timeout-minutes <n>    Overall generation deadline (default: 30)

Environment:
  YAHFORGE_ACCESS_TOKEN    Required; matches the Vercel secret
  YAHFORGE_URL             Optional default deployment URL
`);
}

function parseArgs(argv) {
  const result = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith('--')) {
      result._.push(value);
      continue;
    }
    const key = value.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      result[key] = next;
      i += 1;
    } else {
      result[key] = true;
    }
  }
  return result;
}

function safeName(value) {
  return String(value || 'sermon').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'sermon';
}

function combinedMarkdown(result) {
  if (result.combined) return result.combined.trim() + '\n';
  return result.parts.map((part, index) => {
    const title = result.partTitles[index] || `Part ${index + 1}`;
    return `# ${title}\n\n${part.trim()}`;
  }).join('\n\n---\n\n') + '\n';
}

async function saveResult(outputDir, result) {
  await fs.mkdir(outputDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(outputDir, 'sermon.json'), JSON.stringify(result, null, 2) + '\n'),
    fs.writeFile(path.join(outputDir, 'sermon.md'), combinedMarkdown(result)),
  ]);
  if (result.visualPackage) {
    const manifest = {
      exportedAt: new Date().toISOString(),
      sermonTitle: result.visualPackage.title || result.title,
      themes: result.visualPackage.themes || [],
      beats: result.visualPackage.beats || [],
      stitch: {
        order: 'beats by n ascending',
        clipUrls: (result.visualPackage.beats || []).map((beat) => beat.videoUrl).filter(Boolean),
      },
    };
    await fs.writeFile(path.join(outputDir, 'visual-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  }
}

async function waitForSermon(page, deadline) {
  let previous = '';
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => ({
      running: Boolean(window.isGenerating),
      completed: Array.isArray(window.sermonPartsRaw) ? window.sermonPartsRaw.length : 0,
      requested: Number(window.selectedPartCount || 0),
      paused: Boolean(window.sermonGenCtx && window.sermonGenCtx.paused),
      error: document.querySelector('#sermonOutput .error-msg')?.textContent?.trim() || '',
    }));
    const summary = `${state.completed}/${state.requested} parts`;
    if (summary !== previous) {
      console.error(`YahForge: ${summary}`);
      previous = summary;
    }
    if (state.paused) throw new Error('YahForge paused because a model stream stalled. The draft is incomplete.');
    if (!state.running) {
      if (state.completed === state.requested && state.completed > 0) return;
      throw new Error(state.error || `Generation stopped after ${state.completed}/${state.requested} parts.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('YahForge generation exceeded the configured deadline.');
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (!command || command === 'help' || args.help) {
    usage();
    return;
  }
  if (command !== 'generate') throw new Error(`Unknown command: ${command}`);

  const topic = String(args.topic || '').trim();
  if (!topic) throw new Error('--topic is required.');
  const parts = Number.parseInt(args.parts || '1', 10);
  if (!Number.isInteger(parts) || parts < 1 || parts > 7) throw new Error('--parts must be from 1 through 7.');
  const beats = Number.parseInt(args.beats || '5', 10);
  if (!Number.isInteger(beats) || beats < 3 || beats > 8) throw new Error('--beats must be from 3 through 8.');
  const token = String(process.env.YAHFORGE_ACCESS_TOKEN || '').trim();
  if (token.length < 24) throw new Error('Set YAHFORGE_ACCESS_TOKEN to the same 24+ character secret configured in Vercel.');

  const baseUrl = String(args.url || process.env.YAHFORGE_URL || 'https://yah-forge-direct.vercel.app').replace(/\/+$/, '');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = path.resolve(args.output || path.join('yahforge-output', `${stamp}-${safeName(topic)}`));
  const timeoutMinutes = Number.parseFloat(args['timeout-minutes'] || '30');
  const deadline = Date.now() + timeoutMinutes * 60_000;
  const browser = await chromium.launch({ headless: !args.headed, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });

  try {
    const context = await browser.newContext({ acceptDownloads: true });
    const auth = await context.request.post(`${baseUrl}/api/auth`, {
      data: { token },
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!auth.ok()) throw new Error(`YahForge authentication failed (HTTP ${auth.status()}).`);

    const page = await context.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') console.error(`Browser: ${message.text()}`);
    });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => typeof window.generateSermon === 'function' && typeof window.setPartCount === 'function');

    await page.evaluate((options) => {
      window.currentTopic = {
        id: -1,
        cat: 'doctrine',
        title: options.topic.split(/\r?\n/)[0].slice(0, 160),
        desc: options.topic,
        customBrief: options.topic,
        subjectHint: options.topic,
        filmProbeDone: true,
      };
      window.currentMode = 'standard';
      window.currentChapterSource = null;
      window.currentChapterText = null;
      window.currentChapterVerseCount = 0;
      window.currentNewsVeilFromUrl = false;
      window.currentThreadsContext = null;
      window.openModal({ skipPartRec: true });
      window.setPartCount(options.parts);
      if (typeof window.setForgeLlmProvider === 'function') window.setForgeLlmProvider(options.provider);
      const providerSelect = document.getElementById('forgeLlmProvider');
      if (providerSelect) providerSelect.value = options.provider;
      const customModel = document.getElementById('customModelInput');
      if (customModel && options.model) customModel.value = options.model;
      if (options.words && typeof window.setStandaloneWordCount === 'function') window.setStandaloneWordCount(options.words);
      ['toggleSceneDismantle', 'toggleSermonEpisodeMode'].forEach((id) => {
        const element = document.getElementById(id);
        if (element) element.checked = false;
      });
      window.generateSermon(true);
    }, {
      topic,
      parts,
      provider: String(args.provider || 'openrouter'),
      model: String(args.model || ''),
      words: args.words ? Number.parseInt(args.words, 10) : 0,
    });

    await waitForSermon(page, deadline);

    if (args['eleven-tags']) {
      console.error('YahForge: adding ElevenLabs v4 performance tags...');
      await page.evaluate(() => window.elevenTagCurrentSermon());
      await page.waitForFunction(() => window.elevenTagRunning === false, null, { timeout: Math.max(1, deadline - Date.now()) });
    }

    if (args.visuals) {
      console.error('YahForge: generating visual package (provider charges may apply)...');
      await page.evaluate((options) => {
        document.getElementById('visualBeatCount').value = String(options.beats);
        document.getElementById('visualPkgImages').checked = true;
        document.getElementById('visualPkgVideos').checked = options.videos;
      }, { beats, videos: Boolean(args.videos) });
      await page.evaluate(() => window.runVisualPackage());
      await page.waitForFunction(() => window.visualPackageState?.running === false, null, { timeout: Math.max(1, deadline - Date.now()) });
    }

    const result = await page.evaluate(() => ({
      title: window.currentTopic?.title || 'Sermon',
      topic: window.currentTopic?.customBrief || window.currentTopic?.desc || '',
      model: window.getSelectedModel(),
      provider: typeof window.getForgeLlmProvider === 'function' ? window.getForgeLlmProvider() : 'openrouter',
      generatedAt: new Date().toISOString(),
      partTitles: window.sermonPartsTitles.slice(),
      parts: window.sermonPartsRaw.slice(),
      combined: window.sermonPartsCombined,
      elevenTagged: Boolean(document.getElementById('toggleElevenLabsTags')?.checked),
      visualPackage: window.visualPackageState?.result || null,
    }));
    await saveResult(outputDir, result);
    console.log(JSON.stringify({ ok: true, outputDir, title: result.title, parts: result.parts.length }, null, 2));
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(`YahForge automation failed: ${error.message}`);
  process.exitCode = 1;
});
