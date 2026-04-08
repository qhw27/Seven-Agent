/**
 * Agent 服务 - 连接 Agent 和现有 AI 服务
 */

import { Agent } from './Agent'
import {
  type AgentMessage,
  type AgentEventCallback,
  type AgentTool,
  type AgentToolCall,
  type AgentContext,
  type AgentModel,
  type ThinkingLevel,
  type ToolExecutionMode,
} from './types'
import { aiService } from '../ai-service'

/**
 * Agent 服务配置
 */
interface AgentServiceConfig {
  systemPrompt?: string
  thinkingLevel?: ThinkingLevel
  toolExecution?: ToolExecutionMode
  maxIterations?: number
}

/**
 * 默认系统提示词
 */
const DEFAULT_SYSTEM_PROMPT = `你是一个智能助手，可以帮助用户完成各种任务。
你可以使用工具来完成任务，请根据用户的需求选择合适的工具。
如果不需要使用工具，请直接回答用户的问题。`

/**
 * Agent 服务类
 */
class AgentService {
  private agent: Agent | null = null
  private _currentApiKey: string = ''
  private _eventHandler: AgentEventCallback | null = null
  private _unsubscribe: (() => void) | null = null

  /**
   * 初始化 Agent
   */
  async initialize(config: AgentServiceConfig = {}): Promise<Agent> {
    if (this.agent) {
      return this.agent
    }

    // 获取当前激活的模型配置
    const modelConfig = aiService.getActiveModel()
    this._currentApiKey = modelConfig.apiKey || ''

    // 创建 Agent
    this.agent = new Agent({
      initialState: {
        systemPrompt: config.systemPrompt || DEFAULT_SYSTEM_PROMPT,
        model: this.convertToAgentModel(modelConfig),
        thinkingLevel: config.thinkingLevel || 'medium',
        tools: [],
        messages: [],
        isStreaming: false,
        pendingToolCalls: new Set(),
      },
      toolExecution: config.toolExecution || 'parallel',
      maxIterations: config.maxIterations || 10,
    })

    // 设置 LLM 调用函数
    this.agent.setLLMCall(async (context, signal) => {
      return this.callLLM(context, signal)
    })

    console.log('[AgentService] Agent 初始化完成，使用模型:', modelConfig.name)
    return this.agent
  }

  /**
   * 将模型配置转换为 Agent 模型
   */
  private convertToAgentModel(config: any): AgentModel {
    return {
      id: config.model || config.id || 'unknown',
      name: config.name || 'Unknown Model',
      provider: config.provider || 'unknown',
      baseURL: config.baseURL || '',
      apiKey: config.apiKey,
      contextWindow: config.contextWindow || 32000,
      maxTokens: config.maxTokens || 8192,
      cost: config.cost || { input: 0, output: 0 },
    }
  }

  /**
   * 调用 LLM
   */
  private async callLLM(
    context: AgentContext,
    _signal?: AbortSignal
  ): Promise<{ content: string; toolCalls?: AgentToolCall[] }> {
    // 获取当前模型配置
    const modelConfig = aiService.getActiveModel()
    this._currentApiKey = modelConfig.apiKey || ''

    // 转换消息格式
    const messages = context.messages.map(m => ({
      role: m.role,
      content: m.content,
      tool_calls: m.toolCalls?.map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: tc.arguments,
        },
      })),
      tool_call_id: m.toolCallId,
    }))

    // 构建工具定义
    const tools = context.tools?.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }))

    try {
      // 调用 AI 服务
      const result = await aiService.chatWithTools(
        messages as any,
        modelConfig,
        tools as any
      )

      return {
        content: result.content || '',
        toolCalls: result.toolCalls?.map(tc => ({
          id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments,
        })),
      }
    } catch (error) {
      console.error('[AgentService] LLM 调用失败:', error)
      throw error
    }
  }

  /**
   * 重新初始化 Agent
   */
  async reinitialize(config: AgentServiceConfig = {}): Promise<Agent> {
    this.agent = null
    return this.initialize(config)
  }

  /**
   * 订阅 Agent 事件
   */
  subscribe(handler: AgentEventCallback): () => void {
    this._eventHandler = handler

    if (this.agent) {
      this._unsubscribe = this.agent.subscribe(handler)
    }

    return () => {
      if (this._unsubscribe) {
        this._unsubscribe()
        this._unsubscribe = null
      }
      this._eventHandler = null
    }
  }

  /**
   * 发送用户消息
   */
  async prompt(input: string): Promise<string> {
    if (!this.agent) {
      await this.initialize()
    }

    if (!this.agent) {
      throw new Error('Agent 未初始化')
    }

    return this.agent.prompt(input)
  }

  /**
   * 获取 Agent 实例
   */
  getAgent(): Agent | null {
    return this.agent
  }

  /**
   * 获取消息历史
   */
  getMessages(): AgentMessage[] {
    if (!this.agent) {
      return []
    }
    return this.agent.getMessages()
  }

  /**
   * 清除消息历史
   */
  clearMessages(): void {
    if (this.agent) {
      this.agent.clearMessages()
    }
  }

  /**
   * 中止当前操作
   */
  abort(): void {
    if (this.agent) {
      this.agent.abort()
    }
  }

  /**
   * 重置 Agent
   */
  reset(): void {
    if (this.agent) {
      this.agent.reset()
    }
  }

  /**
   * 设置系统提示词
   */
  setSystemPrompt(prompt: string): void {
    if (this.agent) {
      this.agent.setSystemPrompt(prompt)
    }
  }

  /**
   * 设置工具
   */
  setTools(tools: AgentTool[]): void {
    if (this.agent) {
      this.agent.setTools(tools)
    }
  }

  /**
   * 添加工具
   */
  addTool(tool: AgentTool): void {
    if (this.agent) {
      this.agent.addTool(tool)
    }
  }

  /**
   * 重新加载模型配置
   */
  async reloadModel(): Promise<void> {
    if (!this.agent) {
      return
    }

    const modelConfig = aiService.getActiveModel()
    this._currentApiKey = modelConfig.apiKey || ''
    this.agent.setModel(this.convertToAgentModel(modelConfig))

    console.log('[AgentService] 模型已切换为:', modelConfig.name)
  }

  /**
   * Steering - 运行时注入消息
   */
  steer(message: string | AgentMessage): void {
    if (this.agent) {
      this.agent.steer(message)
    }
  }

  /**
   * FollowUp - 完成后处理
   */
  followUp(message: string | AgentMessage): void {
    if (this.agent) {
      this.agent.followUp(message)
    }
  }

  /**
   * 加载历史消息
   */
  loadMessages(messages: AgentMessage[]): void {
    if (!this.agent) {
      console.warn('[AgentService] Agent 未初始化，无法加载消息')
      return
    }

    this.agent.replaceMessages(messages)
    console.log('[AgentService] 已加载历史消息，数量:', messages.length)
  }
}

// 导出单例
export const agentService = new AgentService()
export { Agent }
export default agentService
