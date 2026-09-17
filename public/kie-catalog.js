/**
 * Static Kie catalogs for Forge dropdowns (chat + image + video generators).
 */
(function () {
  window.KIE_CHAT_MODELS = [
    { id: 'kie/gpt-6-astra', name: 'GPT-6 Astra via Kie', context_length: 1050000, pricing: { prompt: '0.0000028', completion: '0.000014' } },
    { id: 'kie/gpt-5-6-sol', name: 'GPT-5.6 Sol via Kie', context_length: 1050000, pricing: { prompt: '0.00000112', completion: '0.0000056' } },
    { id: 'kie/gpt-5-6-terra', name: 'GPT-5.6 Terra via Kie', context_length: 1050000, pricing: { prompt: '0.00000056', completion: '0.00000336' } },
    { id: 'kie/gpt-5-6-luna', name: 'GPT-5.6 Luna via Kie', context_length: 1050000, pricing: { prompt: '0.000000056', completion: '0.000000336' } },
    { id: 'kie/gpt-5-5', name: 'GPT-5.5 via Kie', context_length: 400000, pricing: { prompt: '0.0000014', completion: '0.0000084' } },
    { id: 'kie/gpt-5-4', name: 'GPT-5.4 via Kie', context_length: 400000, pricing: { prompt: '0.0000014', completion: '0.0000084' } },
    { id: 'kie/gpt-5-2', name: 'GPT-5.2 via Kie', context_length: 400000, pricing: { prompt: '0.0000014', completion: '0.0000084' } },
    { id: 'kie/gemini-3.1-pro', name: 'Gemini 3.1 Pro via Kie', context_length: 1000000, pricing: { prompt: '0.00000035', completion: '0.0000021' } },
    { id: 'kie/gemini-3-pro', name: 'Gemini 3 Pro via Kie', context_length: 1000000, pricing: { prompt: '0.00000035', completion: '0.0000021' } },
    { id: 'kie/gemini-3-6-flash-openai', name: 'Gemini 3.6 Flash via Kie', context_length: 1000000, pricing: { prompt: '0.00000007', completion: '0.00000028' } },
    { id: 'kie/gemini-3-flash', name: 'Gemini 3 Flash via Kie', context_length: 1000000, pricing: { prompt: '0.00000007', completion: '0.00000028' } },
    { id: 'kie/gemini-2.5-pro', name: 'Gemini 2.5 Pro via Kie', context_length: 1000000, pricing: { prompt: '0.00000035', completion: '0.0000021' } },
    { id: 'kie/gemini-2.5-flash', name: 'Gemini 2.5 Flash via Kie', context_length: 1000000, pricing: { prompt: '0.00000007', completion: '0.00000028' } }
  ];

  window.KIE_IMAGE_MODELS = [
    { id: 'nano-banana-2', name: 'Nano Banana 2' },
    { id: 'nano-banana-2-lite', name: 'Nano Banana 2 Lite' },
    { id: 'gpt-image-2-5-sunburst-text-to-image', name: 'GPT Image 2.5 Sunburst' },
    { id: 'gpt-image-2-text-to-image', name: 'GPT Image 2' },
    { id: 'flux-2/pro-text-to-image', name: 'Flux-2 Pro' },
    { id: 'flux-2/flex-text-to-image', name: 'Flux-2 Flex' },
    { id: 'grok-imagine/text-to-image', name: 'Grok Imagine' }
  ];

  window.KIE_VIDEO_MODELS = [
    { id: 'kling-3.0/video', name: 'Kling 3.0 Pro' },
    { id: 'kling-3.0-omni/text-to-video', name: 'Kling O3 (3.0 Omni)' },
    { id: 'kling/v3-turbo-text-to-video', name: 'Kling V3 Turbo' },
    { id: 'wan/3-0-video', name: 'Wan 3.0' },
    { id: 'wan/3-0-video-prime', name: 'Wan 3.0 Prime' },
    { id: 'bytedance/seedance-2-5', name: 'Seedance 2.5' },
    { id: 'bytedance/seedance-2', name: 'Seedance 2.0' },
    { id: 'veo3_fast', name: 'Veo 3.1 Fast' },
    { id: 'veo3', name: 'Veo 3.1 Quality' },
    { id: 'veo3_lite', name: 'Veo 3.1 Lite' },
    { id: 'grok-imagine-video-1-5-preview', name: 'Grok Imagine Video 1.5' },
    { id: 'grok-imagine/text-to-video', name: 'Grok Imagine Video' },
    { id: 'sora-2-text-to-video', name: 'Sora 2 Text to Video' },
    { id: 'sora-2-text-to-video-stable', name: 'Sora 2 Text to Video (Stable)' },
    { id: 'minimax-h3/text-to-video', name: 'MiniMax H3' },
    { id: 'pixverse-v6/text-to-video', name: 'PixVerse V6' },
    { id: 'hailuo/02-text-to-video-pro', name: 'Hailuo 02 Pro' },
    { id: 'hailuo/02-text-to-video-standard', name: 'Hailuo 02 Standard' },
    { id: 'wan/2-7-text-to-video', name: 'Wan 2.7' },
    { id: 'kling-2.6/text-to-video', name: 'Kling 2.6' },
    { id: 'runway', name: 'Runway Gen-3' }
  ];

  function fillMediaSelect(id, models, preferred) {
    var el = document.getElementById(id);
    if (!el) return;
    var prev = el.value;
    el.innerHTML = '';
    for (var i = 0; i < models.length; i++) {
      var opt = document.createElement('option');
      opt.value = models[i].id;
      opt.textContent = models[i].name;
      el.appendChild(opt);
    }
    if (prev) {
      for (var j = 0; j < el.options.length; j++) {
        if (el.options[j].value === prev) { el.value = prev; return; }
      }
    }
    if (preferred) el.value = preferred;
  }

  window.hydrateKieMediaSelects = function () {
    fillMediaSelect('kieImageModel', window.KIE_IMAGE_MODELS, 'nano-banana-2');
    fillMediaSelect('kieVideoModel', window.KIE_VIDEO_MODELS, 'kling-3.0/video');
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.hydrateKieMediaSelects);
  } else {
    window.hydrateKieMediaSelects();
  }
})();
