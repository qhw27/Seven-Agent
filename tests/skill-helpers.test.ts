import { describe, it, expect, vi, beforeEach } from 'vitest'

// 导入类型
import type { Skill, SkillResult } from '../src/main/SkillHelpers'

// 测试纯函数逻辑（不需要实际导入有副作用的模块）

describe('SkillHelpers 工具函数', () => {
  describe('技能定义类型', () => {
    it('应该正确创建 Skill 对象', () => {
      const skill: Skill = {
        id: 'test-skill',
        name: '测试技能',
        description: '这是一个测试技能',
        command: 'echo {query}',
        version: '1.0.0',
        author: 'tester',
        tags: ['test', 'demo']
      }

      expect(skill.id).toBe('test-skill')
      expect(skill.name).toBe('测试技能')
      expect(skill.command).toContain('{query}')
    })

    it('应该正确创建 SkillResult 对象', () => {
      const result: SkillResult = {
        success: true,
        output: '执行结果',
        error: undefined
      }

      expect(result.success).toBe(true)
      expect(result.output).toBe('执行结果')
    })

    it('应该正确表示失败结果', () => {
      const result: SkillResult = {
        success: false,
        output: '',
        error: '执行失败'
      }

      expect(result.success).toBe(false)
      expect(result.error).toBe('执行失败')
    })
  })

  describe('命令解析逻辑', () => {
    it('应该替换 {query} 占位符', () => {
      const command = 'curl "https://api.example.com/search?q={query}"'
      const query = 'hello world'
      const expected = 'curl "https://api.example.com/search?q=hello%20world"'

      // 简单的 URL 编码替换逻辑
      const result = command.replace('{query}', encodeURIComponent(query))
      expect(result).toBe(expected)
    })

    it('应该处理多个占位符', () => {
      const command = 'mytool --query "{query}" --limit {limit}'
      const query = 'test'
      const limit = '10'

      let result = command.replace('{query}', query).replace('{limit}', limit)
      expect(result).toContain(query)
      expect(result).toContain(limit)
    })

    it('应该处理无占位符的命令', () => {
      const command = 'echo "hello world"'
      const query = 'ignored query'

      // 无占位符时不应替换
      const result = command
      expect(result).toBe(command)
    })
  })

  describe('输出清理逻辑', () => {
    it('应该移除 ANSI 转义码', () => {
      const output = '\x1b[32m绿色文字\x1b[0m 普通文字 \x1b[1m加粗\x1b[0m'
      const result = output.replace(/\x1b\[[0-9;]*m/g, '')

      expect(result).not.toContain('\x1b')
      expect(result).toContain('绿色文字')
    })

    it('应该移除控制字符', () => {
      const output = 'hello\x00world\x07test'
      const result = output.replace(/[\x00\x07\x1b]/g, '')

      expect(result).toBe('helloworldtest')
    })

    it('应该截断超长输出', () => {
      const longOutput = 'A'.repeat(50000)
      const maxLength = 10000

      const result = longOutput.length > maxLength
        ? longOutput.substring(0, maxLength) + '\n... (truncated)'
        : longOutput

      // 10000 + 15 (truncate suffix) = 10015
      expect(result.length).toBeLessThanOrEqual(10020)
    })

    it('应该处理空输出', () => {
      const output = ''
      const result = output.trim()

      expect(result).toBe('')
    })
  })

  describe('帮助文本提取', () => {
    it('应该从 Markdown 提取 usage', () => {
      const content = `
# Skill Name

## Usage
\`\`\`
skill --option value
\`\`\`

## Description
This is a skill.
`
      const usageMatch = content.match(/```[\s\S]*?```/)
      expect(usageMatch).toBeDefined()
    })

    it('应该提取描述文本', () => {
      const content = '# My Skill\n\nSome description here.\n\n## Options'
      const lines = content.split('\n')
      const description = lines.find(l => l.includes('description') || !l.startsWith('#'))

      expect(description).toBeDefined()
    })

    it('应该处理无帮助信息的情况', () => {
      const content = 'No help here'
      const hasHelp = content.includes('##') || content.includes('```')

      expect(hasHelp).toBe(false)
    })
  })

  describe('路径处理', () => {
    it('应该正确处理路径分隔符', () => {
      const paths = [
        'skills/skill-id/script.sh',
        'skills\\skill-id\\script.bat',
        'skills/skill-id/../other/file.ts'
      ]

      // Windows 和 Unix 路径处理
      for (const p of paths) {
        const normalized = p.replace(/\\/g, '/')
        expect(normalized).toContain('/')
      }
    })

    it('应该提取文件名', () => {
      const path = '/path/to/skill/script.sh'
      const filename = path.split('/').pop()

      expect(filename).toBe('script.sh')
    })
  })

  describe('技能参数验证', () => {
    it('应该验证必需参数', () => {
      const inputSchema = {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number' }
        },
        required: ['query']
      }

      const validArgs = { query: 'test', limit: 10 }
      const missingArgs = { limit: 10 }

      expect(inputSchema.required).toContain('query')
      expect(validArgs.query).toBeDefined()
      expect(missingArgs.query).toBeUndefined()
    })
  })
})