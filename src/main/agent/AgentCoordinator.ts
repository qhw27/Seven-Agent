/**
 * Agent 协调器 - 多 Agent 协调系统
 */

import { Agent } from './Agent'
import {
  type AgentMessage,
  type AgentConfig,
  type CoordinatorConfig,
  type AgentContext,
} from './types'

/**
 * 子 Agent 状态
 */
interface SubAgentState {
  id: string
  name: string
  agent: Agent
  status: 'idle' | 'running' | 'error'
  lastResult?: string
  error?: string
}

/**
 * 协调事件
 */
interface CoordinatorEvent {
  type: 'coordinator_start' | 'coordinator_end' | 'agent_start' | 'agent_end' | 'error'
  agentId?: string
  agentName?: string
  result?: string
  error?: string
}

/**
 * 协调器回调
 */
type CoordinatorCallback = (event: CoordinatorEvent) => void

/**
 * Agent 协调器
 */
export class AgentCoordinator {
  private _id: string
  private _name: string
  private strategy: 'round-robin' | 'priority' | 'broadcast' | 'router'
  private maxConcurrency: number
  private agents: Map<string, SubAgentState> = new Map()
  private listeners: Set<CoordinatorCallback> = new Set()
  private currentIndex: number = 0

  constructor(config: CoordinatorConfig) {
    this._id = config.id
    this._name = config.name
    this.strategy = config.strategy
    this.maxConcurrency = config.maxConcurrency || 3
  }

  /**
   * 注册 Agent
   */
  registerAgent(config: AgentConfig, agent: Agent): void {
    this.agents.set(config.id, {
      id: config.id,
      name: config.name,
      agent,
      status: 'idle',
    })
  }

  /**
   * 注销 Agent
   */
  unregisterAgent(agentId: string): void {
    this.agents.delete(agentId)
  }

  /**
   * 获取 Agent 状态
   */
  getAgentStatus(agentId: string): SubAgentState | undefined {
    return this.agents.get(agentId)
  }

  /**
   * 获取所有 Agent 状态
   */
  getAllAgentStatus(): SubAgentState[] {
    return Array.from(this.agents.values())
  }

  /**
   * 订阅事件
   */
  subscribe(callback: CoordinatorCallback): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  /**
   * 发送事件
   */
  private emit(event: CoordinatorEvent): void {
    for (const callback of this.listeners) {
      try {
        callback(event)
      } catch (error) {
        console.error('[Coordinator] Event callback error:', error)
      }
    }
  }

  /**
   * 执行协调
   */
  async execute(input: string, _context?: AgentContext): Promise<string[]> {
    this.emit({ type: 'coordinator_start' })
    const results: string[] = []

    try {
      switch (this.strategy) {
        case 'round-robin':
          results.push(...(await this.executeRoundRobin(input)))
          break
        case 'priority':
          results.push(...(await this.executePriority(input)))
          break
        case 'broadcast':
          results.push(...(await this.executeBroadcast(input)))
          break
        case 'router':
          results.push(...(await this.executeRouter(input)))
          break
        default:
          throw new Error(`Unknown strategy: ${this.strategy}`)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.emit({ type: 'error', error: errorMessage })
      throw error
    } finally {
      this.emit({ type: 'coordinator_end' })
    }

    return results
  }

  /**
   * Round-Robin 策略
   */
  private async executeRoundRobin(input: string): Promise<string[]> {
    const results: string[] = []
    const agentList = Array.from(this.agents.values())

    if (agentList.length === 0) {
      return results
    }

    // 从当前索引开始，执行一个 Agent
    const agent = agentList[this.currentIndex % agentList.length]
    this.currentIndex++

    this.emit({ type: 'agent_start', agentId: agent.id, agentName: agent.name })
    agent.status = 'running'

    try {
      const result = await agent.agent.prompt(input)
      agent.lastResult = result
      agent.status = 'idle'
      this.emit({ type: 'agent_end', agentId: agent.id, agentName: agent.name, result })
      results.push(result)
    } catch (error) {
      agent.status = 'error'
      agent.error = error instanceof Error ? error.message : String(error)
      this.emit({ type: 'error', agentId: agent.id, agentName: agent.name, error: agent.error })
    }

    return results
  }

  /**
   * Priority 策略 - 按优先级顺序执行
   */
  private async executePriority(input: string): Promise<string[]> {
    const results: string[] = []
    const agentList = Array.from(this.agents.values())

    for (const agent of agentList) {
      if (agent.status === 'error') continue

      this.emit({ type: 'agent_start', agentId: agent.id, agentName: agent.name })
      agent.status = 'running'

      try {
        const result = await agent.agent.prompt(input)
        agent.lastResult = result
        agent.status = 'idle'
        this.emit({ type: 'agent_end', agentId: agent.id, agentName: agent.name, result })
        results.push(result)
      } catch (error) {
        agent.status = 'error'
        agent.error = error instanceof Error ? error.message : String(error)
        this.emit({ type: 'error', agentId: agent.id, agentName: agent.name, error: agent.error })
      }
    }

    return results
  }

  /**
   * Broadcast 策略 - 并行广播给所有 Agent
   */
  private async executeBroadcast(input: string): Promise<string[]> {
    const agentList = Array.from(this.agents.values())

    if (agentList.length === 0) {
      return []
    }

    // 并行执行，限制并发数
    const chunks: SubAgentState[][] = []
    for (let i = 0; i < agentList.length; i += this.maxConcurrency) {
      chunks.push(agentList.slice(i, i + this.maxConcurrency))
    }

    const results: string[] = []

    for (const chunk of chunks) {
      const promises = chunk.map(async agent => {
        this.emit({ type: 'agent_start', agentId: agent.id, agentName: agent.name })
        agent.status = 'running'

        try {
          const result = await agent.agent.prompt(input)
          agent.lastResult = result
          agent.status = 'idle'
          this.emit({ type: 'agent_end', agentId: agent.id, agentName: agent.name, result })
          return result
        } catch (error) {
          agent.status = 'error'
          agent.error = error instanceof Error ? error.message : String(error)
          this.emit({ type: 'error', agentId: agent.id, agentName: agent.name, error: agent.error })
          return null
        }
      })

      const chunkResults = await Promise.all(promises)
      results.push(...chunkResults.filter((r): r is string => r !== null))
    }

    return results
  }

  /**
   * Router 策略 - 路由到最合适的 Agent
   */
  private async executeRouter(input: string): Promise<string[]> {
    const agentList = Array.from(this.agents.values())

    if (agentList.length === 0) {
      return []
    }

    // 默认选择第一个 Agent
    let selectedAgent = agentList[0]

    // 简单的关键词匹配路由
    const inputLower = input.toLowerCase()
    for (const agent of agentList) {
      const keywords = agent.name.toLowerCase().split(' ')
      if (keywords.some(kw => inputLower.includes(kw))) {
        selectedAgent = agent
        break
      }
    }

    this.emit({ type: 'agent_start', agentId: selectedAgent.id, agentName: selectedAgent.name })
    selectedAgent.status = 'running'

    try {
      const result = await selectedAgent.agent.prompt(input)
      selectedAgent.lastResult = result
      selectedAgent.status = 'idle'
      this.emit({ type: 'agent_end', agentId: selectedAgent.id, agentName: selectedAgent.name, result })
      return [result]
    } catch (error) {
      selectedAgent.status = 'error'
      selectedAgent.error = error instanceof Error ? error.message : String(error)
      this.emit({ type: 'error', agentId: selectedAgent.id, agentName: selectedAgent.name, error: selectedAgent.error })
      return []
    }
  }

  /**
   * 重置所有 Agent
   */
  reset(): void {
    for (const state of this.agents.values()) {
      state.agent.reset()
      state.status = 'idle'
      state.lastResult = undefined
      state.error = undefined
    }
    this.currentIndex = 0
  }

  /**
   * 中止所有 Agent
   */
  abort(): void {
    for (const state of this.agents.values()) {
      state.agent.abort()
      state.status = 'idle'
    }
  }
}

export default AgentCoordinator
