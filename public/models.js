// Provider metadata: real brand icons (vendored from the open-source
// @lobehub/icons-static-svg set, https://lobehub.com/icons, rasterized to
// PNG — html2canvas, used for PDF export, cannot reliably load <img> tags
// pointing at .svg sources inside its cloned rendering context), provider
// detection from an OpenRouter model id, and the token-multiplier heuristic.

export const PROVIDERS = {
  claude: { label: 'Claude', base: 1.30, iconFile: 'claude.png', match: (id) => id.startsWith('anthropic/') },
  gpt: { label: 'GPT', base: 1.30, iconFile: 'gpt.png', match: (id) => id.startsWith('openai/') },
  gemini: { label: 'Gemini', base: 1.25, iconFile: 'gemini.png', match: (id) => id.startsWith('google/') },
  grok: { label: 'Grok', base: 1.30, iconFile: 'grok.png', match: (id) => id.startsWith('x-ai/') },
  deepseek: { label: 'DeepSeek', base: 1.20, iconFile: 'deepseek.png', match: (id) => id.startsWith('deepseek/') },
  qwen: { label: 'Qwen', base: 1.20, iconFile: 'qwen.png', match: (id) => id.startsWith('qwen/') },
  glm: {
    label: 'GLM',
    base: 1.20,
    iconFile: 'glm.png',
    match: (id) => id.startsWith('z-ai/') || id.startsWith('zhipu/') || id.includes('glm'),
  },
  kimi: {
    label: 'Kimi',
    base: 1.25,
    iconFile: 'kimi.png',
    match: (id) => id.startsWith('moonshotai/') || id.includes('kimi'),
  },
  minimax: { label: 'MiniMax', base: 1.20, iconFile: 'minimax.png', match: (id) => id.startsWith('minimax/') },
};

const DEFAULT_PROVIDER = { label: 'Other', base: 1.20, iconFile: null };

const KEYWORD_FALLBACK = {
  claude: 'claude', gpt: 'openai', gemini: 'gemini', grok: 'grok',
  deepseek: 'deepseek', qwen: 'qwen', glm: 'glm', kimi: 'kimi', minimax: 'minimax',
};

export function detectProvider(modelId, modelName) {
  const id = (modelId || '').toLowerCase();
  for (const key of Object.keys(PROVIDERS)) {
    if (PROVIDERS[key].match(id)) return key;
  }
  const text = `${id} ${(modelName || '').toLowerCase()}`;
  for (const key of Object.keys(KEYWORD_FALLBACK)) {
    if (text.includes(KEYWORD_FALLBACK[key])) return key;
  }
  return null;
}

export function providerMeta(key) {
  return PROVIDERS[key] || DEFAULT_PROVIDER;
}

export function providerIconHtml(key) {
  const meta = providerMeta(key);
  const file = meta.iconFile || 'other.png';
  return `<img src="/vendor/icons/${file}" width="20" height="20" alt="${meta.label}">`;
}

const FLAGSHIP_RE = /(opus|ultra|max\b|[- ]pro\b|large|plus|v4|405b|235b)/i;
const LITE_RE = /(mini|flash|lite|small|turbo|haiku|nano|7b|8b|1b|3b)/i;

// Regional adjustments apply after the existing model-size heuristic.
// +200% = 3x; +800% = 9x. Unmapped regions retain their existing estimate.
const REGION_PROVIDERS = {
  china: new Set(['deepseek', 'qwen', 'glm', 'kimi', 'minimax']),
  america: new Set(['claude', 'gpt', 'gemini', 'grok']),
};
const REGION_PREFIXES = {
  china: new Set(['deepseek', 'qwen', 'alibaba', 'alibaba-cn', 'z-ai', 'zhipu', 'moonshotai', 'moonshotai-cn', 'minimax', 'baidu', 'bytedance', 'bytedance-seed', 'tencent', 'thudm', '01-ai', 'inclusionai', 'meituan', 'stepfun', 'stepfun-ai', 'xiaomi']),
  america: new Set(['anthropic', 'openai', 'google', 'x-ai', 'meta-llama', 'nvidia', 'microsoft', 'amazon', 'allenai', 'perplexity', 'nousresearch', 'cognitivecomputations', 'arcee-ai', 'deepcogito', 'morph', 'inflection', 'ibm-granite']),
};
export function regionalTokenFactor(modelId) {
  const prefix = (modelId || '').toLowerCase().split('/')[0];
  const provider = detectProvider(modelId);
  for (const [region, factor] of [['china', 3], ['america', 9]]) {
    if (REGION_PREFIXES[region].has(prefix)) return factor;
  }
  for (const [region, factor] of [['china', 3], ['america', 9]]) {
    if (REGION_PROVIDERS[region].has(provider)) return factor;
  }
  return 1;
}

export function computeMultiplier(modelId) {
  const provider = detectProvider(modelId);
  let mult = providerMeta(provider).base;
  const id = modelId || '';
  if (FLAGSHIP_RE.test(id)) mult += 0.15;
  else if (LITE_RE.test(id)) mult -= 0.15;
  return Math.round(Math.max(1.05, Math.min(1.5, Math.round(mult * 100) / 100)) * regionalTokenFactor(modelId) * 100) / 100;
}

export function estimateTokens(wordCount, modelId) {
  return Math.ceil(wordCount * computeMultiplier(modelId));
}

// Used if /api/models can't be reached (offline, upstream down).
export const FALLBACK_MODELS = [
  { id: 'anthropic/claude-opus-5', name: 'Claude Opus 5' },
  { id: 'anthropic/claude-sonnet-5', name: 'Claude Sonnet 5' },
  { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5' },
  { id: 'openai/gpt-5', name: 'GPT-5' },
  { id: 'openai/gpt-5-mini', name: 'GPT-5 Mini' },
  { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
  { id: 'x-ai/grok-4', name: 'Grok 4' },
  { id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat' },
  { id: 'qwen/qwen-max', name: 'Qwen Max' },
  { id: 'qwen/qwen-turbo', name: 'Qwen Turbo' },
  { id: 'z-ai/glm-5.3', name: 'GLM 5.3' },
  { id: 'z-ai/glm-5.3-flash', name: 'GLM 5.3 Flash' },
  { id: 'moonshotai/kimi-k2', name: 'Kimi K2' },
  { id: 'minimax/minimax-m2', name: 'MiniMax M2' },
];
