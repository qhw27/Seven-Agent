import { Tool, ToolCall } from './ai-service'
import { skillManager } from './SkillManager'
import * as fs from 'fs'
import * as path from 'path'
import axios from 'axios'

/**
 * 内置工具注册表
 * AI 可直接调用的基础工具
 */
export class BuiltInToolRegistry {
  private tools: Map<string, Tool> = new Map()

  constructor() {
    this.registerBuiltInTools()
  }

  /**
   * 注册所有内置工具
   */
  private registerBuiltInTools(): void {
    // 文件读取工具
    this.registerTool({
      type: 'function',
      function: {
        name: 'file_read',
        description: '读取文件内容。适用于查看代码、配置、文档等文件。注意：不适合读取大型二进制文件。',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: '文件路径（绝对路径或相对于当前工作目录的路径）'
            }
          },
          required: ['path']
        }
      }
    })

    // 文件写入工具
    this.registerTool({
      type: 'function',
      function: {
        name: 'file_write',
        description: '写入内容到文件。如果文件不存在则创建，存在则覆盖。注意：不适合写入大型数据。',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: '文件路径'
            },
            content: {
              type: 'string',
              description: '要写入的内容'
            }
          },
          required: ['path', 'content']
        }
      }
    })

    // 目录列表工具
    this.registerTool({
      type: 'function',
      function: {
        name: 'dir_list',
        description: '列出目录内容。返回指定目录下的所有文件和子目录。',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: '目录路径'
            }
          },
          required: ['path']
        }
      }
    })

    // 天气查询工具
    this.registerTool({
      type: 'function',
      function: {
        name: 'weather',
        description: '查询指定城市的天气信息。返回当前天气、温度、湿度、未来3天预报等。无需 API key。',
        parameters: {
          type: 'object',
          properties: {
            city: {
              type: 'string',
              description: '城市名称（中文或英文），如 "北京" 或 "Beijing"'
            }
          },
          required: ['city']
        }
      }
    })

    // 执行系统命令
    this.registerTool({
      type: 'function',
      function: {
        name: 'execute_command',
        description: '执行系统命令（Shell 命令）。可以运行各种命令行工具。注意：此命令有风险，确认用户意图后再执行。',
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: '要执行的命令'
            },
            timeout: {
              type: 'number',
              description: '超时时间（毫秒），默认 60000'
            }
          },
          required: ['command']
        }
      }
    })
  }

  /**
   * 注册单个工具
   */
  registerTool(tool: Tool): void {
    this.tools.set(tool.function.name, tool)
  }

  /**
   * 获取所有工具定义（用于发送给 AI）
   */
  getToolDefinitions(): Tool[] {
    return Array.from(this.tools.values())
  }

  /**
   * 根据名称获取工具定义
   */
  getToolByName(name: string): Tool | undefined {
    return this.tools.get(name)
  }

  // 搜索功能使用 SkillHub 技能
  private readonly SEARCH_SKILLS = ['tavily-search', 'brave-search', 'baidu-search']

  // DuckDuckGo API (免费，无需 API Key)
  private readonly DDG_API = 'https://api.duckduckgo.com/'

  /**
   * 执行工具调用
   */
  async executeTool(name: string, args: string): Promise<string> {
    const tool = this.tools.get(name)
    if (!tool) {
      // 尝试执行 SkillHub 技能
      return this.executeSkill(name, args)
    }

    let parsedArgs: Record<string, unknown>
    try {
      parsedArgs = JSON.parse(args)
    } catch {
      parsedArgs = {}
    }

    switch (name) {
      case 'file_read':
        return this.toolFileRead(parsedArgs.path as string)
      case 'file_write':
        return this.toolFileWrite(parsedArgs.path as string, parsedArgs.content as string)
      case 'dir_list':
        return this.toolDirList(parsedArgs.path as string)
      case 'weather':
        return await this.toolWeather(parsedArgs.city as string)
      case 'execute_command':
        return await this.toolExecuteCommand(parsedArgs.command as string, parsedArgs.timeout as number)
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` })
    }
  }

  /**
   * 工具：文件读取
   */
  private toolFileRead(filePath: string): string {
    try {
      const resolvedPath = path.resolve(filePath)
      if (!fs.existsSync(resolvedPath)) {
        return JSON.stringify({ error: `文件不存在: ${filePath}` })
      }
      const stat = fs.statSync(resolvedPath)
      if (stat.isDirectory()) {
        return JSON.stringify({ error: `路径是目录，不是文件: ${filePath}` })
      }
      // 限制读取大小
      if (stat.size > 1024 * 1024) {
        return JSON.stringify({ error: `文件太大 (${stat.size} bytes)，无法读取` })
      }
      const content = fs.readFileSync(resolvedPath, 'utf-8')
      return JSON.stringify({ success: true, content, size: stat.size })
    } catch (error) {
      return JSON.stringify({ error: (error as Error).message })
    }
  }

  /**
   * 工具：文件写入
   */
  private toolFileWrite(filePath: string, content: string): string {
    try {
      const resolvedPath = path.resolve(filePath)
      const dir = path.dirname(resolvedPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(resolvedPath, content, 'utf-8')
      const stat = fs.statSync(resolvedPath)
      return JSON.stringify({ success: true, path: resolvedPath, size: stat.size })
    } catch (error) {
      return JSON.stringify({ error: (error as Error).message })
    }
  }

  /**
   * 工具：目录列表
   */
  private toolDirList(dirPath: string): string {
    try {
      const resolvedPath = path.resolve(dirPath)
      if (!fs.existsSync(resolvedPath)) {
        return JSON.stringify({ error: `目录不存在: ${dirPath}` })
      }
      const stat = fs.statSync(resolvedPath)
      if (!stat.isDirectory()) {
        return JSON.stringify({ error: `路径是文件，不是目录: ${dirPath}` })
      }
      const items = fs.readdirSync(resolvedPath)
      const result = items.map(name => {
        const itemPath = path.join(resolvedPath, name)
        const itemStat = fs.statSync(itemPath)
        return {
          name,
          isDirectory: itemStat.isDirectory(),
          size: itemStat.size,
          modified: itemStat.mtime.toISOString()
        }
      })
      return JSON.stringify({ success: true, path: resolvedPath, items })
    } catch (error) {
      return JSON.stringify({ error: (error as Error).message })
    }
  }

  /**
   * 工具：天气查询
   */
  private async toolWeather(city: string): Promise<string> {
    try {
      const cityEncoded = city.replace(/ /g, '+')
      const response = await axios.get(`https://wttr.in/${cityEncoded}?format=j1`, {
        timeout: 10000
      })

      const current = response.data.current_condition?.[0]
      if (!current) {
        return JSON.stringify({ error: '无法获取天气数据' })
      }

      return JSON.stringify({
        success: true,
        city,
        temperature: current.temp_C,
        condition: current.weatherDesc?.[0]?.value,
        humidity: current.humidity,
        wind: current.windspeedKmph,
        feelsLike: current.FeelsLikeC
      })
    } catch (error) {
      return JSON.stringify({ error: `获取天气失败: ${(error as Error).message}` })
    }
  }

  /**
   * 工具：执行系统命令
   */
  private async toolExecuteCommand(command: string, timeout: number = 60000): Promise<string> {
    try {
      const result = await skillManager.executeSystemCommand(command, timeout)
      if (result.success) {
        return JSON.stringify({ success: true, output: result.output })
      } else {
        return JSON.stringify({ success: false, error: result.error, output: result.output })
      }
    } catch (error) {
      return JSON.stringify({ error: (error as Error).message })
    }
  }

  /**
   * 执行 SkillHub 技能
   */
  async executeSkill(skillId: string, query: string): Promise<string> {
    // 搜索功能使用 SkillHub 技能
    if (skillId === 'web_search' || skillId.includes('search')) {
      return this.executeSearchSkill(query)
    }

    try {
      const result = await skillManager.executeSkill(skillId, query)
      if (result.success) {
        return JSON.stringify({ success: true, output: result.output })
      } else {
        return JSON.stringify({ success: false, error: result.error })
      }
    } catch (error) {
      return JSON.stringify({ error: (error as Error).message })
    }
  }

  /**
   * 执行搜索技能（自动回退）
   */
  private async executeSearchSkill(query: string): Promise<string> {
    // 首先尝试使用 DuckDuckGo API（通过主进程 axios，可以在 Network 中看到）
    try {
      console.log(`[BuiltInTool] 使用 DuckDuckGo API 搜索: ${query}`)
      const response = await axios.get(this.DDG_API, {
        params: {
          q: query,
          format: 'json',
          no_html: 1,
          skip_disambig: 1
        },
        timeout: 10000
      })

      const data = response.data
      if (data.AbstractText || data.RelatedTopics?.length > 0) {
        const results: Array<{ title: string; url: string; snippet: string }> = []

        // 添加摘要结果
        if (data.AbstractText) {
          results.push({
            title: data.AbstractSource || 'DuckDuckGo',
            url: data.AbstractURL || '',
            snippet: data.AbstractText
          })
        }

        // 添加相关主题
        if (data.RelatedTopics) {
          for (const topic of data.RelatedTopics.slice(0, 9)) {
            if (topic.Text && topic.FirstURL) {
              results.push({
                title: topic.Text.split(' - ')[0] || '',
                url: topic.FirstURL,
                snippet: topic.Text
              })
            }
          }
        }

        console.log(`[BuiltInTool] DuckDuckGo 搜索成功，返回 ${results.length} 条结果`)
        return JSON.stringify({ success: true, query, results })
      }
    } catch (error) {
      console.log(`[BuiltInTool] DuckDuckGo API 失败: ${(error as Error).message}，尝试 SkillHub 技能`)
    }

    // 回退到 SkillHub 技能
    for (const skillId of this.SEARCH_SKILLS) {
      try {
        console.log(`[BuiltInTool] 尝试搜索技能: ${skillId}`)

        // 确保技能已安装
        const exists = await skillManager.checkSkill(skillId)
        if (!exists) {
          console.log(`[BuiltInTool] 下载技能: ${skillId}`)
          const downloaded = await skillManager.downloadSkill(skillId)
          if (!downloaded) {
            console.log(`[BuiltInTool] 下载失败，继续下一个`)
            continue
          }
        }

        // 执行技能
        const result = await skillManager.executeSkill(skillId, query)

        if (result.success) {
          console.log(`[BuiltInTool] ${skillId} 执行成功`)
          return result.output
        }

        console.log(`[BuiltInTool] ${skillId} 执行失败: ${result.error}`)
      } catch (error) {
        console.log(`[BuiltInTool] ${skillId} 错误: ${(error as Error).message}`)
      }
    }

    return JSON.stringify({ error: `所有搜索方案都失败了，请尝试安装搜索相关技能` })
  }
}

export const builtInToolRegistry = new BuiltInToolRegistry()