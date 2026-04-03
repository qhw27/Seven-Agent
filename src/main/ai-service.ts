import axios, { AxiosError } from 'axios'
import { ModelConfig, ModelConfigStore, DEFAULT_MODEL_CONFIG, PRESET_MODELS, isLocalModel } from '../shared/model-config';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';


// 获取代理配置
function getProxyConfig() {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy
  if (!proxyUrl) return null

  try {
    const url = new URL(proxyUrl)
    return {
      protocol: url.protocol.replace(':', ''),
      host: url.hostname,
      port: url.port ? parseInt(url.port) : 80
    }
  } catch {
    return null
  }
}


// 消息格式
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

// 工具定义
export interface Tool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, unknown>
      required?: string[]
    }
  }
}

// 工具调用格式
export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface ToolCallResult {
  tool_call_id: string
  content: string
}

// 工具执行器类型
type ToolExecutor = (name: string, args: string) => Promise<string>

// ========== 修复：使用文件存储替代 localStorage ==========
const STORAGE_KEY = 'sevenclaw-model-config-store';

// 获取配置存储路径
function getConfigPath(): string {
  const userDataPath = app?.getPath?.('userData') || process.cwd();
  return path.join(userDataPath, 'model-config.json');
}

function loadFromStorage(): ModelConfigStore {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(data) as ModelConfigStore;
      if (parsed.models && parsed.models.length > 0) return parsed;
    }
  } catch (e) { console.error('[AI] 加载配置失败:', e); }
  return { models: [{ ...DEFAULT_MODEL_CONFIG }], activeModelId: DEFAULT_MODEL_CONFIG.id };
}

function saveToStorage(store: ModelConfigStore): void {
  try {
    const configPath = getConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(store, null, 2), 'utf-8');
  } catch (e) { console.error('[AI] 保存配置失败:', e); }
}

function exportConfig(): string {
  return JSON.stringify(loadFromStorage(), null, 2);
}

function importConfig(json: string): boolean {
  try {
    const config = JSON.parse(json) as ModelConfigStore;
    if (config.models && Array.isArray(config.models) && config.models.length > 0) {
      saveToStorage(config); return true;
    }
  } catch (e) { console.error('[AI] 导入失败:', e); }
  return false;
}
// ========== 存储修复结束 ==========

// 默认模型 - 使用正确的字段名
export const DEFAULT_MODEL: ModelConfig = {
  ...DEFAULT_MODEL_CONFIG,
  model: 'claude-3-5-sonnet-20241022',  // 使用 model 而非 modelName
};

// 兼容旧字段的辅助函数
function getModelName(config: ModelConfig): string {
  return config.model || (config as any).modelName || '';
}

function getEndpoint(config: ModelConfig): string {
  return config.baseURL || (config as any).endpoint || '';
}

// AI 提供者接口 (支持工具调用)
interface AIProvider {
  chat(messages: ChatMessage[], config: ModelConfig, tools?: Tool[]): Promise<{ content: string; toolCalls?: ToolCall[] }>
}

// 通义千问 (阿里云)
class QwenProvider implements AIProvider {
  async chat(messages: ChatMessage[], config: ModelConfig, tools?: Tool[]): Promise<{ content: string; toolCalls?: ToolCall[] }> {
    const endpoint = getEndpoint(config) || 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    const url = `${endpoint}/chat/completions`

    const proxy = getProxyConfig()
    const axiosConfig: any = {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      }
    }
    if (proxy) {
      axiosConfig.proxy = proxy
    }

    const requestBody: any = {
      model: getModelName(config) || 'qwen-turbo',
      messages: messages,
      temperature: 0.7
    }

    // 添加工具支持
    if (tools && tools.length > 0) {
      requestBody.tools = tools
    }

    const response = await axios.post(url, requestBody, axiosConfig)

    const message = response.data.choices[0]?.message
    return {
      content: message?.content || '',
      toolCalls: message?.tool_calls
    }
  }
}

// Kimi (月之暗面)
class KimiProvider implements AIProvider {
  async chat(messages: ChatMessage[], config: ModelConfig, tools?: Tool[]): Promise<{ content: string; toolCalls?: ToolCall[] }> {
    const endpoint = getEndpoint(config) || 'https://api.moonshot.cn/v1'
    const url = `${endpoint}/chat/completions`

    const proxy = getProxyConfig()
    const axiosConfig: any = {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      }
    }
    if (proxy) {
      axiosConfig.proxy = proxy
    }

    const requestBody: any = {
      model: getModelName(config) || 'moonshot-v1-8k-vision-preview',
      messages: messages,
      temperature: 0.7
    }

    if (tools && tools.length > 0) {
      requestBody.tools = tools
    }

    const response = await axios.post(url, requestBody, axiosConfig)

    const message = response.data.choices[0]?.message
    return {
      content: message?.content || '',
      toolCalls: message?.tool_calls
    }
  }
}

// MiniMax
class MiniMaxProvider implements AIProvider {
  async chat(messages: ChatMessage[], config: ModelConfig, tools?: Tool[]): Promise<{ content: string; toolCalls?: ToolCall[] }> {
    const endpoint = getEndpoint(config) || 'https://api.minimax.chat/v1'
    // 内部 API 使用 /chat/completions，外部 API 使用 /text/chatcompletion_v2
    const isInternal = endpoint.includes('172.17.124.34') || endpoint.includes('localhost')
    const url = isInternal
      ? `${endpoint}/chat/completions`
      : `${endpoint}/text/chatcompletion_v2`

    console.log('[MiniMax] URL:', url)
    console.log('[MiniMax] Model:', getModelName(config))
    console.log('[MiniMax] API Key prefix:', config.apiKey?.substring(0, 10))

    const proxy = getProxyConfig()
    const axiosConfig: any = {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 3000000
    }
    if (proxy) {
      axiosConfig.proxy = proxy
    }

    const requestBody: any = {
      model: getModelName(config) || 'minimax-m2.5',
      messages: messages,
      temperature: 0.7
    }

    if (tools && tools.length > 0) {
      requestBody.tools = tools
    }

    const response = await axios.post(url, requestBody, axiosConfig)

    console.log('[MiniMax] Response status:', response.status)
    console.log('[MiniMax] Response keys:', Object.keys(response.data))

    const message = response.data.choices?.[0]?.message
    const content = message?.content ||
                    response.data.choices?.[0]?.content ||
                    response.data.text ||
                    message?.content ||
                    ''

    return {
      content,
      toolCalls: message?.tool_calls
    }
  }
}

// DeepSeek
class DeepSeekProvider implements AIProvider {
  async chat(messages: ChatMessage[], config: ModelConfig, tools?: Tool[]): Promise<{ content: string; toolCalls?: ToolCall[] }> {
    const endpoint = getEndpoint(config) || 'https://api.deepseek.com/v1'
    const url = `${endpoint}/chat/completions`

    const proxy = getProxyConfig()
    const axiosConfig: any = {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      }
    }
    if (proxy) {
      axiosConfig.proxy = proxy
    }

    const requestBody: any = {
      model: getModelName(config) || 'deepseek-chat',
      messages: messages,
      temperature: 0.7
    }

    if (tools && tools.length > 0) {
      requestBody.tools = tools
    }

    const response = await axios.post(url, requestBody, axiosConfig)

    const message = response.data.choices[0]?.message
    return {
      content: message?.content || '',
      toolCalls: message?.tool_calls
    }
  }
}

// OpenAI
class OpenAIProvider implements AIProvider {
  async chat(messages: ChatMessage[], config: ModelConfig, tools?: Tool[]): Promise<{ content: string; toolCalls?: ToolCall[] }> {
    const endpoint = getEndpoint(config) || 'https://api.openai.com/v1'
    const url = `${endpoint}/chat/completions`

    const proxy = getProxyConfig()
    const axiosConfig: any = {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      }
    }
    if (proxy) {
      axiosConfig.proxy = proxy
    }

    const requestBody: any = {
      model: getModelName(config) || 'gpt-4',
      messages: messages,
      temperature: 0.7
    }

    if (tools && tools.length > 0) {
      requestBody.tools = tools
    }

    const response = await axios.post(url, requestBody, axiosConfig)

    const message = response.data.choices[0]?.message
    return {
      content: message?.content || '',
      toolCalls: message?.tool_calls
    }
  }
}

// Anthropic Claude
class AnthropicProvider implements AIProvider {
  async chat(messages: ChatMessage[], config: ModelConfig, tools?: Tool[]): Promise<{ content: string; toolCalls?: ToolCall[] }> {
    const endpoint = getEndpoint(config) || 'https://api.anthropic.com/v1'
    const url = `${endpoint}/messages`

    const convertedMessages = messages
      .map(m => ({ 
        role: m.role === 'assistant' ? 'assistant' : (m.role === 'system' ? 'user' : 'user'), 
        content: m.content 
      }))

    const proxy = getProxyConfig()
    const axiosConfig: any = {
      headers: {
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      }
    }
    if (proxy) {
      axiosConfig.proxy = proxy
    }

    // Anthropic 使用 tools 字段而不是 tool_calls
    const requestBody: any = {
      model: getModelName(config) || 'claude-3-5-sonnet-20241022',
      messages: convertedMessages,
      max_tokens: 4096
    }

    if (tools && tools.length > 0) {
      requestBody.tools = tools
    }

    const response = await axios.post(url, requestBody, axiosConfig)

    // Anthropic 返回的是 content 数组
    const content = response.data.content?.[0]?.text || ''
    return { content }
  }
}

// Ollama 本地模型
class OllamaProvider implements AIProvider {
  async chat(messages: ChatMessage[], config: ModelConfig, tools?: Tool[]): Promise<{ content: string; toolCalls?: ToolCall[] }> {
    const endpoint = getEndpoint(config) || 'http://localhost:11434'
    const url = `${endpoint}/api/chat`

    const response = await axios.post(url, {
      model: getModelName(config) || 'llama3.3',
      messages: messages,
      stream: false
    })

    return {
      content: response.data.message?.content || ''
    }
  }
}

// LM Studio 本地模型
class LMStudioProvider implements AIProvider {
  async chat(messages: ChatMessage[], config: ModelConfig, tools?: Tool[]): Promise<{ content: string; toolCalls?: ToolCall[] }> {
    const endpoint = getEndpoint(config) || 'http://localhost:1234/v1'
    const url = `${endpoint}/chat/completions`

    const requestBody: any = {
      model: getModelName(config) || 'llama-3.3-Instruct-Merged',
      messages: messages,
      temperature: 0.7
    }

    if (tools && tools.length > 0) {
      requestBody.tools = tools
    }

    const response = await axios.post(url, requestBody, {
      headers: {
        'Content-Type': 'application/json'
      }
    })

    const message = response.data.choices[0]?.message
    return {
      content: message?.content || '',
      toolCalls: message?.tool_calls
    }
  }
}

// AI 服务工厂
class AIService {
  private providers: Map<string, AIProvider> = new Map()
  private configStore: ModelConfigStore;
  private toolExecutor: ToolExecutor | null = null;

  constructor() {
    this.providers.set('qwen', new QwenProvider())
    this.providers.set('aliyun', new QwenProvider())
    this.providers.set('moonshot', new KimiProvider())
    this.providers.set('minimax', new MiniMaxProvider())
    this.providers.set('deepseek', new DeepSeekProvider())
    this.providers.set('openai', new OpenAIProvider())
    this.providers.set('anthropic', new AnthropicProvider())
    this.providers.set('ollama', new OllamaProvider())
    this.providers.set('lmstudio', new LMStudioProvider())

    // 初始化时加载配置
    this.configStore = loadFromStorage();
  }

  // 设置工具执行器
  setToolExecutor(executor: ToolExecutor): void {
    this.toolExecutor = executor
  }

  // 获取所有模型配置
  getConfigStore(): ModelConfigStore {
    return this.configStore;
  }

  // 获取当前活跃模型
  getActiveModel(): ModelConfig {
    const model = this.configStore.models.find(m => m.id === this.configStore.activeModelId);
    return model || this.configStore.models[0] || DEFAULT_MODEL;
  }

  // 设置活跃模型
  setActiveModel(modelId: string): void {
    if (this.configStore.models.some(m => m.id === modelId)) {
      this.configStore.activeModelId = modelId;
      saveToStorage(this.configStore);
    }
  }

  // 添加模型
  addModel(model: ModelConfig): void {
    if (!this.configStore.models.some(m => m.id === model.id)) {
      this.configStore.models.push(model);
      saveToStorage(this.configStore);
    }
  }

  // 更新模型
  updateModel(modelId: string, updates: Partial<ModelConfig>): void {
    const index = this.configStore.models.findIndex(m => m.id === modelId);
    if (index !== -1) {
      this.configStore.models[index] = { ...this.configStore.models[index], ...updates };
      saveToStorage(this.configStore);
    }
  }

  // 删除模型
  deleteModel(modelId: string): void {
    if (this.configStore.models.length > 1) {
      const index = this.configStore.models.findIndex(m => m.id === modelId);
      if (index !== -1) {
        this.configStore.models.splice(index, 1);
        if (this.configStore.activeModelId === modelId) {
          this.configStore.activeModelId = this.configStore.models[0].id;
        }
        saveToStorage(this.configStore);
      }
    }
  }

  // 获取预设模型列表
  getModels(): ModelConfig[] {
    return PRESET_MODELS as ModelConfig[];
  }

  // 根据 ID 获取模型配置
  getModelById(id: string): ModelConfig | undefined {
    return PRESET_MODELS.find(m => m.id === id) as ModelConfig | undefined;
  }

  // 更新模型 API Key
  updateModelApiKey(id: string, apiKey: string): void {
    const model = PRESET_MODELS.find(m => m.id === id)
    if (model) {
      (model as any).apiKey = apiKey;
    }
    // 同时更新存储的配置
    this.updateModel(id, { apiKey });
  }

  // 简单的聊天方法 (不带工具)
  async chat(messages: ChatMessage[], config: ModelConfig): Promise<string> {
    const result = await this.chatWithTools(messages, config)
    return result.content
  }

  // 带工具调用的聊天方法
  async chatWithTools(messages: ChatMessage[], config: ModelConfig, tools?: Tool[]): Promise<{ content: string; toolCalls?: ToolCall[] }> {
    const provider = this.providers.get(config.provider)
    if (!provider) {
      throw new Error(`Unknown provider: ${config.provider}`)
    }

    // ✅ 修复：本地模型不需要 API Key
    const endpoint = getEndpoint(config);
    if (!config.apiKey && !isLocalModel(endpoint)) {
      throw new Error(`请先配置 ${config.name || config.provider} 的 API Key`)
    }

    try {
      return await provider.chat(messages, config, tools)
    } catch (error) {
      const axiosError = error as AxiosError
      console.error(`[AI] ${config.provider} error:`, axiosError.message)
      if (axiosError.response) {
        console.error('[AI] Response status:', axiosError.response.status)
        console.error('[AI] Response data:', axiosError.response.data)
      }
      throw new Error(`AI 调用失败: ${axiosError.message}`)
    }
  }

  // 工具调用循环 - 核心方法
  async chatWithToolLoop(
    messages: ChatMessage[],
    config: ModelConfig,
    tools: Tool[],
    maxIterations: number = 10
  ): Promise<string> {
    let currentMessages = [...messages]
    let iterations = 0

    while (iterations < maxIterations) {
      iterations++

      // 调用 AI
      const response = await this.chatWithTools(currentMessages, config, tools)

      // 添加助手回复到消息历史
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.content,
        tool_calls: response.toolCalls
      }
      currentMessages = [...currentMessages, assistantMessage]

      // 如果没有工具调用，直接返回内容
      if (!response.toolCalls || response.toolCalls.length === 0) {
        return response.content
      }

      // 执行工具调用
      for (const toolCall of response.toolCalls) {
        console.log(`[Tool] Executing: ${toolCall.function.name}`)

        let toolResult: string
        try {
          if (this.toolExecutor) {
            toolResult = await this.toolExecutor(toolCall.function.name, toolCall.function.arguments)
          } else {
            toolResult = JSON.stringify({ error: 'No tool executor configured' })
          }
        } catch (error) {
          toolResult = JSON.stringify({ error: (error as Error).message })
        }

        // 添加工具结果到消息历史
        const toolMessage: ChatMessage = {
          role: 'tool',
          content: toolResult,
          tool_call_id: toolCall.id
        }
        currentMessages = [...currentMessages, toolMessage]
      }
    }

    console.warn(`[Tool] Max iterations (${maxIterations}) reached`)
    return currentMessages.find(m => m.role === 'assistant')?.content || '工具调用达到最大次数'
  }

  // 测试模型连接
  async testConnection(config: ModelConfig): Promise<{ success: boolean; message: string }> {
    try {
      const testMessage: ChatMessage[] = [{ role: 'user', content: 'hi' }]
      await this.chat(testMessage, config)
      return { success: true, message: '连接成功' }
    } catch (error) {
      return { success: false, message: (error as Error).message || '连接失败' }
    }
  }
}

export const aiService = new AIService()
export type { AIProvider }