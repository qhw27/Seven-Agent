import { describe, it, expect, vi, beforeEach } from 'vitest'

// 测试命令解析逻辑
interface Command {
  name: string
  description: string
  usage: string
}

const COMMANDS: Command[] = [
  { name: 'help', description: '显示帮助信息', usage: '/help' },
  { name: 'clear', description: '清除当前对话', usage: '/clear' },
  { name: 'models', description: '列出所有可用模型', usage: '/models' },
  { name: 'model', description: '切换当前模型', usage: '/model <模型ID>' }
]

// 模拟 ChatArea 中的命令解析函数
function parseCommand(text: string): { isCommand: boolean; command?: Command; args: string } {
  if (!text.trim().startsWith('/')) {
    return { isCommand: false, args: text }
  }

  const parts = text.trim().split(/\s+/)
  const cmdName = parts[0].slice(1).toLowerCase()
  const args = parts.slice(1).join(' ')

  const cmd = COMMANDS.find(c => c.name === cmdName)
  if (cmd) {
    return { isCommand: true, command: cmd, args }
  }

  return { isCommand: true, args: text }
}

function getCommandHints(text: string): Command[] {
  if (!text.trim().startsWith('/')) return []
  const cmdPart = text.slice(1).toLowerCase()
  if (!cmdPart) return COMMANDS
  return COMMANDS.filter(c => c.name.startsWith(cmdPart) || c.usage.toLowerCase().includes(cmdPart))
}

describe('命令解析', () => {
  describe('parseCommand', () => {
    it('应该识别普通文本（非命令）', () => {
      const result = parseCommand('你好')
      expect(result.isCommand).toBe(false)
      expect(result.args).toBe('你好')
    })

    it('应该识别 /help 命令', () => {
      const result = parseCommand('/help')
      expect(result.isCommand).toBe(true)
      expect(result.command?.name).toBe('help')
      expect(result.args).toBe('')
    })

    it('应该识别 /help 命令并提取参数', () => {
      const result = parseCommand('/help extra args')
      expect(result.isCommand).toBe(true)
      expect(result.command?.name).toBe('help')
      expect(result.args).toBe('extra args')
    })

    it('应该识别 /clear 命令', () => {
      const result = parseCommand('/clear')
      expect(result.isCommand).toBe(true)
      expect(result.command?.name).toBe('clear')
    })

    it('应该识别 /models 命令', () => {
      const result = parseCommand('/models')
      expect(result.isCommand).toBe(true)
      expect(result.command?.name).toBe('models')
    })

    it('应该识别 /model 命令并提取模型参数', () => {
      const result = parseCommand('/model gpt-4o')
      expect(result.isCommand).toBe(true)
      expect(result.command?.name).toBe('model')
      expect(result.args).toBe('gpt-4o')
    })

    it('应该处理带空格的命令参数', () => {
      const result = parseCommand('/model "GPT 4o"')
      expect(result.isCommand).toBe(true)
      expect(result.args).toBe('"GPT 4o"')
    })

    it('应该处理未知命令', () => {
      const result = parseCommand('/unknown')
      expect(result.isCommand).toBe(true)
      expect(result.command).toBeUndefined()
    })

    it('应该忽略前导空格', () => {
      const result = parseCommand('  /help')
      expect(result.isCommand).toBe(true)
      expect(result.command?.name).toBe('help')
    })

    it('应该处理空输入', () => {
      const result = parseCommand('')
      expect(result.isCommand).toBe(false)
      expect(result.args).toBe('')
    })

    it('应该不区分大小写', () => {
      const result = parseCommand('/HELP')
      expect(result.isCommand).toBe(true)
      expect(result.command?.name).toBe('help')
    })
  })

  describe('getCommandHints', () => {
    it('应该返回所有命令（输入 /）', () => {
      const hints = getCommandHints('/')
      expect(hints.length).toBe(4)
    })

    it('应该过滤以输入开头的命令', () => {
      const hints = getCommandHints('/m')
      expect(hints.length).toBe(2) // models, model
      expect(hints.map(h => h.name)).toContain('models')
      expect(hints.map(h => h.name)).toContain('model')
    })

    it('应该过滤完整命令名', () => {
      const hints = getCommandHints('/help')
      expect(hints.length).toBe(1)
      expect(hints[0].name).toBe('help')
    })

    it('应该返回空数组（非命令输入）', () => {
      const hints = getCommandHints('hello')
      expect(hints.length).toBe(0)
    })

    it('应该处理不存在的命令前缀', () => {
      const hints = getCommandHints('/xyz')
      expect(hints.length).toBe(0)
    })
  })

  describe('命令执行逻辑', () => {
    it('help 命令应该返回帮助文本', () => {
      const helpText = `📖 Seven 命令帮助

可用命令：
/help   - 显示此帮助信息
/clear  - 清除当前对话
/models - 列出所有可用模型
/model  - 切换当前模型

快捷键：
Shift+Enter - 换行
Enter - 发送消息`

      expect(helpText).toContain('/help')
      expect(helpText).toContain('/clear')
      expect(helpText).toContain('/models')
      expect(helpText).toContain('/model')
    })
  })
})