/**
 * Agent 模块入口
 * 基于 @mariozechner/pi-agent-core 架构
 */

// 核心类
export { Agent } from './Agent'
export { AgentCoordinator } from './AgentCoordinator'
export { agentService } from './AgentService'

// 工具构建
export {
  buildBuiltinAgentTools,
  buildSkillAgentTools,
  buildPluginAgentTools,
  buildAllAgentTools,
  createAgentTool,
} from './AgentTools'

// 类型导出
export type {
  ToolExecutionMode,
  ThinkingLevel,
  AgentMessageRole,
  AgentMessage,
  AgentToolCall,
  AgentToolResult,
  AgentTool,
  AgentEventType,
  AgentEvent,
  AgentState,
  AgentModel,
  AgentOptions,
  AgentContext,
  SteeringMessage,
  FollowUpMessage,
  CoordinatorConfig,
  AgentConfig,
  AgentEventCallback,
  ToolExecutionContext,
} from './types'

// 默认导出
export { agentService as default } from './AgentService'
