/**
 * Agent 类型定义
 * 基于 @mariozechner/pi-agent-core 架构
 */

/**
 * 简化的 Schema 类型 (不依赖 TypeBox)
 */
export type TSchema = any
export type Static<T> = any

/**
 * 工具执行模式
 * - sequential: 顺序执行
 * - parallel: 并行执行
 */
export type ToolExecutionMode = 'sequential' | 'parallel'

/**
 * 思考级别
 */
export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high'

/**
 * Agent 消息类型
 */
export type AgentMessageRole = 'user' | 'assistant' | 'system' | 'tool'

/**
 * Agent 消息
 */
export interface AgentMessage {
  id: string
  role: AgentMessageRole
  content: string
  timestamp: number
  toolCalls?: AgentToolCall[]
  toolCallId?: string
  metadata?: Record<string, any>
}

/**
 * 工具调用
 */
export interface AgentToolCall {
  id: string
  name: string
  arguments: string
}

/**
 * 工具执行结果
 */
export interface AgentToolResult<T = any> {
  content: string
  details?: T
  isError?: boolean
}

/**
 * Agent 工具定义
 */
export interface AgentTool<TParameters = any, TDetails = any> {
  /** 工具唯一标识 */
  name: string
  /** 工具描述 */
  description: string
  /** 工具显示名称 */
  label: string
  /** 参数 Schema */
  parameters: TParameters
  /** 执行函数 */
  execute: (
    toolCallId: string,
    params: any,
    signal?: AbortSignal,
    onUpdate?: (partialResult: AgentToolResult<TDetails>) => void
  ) => Promise<AgentToolResult<TDetails>>
}

/**
 * Agent 事件类型
 */
export type AgentEventType =
  | 'agent_start'
  | 'agent_end'
  | 'turn_start'
  | 'turn_end'
  | 'message_start'
  | 'message_update'
  | 'message_end'
  | 'tool_execution_start'
  | 'tool_execution_update'
  | 'tool_execution_end'
  | 'error'

/**
 * Agent 事件
 */
export interface AgentEvent {
  type: AgentEventType
  data?: any
  message?: AgentMessage
  toolCallId?: string
  toolName?: string
  args?: any
  result?: any
  isError?: boolean
  error?: string
}

/**
 * Agent 状态
 */
export interface AgentState {
  systemPrompt: string
  model: AgentModel
  thinkingLevel: ThinkingLevel
  tools: AgentTool[]
  messages: AgentMessage[]
  isStreaming: boolean
  pendingToolCalls: Set<string>
  error?: string
}

/**
 * Agent 模型配置
 */
export interface AgentModel {
  id: string
  name: string
  provider: string
  baseURL?: string
  apiKey?: string
  contextWindow?: number
  maxTokens?: number
  cost?: {
    input: number
    output: number
    cacheRead?: number
    cacheWrite?: number
  }
}

/**
 * Agent 配置选项
 */
export interface AgentOptions {
  initialState?: Partial<AgentState>
  toolExecution?: ToolExecutionMode
  thinkingLevel?: ThinkingLevel
  maxIterations?: number
  convertToLlm?: (messages: AgentMessage[]) => any[]
  transformContext?: (messages: AgentMessage[]) => Promise<AgentMessage[]>
}

/**
 * Agent 上下文
 */
export interface AgentContext {
  systemPrompt: string
  messages: AgentMessage[]
  tools?: AgentTool[]
  sessionId?: string
}

/**
 * Steering 消息 - 运行时注入
 */
export interface SteeringMessage {
  content: string
  priority?: 'high' | 'normal' | 'low'
}

/**
 * FollowUp 消息 - 完成后处理
 */
export interface FollowUpMessage {
  content: string
  delay?: number
}

/**
 * 多 Agent 协调配置
 */
export interface CoordinatorConfig {
  /** 协调器 ID */
  id: string
  /** 协调器名称 */
  name: string
  /** 子 Agent 列表 */
  agents: AgentConfig[]
  /** 协调策略 */
  strategy: 'round-robin' | 'priority' | 'broadcast' | 'router'
  /** 最大并发数 */
  maxConcurrency?: number
}

/**
 * Agent 配置
 */
export interface AgentConfig {
  id: string
  name: string
  role: string
  systemPrompt?: string
  tools?: string[]
  priority?: number
}

/**
 * 事件订阅回调
 */
export type AgentEventCallback = (event: AgentEvent) => void

/**
 * 工具执行上下文
 */
export interface ToolExecutionContext {
  agentId: string
  sessionId: string
  toolCallId: string
  toolName: string
  args: any
  timestamp: number
}
