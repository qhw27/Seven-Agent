/**
 * Agent 工具构建器
 * 将现有工具转换为 AgentTool 格式
 */

import { skillManager } from '../SkillManager'
import { builtInToolRegistry } from '../BuiltInToolRegistry'
import { pluginManager } from '../plugin-system/PluginManager'
import { type AgentTool, type AgentToolResult } from './types'

/**
 * 简单的 Schema 构建器
 */
function createSchema(properties: Record<string, { type: string; description?: string }>): any {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
  }
}

/**
 * 构建内置工具为 Agent 工具
 */
export function buildBuiltinAgentTools(): AgentTool[] {
  const tools: AgentTool[] = []
  const builtinToolsList = builtInToolRegistry.getToolDefinitions()

  for (const tool of builtinToolsList) {
    const toolDef = tool.function
    const agentTool: AgentTool = {
      name: toolDef.name,
      description: toolDef.description,
      label: toolDef.name,
      parameters: toolDef.parameters,
      execute: async (_toolCallId, params, _signal, _onUpdate) => {
        try {
          const result = await builtInToolRegistry.executeTool(toolDef.name, JSON.stringify(params))
          return {
            content: typeof result === 'string' ? result : JSON.stringify(result),
            details: result,
            isError: false,
          }
        } catch (error) {
          return {
            content: `Error: ${error instanceof Error ? error.message : String(error)}`,
            isError: true,
          }
        }
      },
    }
    tools.push(agentTool)
  }

  return tools
}

/**
 * 构建技能工具为 Agent 工具
 */
export async function buildSkillAgentTools(): Promise<AgentTool[]> {
  const tools: AgentTool[] = []

  try {
    const skills = await skillManager.getLocalSkills()

    for (const skill of skills) {
      const agentTool: AgentTool = {
        name: `skill_${skill.id}`,
        description: skill.description || `${skill.name} skill`,
        label: skill.name,
        parameters: createSchema({
          query: { type: 'string', description: '查询内容' },
        }),
        execute: async (_toolCallId, params, _signal, _onUpdate) => {
          try {
            const result = await skillManager.executeSkill(skill.id, params.query)
            return {
              content: result.success ? result.output : result.error || '执行失败',
              details: result,
              isError: !result.success,
            }
          } catch (error) {
            return {
              content: `Error: ${error instanceof Error ? error.message : String(error)}`,
              isError: true,
            }
          }
        },
      }
      tools.push(agentTool)
    }
  } catch (error) {
    console.error('[AgentTools] 构建技能工具失败:', error)
  }

  return tools
}

/**
 * 构建插件工具为 Agent 工具
 */
export function buildPluginAgentTools(): AgentTool[] {
  const tools: AgentTool[] = []

  try {
    const pluginTools = pluginManager.getPluginTools()

    for (const tool of pluginTools) {
      const agentTool: AgentTool = {
        name: `plugin_${tool.id}`,
        description: tool.description,
        label: tool.name,
        parameters: createSchema({}),
        execute: async (_toolCallId, params, _signal, _onUpdate) => {
          try {
            const result = await tool.execute(params)
            return {
              content: typeof result === 'string' ? result : JSON.stringify(result),
              details: result,
              isError: false,
            }
          } catch (error) {
            return {
              content: `Error: ${error instanceof Error ? error.message : String(error)}`,
              isError: true,
            }
          }
        },
      }
      tools.push(agentTool)
    }
  } catch (error) {
    console.error('[AgentTools] 构建插件工具失败:', error)
  }

  return tools
}

/**
 * 构建所有 Agent 工具
 */
export async function buildAllAgentTools(): Promise<AgentTool[]> {
  const builtinTools = buildBuiltinAgentTools()
  const skillTools = await buildSkillAgentTools()
  const pluginTools = buildPluginAgentTools()

  return [...builtinTools, ...skillTools, ...pluginTools]
}

/**
 * 创建自定义 Agent 工具
 */
export function createAgentTool<T = any>(
  name: string,
  description: string,
  parameters: any,
  execute: (params: T, signal?: AbortSignal) => Promise<string | AgentToolResult>
): AgentTool {
  return {
    name,
    description,
    label: name,
    parameters,
    execute: async (_toolCallId, params, signal, _onUpdate) => {
      try {
        const result = await execute(params, signal)
        if (typeof result === 'string') {
          return { content: result, isError: false }
        }
        return result
      } catch (error) {
        return {
          content: `Error: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        }
      }
    },
  }
}

export default {
  buildBuiltinAgentTools,
  buildSkillAgentTools,
  buildPluginAgentTools,
  buildAllAgentTools,
  createAgentTool,
}
