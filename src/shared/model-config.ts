export interface ModelConfig {
  id: string;
  name: string;
  api: string;
  provider: string;
  model: string;
  baseURL: string;
  apiKey: string;
  reasoning: boolean;
  input: ('text' | 'image' | 'audio')[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number; };
  contextWindow: number;
  maxTokens: number;
}

export interface ModelConfigStore {
  models: ModelConfig[];
  activeModelId: string;
}

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  id: 'minimax-m2.5',
  name: 'Minimax M2.5',
  api: 'minimax-completions',
  provider: 'minimax',
  model: 'minimax-m2.5',
  baseURL: 'http://172.17.124.34:8118/v1',
  apiKey: 'sk-9uGxyk8v430bpOUkTWuDhpexA6nlsRfdw90lum4NdU7TGUD2',
  reasoning: false,
  input: ['text', 'image'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 32000,
  maxTokens: 8192,
};

export const PRESET_MODELS: Partial<ModelConfig>[] = [
  { id: 'gpt-4o', name: 'GPT-4o', api: 'openai-completions', provider: 'openai', model: 'gpt-4o', baseURL: 'https://api.openai.com/v1', reasoning: false, input: ['text', 'image'], cost: { input: 2.5, output: 10, cacheRead: 1.25, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 4096 },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', api: 'openai-completions', provider: 'openai', model: 'gpt-4o-mini', baseURL: 'https://api.openai.com/v1', reasoning: false, input: ['text', 'image'], cost: { input: 0.15, output: 0.6, cacheRead: 0.075, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 16384 },
  { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', api: 'anthropic-completions', provider: 'anthropic', model: 'claude-3-5-sonnet-20241022', baseURL: 'https://api.anthropic.com/v1', reasoning: false, input: ['text', 'image'], cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 }, contextWindow: 200000, maxTokens: 8192 },
  { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', api: 'anthropic-completions', provider: 'anthropic', model: 'claude-sonnet-4-20250514', baseURL: 'https://api.anthropic.com/v1', reasoning: false, input: ['text', 'image'], cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 }, contextWindow: 200000, maxTokens: 8192 },
  { id: 'deepseek-chat', name: 'DeepSeek Chat', api: 'openai-completions', provider: 'deepseek', model: 'deepseek-chat', baseURL: 'https://api.deepseek.com/v1', reasoning: false, input: ['text'], cost: { input: 0.14, output: 0.28, cacheRead: 0.014, cacheWrite: 0 }, contextWindow: 64000, maxTokens: 4096 },
  { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', api: 'openai-completions', provider: 'deepseek', model: 'deepseek-reasoner', baseURL: 'https://api.deepseek.com/v1', reasoning: true, input: ['text'], cost: { input: 0.55, output: 2.19, cacheRead: 0.14, cacheWrite: 0 }, contextWindow: 64000, maxTokens: 8192 },
  { id: 'qwen-max', name: '通义千问 Max', api: 'openai-completions', provider: 'qwen', model: 'qwen-max', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', reasoning: false, input: ['text', 'image'], cost: { input: 2, output: 6, cacheRead: 0, cacheWrite: 0 }, contextWindow: 32000, maxTokens: 8192 },
  { id: 'qwen-plus', name: '通义千问 Plus', api: 'openai-completions', provider: 'qwen', model: 'qwen-plus', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', reasoning: false, input: ['text', 'image'], cost: { input: 0.8, output: 2, cacheRead: 0, cacheWrite: 0 }, contextWindow: 32000, maxTokens: 8192 },
  { id: 'kimi', name: 'Kimi', api: 'openai-completions', provider: 'moonshot', model: 'moonshot-v1-8k-vision-preview', baseURL: 'https://api.moonshot.cn/v1', reasoning: false, input: ['text', 'image'], cost: { input: 15, output: 15, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 8192 },
  { id: 'minimax-m2.5', name: 'MiniMax M2.5', api: 'openai-completions', provider: 'minimax', model: 'minimax-m2.5', baseURL: 'http://172.17.124.34:8118/v1', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 32000, maxTokens: 8192 },
  { id: 'ollama-llama3.3', name: 'Ollama Llama 3.3', api: 'openai-completions', provider: 'ollama', model: 'llama3.3', baseURL: 'http://localhost:11434/v1', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 8192, maxTokens: 4096 },
  { id: 'lmstudio-llama3.3', name: 'LMStudio Llama 3.3', api: 'openai-completions', provider: 'lmstudio', model: 'llama-3.3-Instruct-Merged', baseURL: 'http://localhost:1234/v1', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 8192, maxTokens: 4096 },
];

export const LOCAL_MODEL_ENDPOINTS = ['http://localhost:11434/v1', 'http://localhost:1234/v1'];

export function isLocalModel(baseURL: string | undefined | null): boolean {
  if (!baseURL) return false;
  return LOCAL_MODEL_ENDPOINTS.some(endpoint => baseURL.startsWith(endpoint.replace('/v1', ''))) || baseURL.includes('localhost') || baseURL.includes('127.0.0.1');
}

export const API_KEY_GUIDES = [
  { name: '阿里云 (通义千问)', url: 'https://dashscope.console.aliyun.com/' },
  { name: '月之暗面 (Kimi)', url: 'https://platform.moonshot.cn/' },
  { name: 'MiniMax', url: 'http://172.17.124.34:8118/v1' },
  { name: 'DeepSeek', url: 'https://platform.deepseek.com/' },
  { name: 'OpenAI', url: 'https://platform.openai.com/' },
  { name: 'Anthropic (Claude)', url: 'https://console.anthropic.com/' },
  { name: 'Ollama (本地)', url: 'https://ollama.com/' },
  { name: 'LMStudio (本地)', url: 'https://lmstudio.ai/' },
];

export const PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic (Claude)' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'qwen', label: '阿里云 (通义千问)' },
  { value: 'moonshot', label: '月之暗面 (Kimi)' },
  { value: 'minimax', label: 'MiniMax' },
  { value: 'ollama', label: 'Ollama (本地)' },
  { value: 'lmstudio', label: 'LM Studio (本地)' },
  { value: 'custom', label: '自定义' },
];

export const PROVIDER_DEFAULTS: Record<string, { model: string; baseURL: string }> = {
  openai: { model: 'gpt-4o', baseURL: 'https://api.openai.com/v1' },
  anthropic: { model: 'claude-3-5-sonnet-20241022', baseURL: 'https://api.anthropic.com/v1' },
  deepseek: { model: 'deepseek-chat', baseURL: 'https://api.deepseek.com/v1' },
  qwen: { model: 'qwen-max', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  moonshot: { model: 'moonshot-v1-8k-vision-preview', baseURL: 'https://api.moonshot.cn/v1' },
  minimax: { model: 'minimax-m2.5', baseURL: 'http://172.17.124.34:8118/v1' },
  ollama: { model: 'llama3.3', baseURL: 'http://localhost:11434/v1' },
  lmstudio: { model: 'llama-3.3-Instruct-Merged', baseURL: 'http://localhost:1234/v1' },
  custom: { model: '', baseURL: 'http://172.17.124.34:8118/v1' },
};
