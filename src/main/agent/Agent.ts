/**
 * Agent 核心类
 * 基于 @mariozechner/pi-agent-core 架构实现
 */

import uuidv4 from '../utils/uuid'
import {
  type AgentMessage,
  type AgentEvent,
  type AgentEventCallback,
  type AgentTool,
  type AgentToolCall,
  type AgentToolResult,
  type AgentOptions,
  type AgentState,
  type AgentModel,
  type AgentContext,
  type ToolExecutionMode,
  type ThinkingLevel,
} from './types'

/**
 * Agent 类 - 核心实现
 */
export class Agent {
  private _state: AgentState
  private listeners: Set<AgentEventCallback> = new Set()
  private abortController: AbortController | null = null
  private steeringQueue: AgentMessage[] = []
  private followUpQueue: AgentMessage[] = []
  private toolExecution: ToolExecutionMode
  private maxIterations: number
  private _convertToLlm: (messages: AgentMessage[]) => any[]
  private _transformContext?: (messages: AgentMessage[]) => Promise<AgentMessage[]>

  // LLM 调用函数 (由外部注入)
  private llmCall: ((context: AgentContext, signal?: AbortSignal) => Promise<{ content: string; toolCalls?: AgentToolCall[] }>) | null = null

  constructor(options: AgentOptions = {}) {
    this._state = {
      systemPrompt: options.initialState?.systemPrompt || '',
      model: options.initialState?.model || { id: 'unknown', name: 'Unknown', provider: 'unknown' },
      thinkingLevel: options.initialState?.thinkingLevel || 'medium',
      tools: options.initialState?.tools || [],
      messages: options.initialState?.messages || [],
      isStreaming: false,
      pendingToolCalls: new Set(),
      error: undefined,
    }

    this.toolExecution = options.toolExecution || 'parallel'
    this.maxIterations = options.maxIterations || 10
    this._convertToLlm = options.convertToLlm || this.defaultConvertToLlm
    this._transformContext = options.transformContext
  }

  /**
   * 默认消息转换
   */
  private defaultConvertToLlm(messages: AgentMessage[]): any[] {
    return messages.map(m => ({
      role: m.role,
      content: m.content,
      tool_calls: m.toolCalls,
      tool_call_id: m.toolCallId,
    }))
  }

  /**
   * 设置 LLM 调用函数
   */
  setLLMCall(fn: (context: AgentContext, signal?: AbortSignal) => Promise<{ content: string; toolCalls?: AgentToolCall[] }>): void {
    this.llmCall = fn
  }

  /**
   * 获取状态
   */
  get state(): AgentState {
    return this._state
  }

  /**
   * 订阅事件
   */
  subscribe(callback: AgentEventCallback): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  /**
   * 发送事件
   */
  private emit(event: AgentEvent): void {
    for (const callback of this.listeners) {
      try {
        callback(event)
      } catch (error) {
        console.error('[Agent] Event callback error:', error)
      }
    }
  }

  /**
   * 设置系统提示词
   */
  setSystemPrompt(prompt: string): void {
    this._state.systemPrompt = prompt
  }

  /**
   * 设置模型
   */
  setModel(model: AgentModel): void {
    this._state.model = model
  }

  /**
   * 设置思考级别
   */
  setThinkingLevel(level: ThinkingLevel): void {
    this._state.thinkingLevel = level
  }

  /**
   * 设置工具
   */
  setTools(tools: AgentTool[]): void {
    this._state.tools = tools
  }

  /**
   * 添加工具
   */
  addTool(tool: AgentTool): void {
    this._state.tools.push(tool)
  }

  /**
   * 获取消息历史
   */
  getMessages(): AgentMessage[] {
    return [...this._state.messages]
  }

  /**
   * 替换消息历史
   */
  replaceMessages(messages: AgentMessage[]): void {
    this._state.messages = [...messages]
  }

  /**
   * 追加消息
   */
  appendMessage(message: AgentMessage): void {
    this._state.messages.push(message)
  }

  /**
   * 清除消息
   */
  clearMessages(): void {
    this._state.messages = []
  }

  /**
   * 清除所有队列
   */
  clearAllQueues(): void {
    this.steeringQueue = []
    this.followUpQueue = []
  }

  /**
   * Steering - 运行时注入消息
   */
  steer(message: AgentMessage | string): void {
    const msg: AgentMessage = typeof message === 'string'
      ? { id: uuidv4(), role: 'user', content: message, timestamp: Date.now() }
      : message
    this.steeringQueue.push(msg)
  }

  /**
   * FollowUp - 完成后处理
   */
  followUp(message: AgentMessage | string): void {
    const msg: AgentMessage = typeof message === 'string'
      ? { id: uuidv4(), role: 'user', content: message, timestamp: Date.now() }
      : message
    this.followUpQueue.push(msg)
  }

  /**
   * 获取中止信号
   */
  get signal(): AbortSignal | undefined {
    return this.abortController?.signal
  }

  /**
   * 中止当前操作
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
      this._state.isStreaming = false
    }
  }

  /**
   * 重置 Agent
   */
  reset(): void {
    this.abort()
    this.clearMessages()
    this.clearAllQueues()
    this._state.error = undefined
    this._state.pendingToolCalls.clear()
  }

  /**
   * 发送提示
   */
  async prompt(input: string | AgentMessage | AgentMessage[]): Promise<string> {
    // 创建新的 AbortController
    this.abortController = new AbortController()
    const signal = this.abortController.signal

    // 准备消息
    let messages: AgentMessage[]
    if (typeof input === 'string') {
      messages = [{
        id: uuidv4(),
        role: 'user',
        content: input,
        timestamp: Date.now(),
      }]
    } else if (Array.isArray(input)) {
      messages = input
    } else {
      messages = [input]
    }

    // 添加到消息历史
    for (const msg of messages) {
      this._state.messages.push(msg)
    }

    // 开始 Agent 循环
    return this.runLoop(signal)
  }

  /**
   * Agent 循环
   */
  private async runLoop(signal: AbortSignal): Promise<string> {
    this._state.isStreaming = true
    this.emit({ type: 'agent_start' })

    let iterations = 0
    let lastContent = ''

    try {
      while (iterations < this.maxIterations) {
        // 检查中止信号
        if (signal.aborted) {
          throw new Error('Agent aborted')
        }

        iterations++
        this.emit({ type: 'turn_start' })

        // 应用上下文转换
        let contextMessages = this._state.messages
        if (this._transformContext) {
          contextMessages = await this._transformContext(contextMessages)
        }

        // 处理 steering 消息
        const steeringMessages = this.dequeueSteeringMessages()
        if (steeringMessages.length > 0) {
          contextMessages = [...contextMessages, ...steeringMessages]
          this._state.messages.push(...steeringMessages)
        }

        // 构建 Agent 上下文
        const context: AgentContext = {
          systemPrompt: this._state.systemPrompt,
          messages: contextMessages,
          tools: this._state.tools,
        }

        // 调用 LLM
        if (!this.llmCall) {
          throw new Error('LLM call function not set')
        }

        const response = await this.llmCall(context, signal)

        // 创建助手消息
        const assistantMessage: AgentMessage = {
          id: uuidv4(),
          role: 'assistant',
          content: response.content,
          timestamp: Date.now(),
          toolCalls: response.toolCalls,
        }

        this._state.messages.push(assistantMessage)
        this.emit({ type: 'message_start', message: assistantMessage })

        lastContent = response.content

        // 如果没有工具调用，检查 followUp
        if (!response.toolCalls || response.toolCalls.length === 0) {
          const followUpMessages = this.dequeueFollowUpMessages()
          if (followUpMessages.length > 0) {
            this._state.messages.push(...followUpMessages)
            continue
          }

          // 结束循环
          this.emit({ type: 'turn_end', message: assistantMessage, data: { toolResults: [] } })
          break
        }

        // 执行工具调用
        const toolResults = await this.executeToolCalls(response.toolCalls, signal)

        // 添加工具结果到消息历史
        for (const result of toolResults) {
          const toolMessage: AgentMessage = {
            id: uuidv4(),
            role: 'tool',
            content: result.content,
            timestamp: Date.now(),
            toolCallId: result.toolCallId,
            metadata: { isError: result.isError },
          }
          this._state.messages.push(toolMessage)
        }

        this.emit({ type: 'turn_end', message: assistantMessage, data: { toolResults } })
      }

      if (iterations >= this.maxIterations) {
        console.warn(`[Agent] Max iterations (${this.maxIterations}) reached`)
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this._state.error = errorMessage
      this.emit({ type: 'error', error: errorMessage })
      throw error
    } finally {
      this._state.isStreaming = false
      this.abortController = null
      this.emit({ type: 'agent_end', data: { messages: this._state.messages } })
    }

    return lastContent
  }

  /**
   * 执行工具调用
   */
  private async executeToolCalls(
    toolCalls: AgentToolCall[],
    signal: AbortSignal
  ): Promise<Array<AgentToolResult & { toolCallId: string; toolName: string }>> {
    const results: Array<AgentToolResult & { toolCallId: string; toolName: string }> = []

    if (this.toolExecution === 'parallel') {
      // 并行执行
      const promises = toolCalls.map(tc => this.executeSingleTool(tc, signal))
      const settled = await Promise.allSettled(promises)

      for (let i = 0; i < settled.length; i++) {
        const result = settled[i]
        if (result.status === 'fulfilled') {
          results.push(result.value)
        } else {
          results.push({
            toolCallId: toolCalls[i].id,
            toolName: toolCalls[i].name,
            content: `Error: ${result.reason}`,
            isError: true,
          })
        }
      }
    } else {
      // 顺序执行
      for (const tc of toolCalls) {
        if (signal.aborted) break
        const result = await this.executeSingleTool(tc, signal)
        results.push(result)
      }
    }

    return results
  }

  /**
   * 执行单个工具
   */
  private async executeSingleTool(
    toolCall: AgentToolCall,
    signal: AbortSignal
  ): Promise<AgentToolResult & { toolCallId: string; toolName: string }> {
    const tool = this._state.tools.find(t => t.name === toolCall.name)

    this.emit({
      type: 'tool_execution_start',
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      args: toolCall.arguments,
    })

    if (!tool) {
      const result = {
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        content: `Tool not found: ${toolCall.name}`,
        isError: true,
      }
      this.emit({ type: 'tool_execution_end', ...result })
      return result
    }

    try {
      // 解析参数
      let args: any = {}
      try {
        args = JSON.parse(toolCall.arguments)
      } catch {
        args = {}
      }

      // 执行工具
      const result = await tool.execute(toolCall.id, args, signal, (partial) => {
        this.emit({
          type: 'tool_execution_update',
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          args,
          result: partial,
        })
      })

      const finalResult = {
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        content: result.content,
        details: result.details,
        isError: result.isError || false,
      }

      this.emit({ type: 'tool_execution_end', ...finalResult })
      return finalResult

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const result = {
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        content: `Error: ${errorMessage}`,
        isError: true,
      }
      this.emit({ type: 'tool_execution_end', ...result })
      return result
    }
  }

  /**
   * 获取 steering 消息
   */
  private dequeueSteeringMessages(): AgentMessage[] {
    const messages = [...this.steeringQueue]
    this.steeringQueue = []
    return messages
  }

  /**
   * 获取 followUp 消息
   */
  private dequeueFollowUpMessages(): AgentMessage[] {
    const messages = [...this.followUpQueue]
    this.followUpQueue = []
    return messages
  }

  /**
   * 等待空闲
   */
  async waitForIdle(): Promise<void> {
    while (this._state.isStreaming) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
}

export default Agent
