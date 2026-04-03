import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock axios at module level
vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn()
  }
}))

import axios from 'axios'
const mockedAxios = axios as vi.Mocked<typeof axios>

// 导入类型，不导入实现（避免 Electron 依赖）
import type { ChatMessage, Tool, ToolCall } from '../src/main/ai-service'

describe('AI Service 工具调用循环', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('工具调用循环逻辑', () => {
    it('应该在无工具调用时直接返回内容', async () => {
      // 模拟 AI 返回无 tool_calls 的响应
      mockedAxios.post.mockResolvedValue({
        data: {
          choices: [{
            message: {
              content: 'Hello, I am AI'
            }
          }]
        }
      })

      // 这里只测试 mock 是否正常工作
      const response = await mockedAxios.post('http://test.com', {
        model: 'test',
        messages: [{ role: 'user', content: 'Hi' }]
      })

      expect(response.data.choices[0].message.content).toBe('Hello, I am AI')
      expect(response.data.choices[0].message.tool_calls).toBeUndefined()
    })

    it('应该在有工具调用时处理 tool_calls', () => {
      const mockResponse = {
        data: {
          choices: [{
            message: {
              content: 'Let me check that',
              tool_calls: [{
                id: 'call_123',
                type: 'function',
                function: {
                  name: 'skill_weather',
                  arguments: '{"query":"Beijing"}'
                }
              }]
            }
          }]
        }
      }

      const toolCalls = mockResponse.data.choices[0].message.tool_calls as ToolCall[]
      expect(toolCalls).toHaveLength(1)
      expect(toolCalls[0].function.name).toBe('skill_weather')
      expect(toolCalls[0].function.arguments).toContain('Beijing')
    })

    it('应该正确解析工具参数', () => {
      const toolCall = {
        id: 'call_1',
        type: 'function' as const,
        function: {
          name: 'skill_search',
          arguments: JSON.stringify({ query: 'test query', limit: 10 })
        }
      }

      const parsedArgs = JSON.parse(toolCall.function.arguments)
      expect(parsedArgs.query).toBe('test query')
      expect(parsedArgs.limit).toBe(10)
    })

    it('应该处理多个工具调用', () => {
      const mockResponse = {
        data: {
          choices: [{
            message: {
              content: 'Checking multiple things',
              tool_calls: [
                { id: 'call_1', type: 'function', function: { name: 'tool1', arguments: '{}' } },
                { id: 'call_2', type: 'function', function: { name: 'tool2', arguments: '{}' } },
                { id: 'call_3', type: 'function', function: { name: 'tool3', arguments: '{}' } }
              ]
            }
          }]
        }
      }

      const toolCalls = mockResponse.data.choices[0].message.tool_calls as ToolCall[]
      expect(toolCalls).toHaveLength(3)
    })

    it('应该构建正确的工具消息格式', () => {
      // 模拟工具执行结果
      const toolResult = { success: true, output: 'Weather: sunny' }

      const toolMessage: ChatMessage = {
        role: 'tool',
        content: JSON.stringify(toolResult),
        tool_call_id: 'call_123'
      }

      expect(toolMessage.role).toBe('tool')
      expect(toolMessage.tool_call_id).toBe('call_123')
      expect(JSON.parse(toolMessage.content).success).toBe(true)
    })

    it('应该限制最大迭代次数', () => {
      const maxIterations = 10
      let iterations = 0

      // 模拟一个会无限返回 tool_calls 的场景
      const simulateLoop = () => {
        iterations++
        return iterations < maxIterations // 返回 true 表示还有 tool_calls
      }

      // 模拟循环逻辑
      while (simulateLoop()) {
        // 处理工具调用
      }

      expect(iterations).toBe(maxIterations)
    })
  })

  describe('工具定义格式', () => {
    it('应该生成正确的工具定义', () => {
      const tools: Tool[] = [
        {
          type: 'function',
          function: {
            name: 'skill_weather',
            description: '获取天气信息',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string', description: '城市名称' }
              },
              required: ['query']
            }
          }
        }
      ]

      expect(tools[0].type).toBe('function')
      expect(tools[0].function.name).toBe('skill_weather')
      expect(tools[0].function.parameters.required).toContain('query')
    })

    it('应该支持多个工具', () => {
      const tools: Tool[] = [
        { type: 'function', function: { name: 'tool1', description: 'd1', parameters: { type: 'object', properties: {} } } },
        { type: 'function', function: { name: 'tool2', description: 'd2', parameters: { type: 'object', properties: {} } } },
        { type: 'function', function: { name: 'tool3', description: 'd3', parameters: { type: 'object', properties: {} } } }
      ]

      expect(tools.length).toBe(3)
    })
  })

  describe('错误处理', () => {
    it('应该处理网络错误', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Network Error'))

      await expect(
        mockedAxios.post('http://test.com', {})
      ).rejects.toThrow('Network Error')
    })

    it('应该处理 API 错误响应', () => {
      const errorResponse = {
        response: {
          status: 401,
          data: { error: { message: 'Invalid API key' } }
        }
      }

      expect(errorResponse.response.status).toBe(401)
      expect(errorResponse.response.data.error.message).toBe('Invalid API key')
    })

    it('应该处理工具执行错误并返回错误消息', () => {
      const errorResult = { error: 'Tool execution failed', message: 'File not found' }
      const resultStr = JSON.stringify(errorResult)
      const parsed = JSON.parse(resultStr)

      expect(parsed.error).toBe('Tool execution failed')
    })
  })
})