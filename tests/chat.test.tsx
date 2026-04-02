import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ChatArea from '../src/renderer/components/ChatArea'

// Mock Electron IPC
const mockInvoke = vi.fn()
vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: (...args: any[]) => mockInvoke(...args),
  },
}))

describe('第一阶段：核心对话引擎 & 命令系统', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    // 模拟已配置的模型
    mockInvoke.mockResolvedValue([
      { id: 'minimax-m2.5', name: 'MiniMax M2.5', provider: 'minimax', configured: true },
      { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', configured: false },
    ])
  })

  describe('1. 核心对话引擎', () => {
    it('应该正确渲染聊天界面', () => {
      render(<ChatArea tool="chat" />)

      // 检查欢迎信息
      expect(screen.getByText('你好，我是 Seven')).toBeDefined()
      expect(screen.getByText('选择一个模型，开始对话吧')).toBeDefined()
    })

    it('应该显示模型选择器', async () => {
      render(<ChatArea tool="chat" />)

      await waitFor(() => {
        expect(screen.getByText('MiniMax M2.5')).toBeDefined()
      })
    })

    it('应该能够输入文本', () => {
      render(<ChatArea tool="chat" />)

      const textarea = screen.getByPlaceholderText(/发送消息/)
      fireEvent.change(textarea, { target: { value: '你好' } })

      expect(textarea.value).toBe('你好')
    })
  })

  describe('2. 命令系统 - /help', () => {
    it('应该解析 /help 命令', async () => {
      render(<ChatArea tool="chat" />)

      const textarea = screen.getByPlaceholderText(/发送消息/)
      fireEvent.change(textarea, { target: { value: '/help' } })
      fireEvent.click(screen.getByRole('button', { name: '' }))

      await waitFor(() => {
        // 检查帮助弹窗
        expect(screen.getByText('Seven 命令帮助')).toBeDefined()
      })
    })
  })

  describe('3. 命令系统 - /clear', () => {
    it('应该解析 /clear 命令并清除消息', async () => {
      render(<ChatArea tool="chat" />)

      // 先发送一条消息
      mockInvoke.mockResolvedValueOnce({ content: '你好，我是AI' })

      const textarea = screen.getByPlaceholderText(/发送消息/)
      fireEvent.change(textarea, { target: { value: '你好' } })
      fireEvent.click(screen.getByRole('button', { name: '' }))

      await waitFor(() => {
        expect(screen.getByText('你好')).toBeDefined()
      })

      // 发送 /clear 命令
      mockInvoke.mockReset()
      fireEvent.change(textarea, { target: { value: '/clear' } })
      fireEvent.click(screen.getByRole('button', { name: '' }))

      // 验证消息已清除（欢迎信息重新出现）
      await waitFor(() => {
        expect(screen.getByText('你好，我是 Seven')).toBeDefined()
      })
    })
  })

  describe('4. 命令系统 - /models', () => {
    it('应该解析 /models 命令', async () => {
      render(<ChatArea tool="chat" />)

      const textarea = screen.getByPlaceholderText(/发送消息/)
      fireEvent.change(textarea, { target: { value: '/models' } })
      fireEvent.click(screen.getByRole('button', { name: '' }))

      await waitFor(() => {
        expect(screen.getByText('可用模型')).toBeDefined()
      })
    })
  })

  describe('5. 命令系统 - /model', () => {
    it('应该切换模型', async () => {
      render(<ChatArea tool="chat" />)

      await waitFor(() => {
        expect(screen.getByText('MiniMax M2.5')).toBeDefined()
      })

      const textarea = screen.getByPlaceholderText(/发送消息/)
      fireEvent.change(textarea, { target: { value: '/model gpt-4o' } })
      fireEvent.click(screen.getByRole('button', { name: '' }))

      // 由于 gpt-4o 未配置，应该显示警告
      await waitFor(() => {
        expect(screen.getByText(/未找到模型/)).toBeDefined()
      })
    })

    it('应该提示缺少模型名称', async () => {
      render(<ChatArea tool="chat" />)

      const textarea = screen.getByPlaceholderText(/发送消息/)
      fireEvent.change(textarea, { target: { value: '/model' } })
      fireEvent.click(screen.getByRole('button', { name: '' }))

      await waitFor(() => {
        expect(screen.getByText(/请指定模型名称/)).toBeDefined()
      })
    })
  })

  describe('6. 未知命令', () => {
    it('应该提示未知命令', async () => {
      render(<ChatArea tool="chat" />)

      const textarea = screen.getByPlaceholderText(/发送消息/)
      fireEvent.change(textarea, { target: { value: '/unknowncmd' } })
      fireEvent.click(screen.getByRole('button', { name: '' }))

      await waitFor(() => {
        expect(screen.getByText(/未知命令/)).toBeDefined()
        expect(screen.getByText(/输入 \/help 查看可用命令/)).toBeDefined()
      })
    })
  })

  describe('7. AI 对话功能', () => {
    it('应该发送消息并接收回复', async () => {
      mockInvoke.mockResolvedValueOnce({ content: '你好！有什么可以帮助你的？' })

      render(<ChatArea tool="chat" />)

      const textarea = screen.getByPlaceholderText(/发送消息/)
      fireEvent.change(textarea, { target: { value: '你好' } })
      fireEvent.click(screen.getByRole('button', { name: '' }))

      await waitFor(() => {
        expect(screen.getByText('你好！有什么可以帮助你的？')).toBeDefined()
      })
    })

    it('应该处理错误情况', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('网络错误'))

      render(<ChatArea tool="chat" />)

      const textarea = screen.getByPlaceholderText(/发送消息/)
      fireEvent.change(textarea, { target: { value: '测试' } })
      fireEvent.click(screen.getByRole('button', { name: '' }))

      await waitFor(() => {
        expect(screen.getByText(/发生了错误/)).toBeDefined()
      })
    })
  })
})