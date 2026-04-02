import { useState, useRef, useEffect, useCallback } from 'react'
import { Input, Button, Select, Spin, Empty, Modal, message } from 'antd'
import { SendOutlined, RobotOutlined, UserOutlined } from '@ant-design/icons'

const { TextArea } = Input

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

interface ChatAreaProps {
  tool: string
}

// 命令类型
interface Command {
  name: string
  description: string
  usage: string
  action: (args: string) => void | Promise<void>
}

// 内置命令列表
const COMMANDS: Command[] = [
  {
    name: 'help',
    description: '显示帮助信息',
    usage: '/help',
    action: async () => {
      const helpText = `📖 Seven 命令帮助

可用命令：
/help   - 显示此帮助信息
/clear  - 清除当前对话
/models - 列出所有可用模型
/model  - 切换当前模型

快捷键：
Shift+Enter - 换行
Enter - 发送消息`
      Modal.info({
        title: '帮助',
        content: <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{helpText}</pre>,
        width: 400
      })
    }
  },
  {
    name: 'clear',
    description: '清除当前对话',
    usage: '/clear',
    action: async () => {
      // 清除操作由组件处理
    }
  },
  {
    name: 'models',
    description: '列出所有可用模型',
    usage: '/models',
    action: async () => {
      // 列出模型操作由组件处理
    }
  },
  {
    name: 'model',
    description: '切换当前模型',
    usage: '/model <模型ID>',
    action: async () => {
      // 切换模型操作由组件处理
    }
  }
]

function ChatArea({ tool }: ChatAreaProps): JSX.Element {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [model, setModel] = useState('minimax')
  const [modelOptions, setModelOptions] = useState<{ value: string; label: string }[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [showCommandHint, setShowCommandHint] = useState(false)
  const [commandHints, setCommandHints] = useState<Command[]>([])
  const [selectedHintIndex, setSelectedHintIndex] = useState(0)

  // 解析命令
  const parseCommand = useCallback((text: string): { isCommand: boolean; command?: Command; args: string } => {
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
  }, [])

  // 获取命令提示
  const getCommandHints = useCallback((text: string): Command[] => {
    if (!text.trim().startsWith('/')) return []
    const cmdPart = text.slice(1).toLowerCase()
    if (!cmdPart) return COMMANDS
    return COMMANDS.filter(c => c.name.startsWith(cmdPart) || c.usage.toLowerCase().includes(cmdPart))
  }, [])

  // 执行命令
  const executeCommand = useCallback(async (command: Command, args: string) => {
    switch (command.name) {
      case 'help':
        await command.action(args)
        break
      case 'clear':
        setMessages([])
        message.success('对话已清除')
        break
      case 'models':
        try {
          const models = await window.api.ai.listModels()
          const configuredModels = models.filter((m: any) => m.configured)
          const modelList = configuredModels.map((m: any) => `• ${m.name} (${m.id})`).join('\n')
          Modal.info({
            title: '可用模型',
            content: <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{modelList || '暂无已配置的模型'}</pre>,
            width: 400
          })
        } catch (error) {
          message.error('获取模型列表失败')
        }
        break
      case 'model':
        if (!args) {
          message.warning('请指定模型名称，如: /model minimax-m2.5')
          return
        }
        const foundModel = modelOptions.find(m => m.value === args || m.label.toLowerCase().includes(args.toLowerCase()))
        if (foundModel) {
          setModel(foundModel.value)
          message.success(`已切换到模型: ${foundModel.label}`)
        } else {
          message.warning(`未找到模型: ${args}，可用 /models 查看`)
        }
        break
      default:
        await command.action(args)
    }
  }, [modelOptions])

  // 加载模型列表
  useEffect(() => {
    const loadModels = async () => {
      try {
        const models = await window.api.ai.listModels()
        // 只显示已配置的模型
        const configuredModels = models.filter((m: any) => m.configured)
        const options = configuredModels.map((m: any) => ({
          value: m.id,
          label: m.name
        }))
        setModelOptions(options)
        if (options.length > 0 && !options.find(o => o.value === model)) {
          setModel(options[0].value)
        }
      } catch (error) {
        console.error('Load models error:', error)
      }
    }
    loadModels()
  }, [])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || loading) return

    const trimmedInput = input.trim()

    // 检查是否是命令
    const { isCommand, command, args } = parseCommand(trimmedInput)

    if (isCommand && command) {
      // 执行命令
      await executeCommand(command, args)
      setInput('')
      return
    }

    if (isCommand) {
      // 未知命令
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `未知命令: ${trimmedInput}\n\n输入 /help 查看可用命令`,
        timestamp: Date.now()
      }
      setMessages((prev) => [...prev, errorMessage])
      setInput('')
      return
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: trimmedInput,
      timestamp: Date.now()
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const response = await window.api.ai.chat(
        messages.concat(userMessage).map((m) => ({
          role: m.role,
          content: m.content
        })),
        { model }
      ) as { content: string }
      console.log('111111', response)

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.content || '你好，我是 AI 助手 Seven，有什么可以帮助你的吗？',
        timestamp: Date.now()
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      console.error('Chat error:', error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '抱歉，发生了错误，请检查网络连接或模型配置。',
        timestamp: Date.now()
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  if (tool !== 'chat') {
    return (
      <div className="chat-area-placeholder">
        <Empty description="选择 AI 对话开始聊天" />
      </div>
    )
  }

  return (
    <div className="chat-area">
      <div className="chat-header">
        <Select
          value={model}
          onChange={setModel}
          style={{ width: 140 }}
          size="small"
          options={modelOptions}
        />
      </div>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-welcome">
            <RobotOutlined style={{ fontSize: 56, color: '#007aff' }} />
            <h2>你好，我是 Seven</h2>
            <p>选择一个模型，开始对话吧</p>
            <p className="chat-hint">输入 /help 查看可用命令</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`message message-${msg.role}`}>
              <div className="message-avatar">
                {msg.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
              </div>
              <div className="message-content">
                <div className="message-text">{msg.content}</div>
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="message message-assistant">
            <div className="message-avatar">
              <RobotOutlined />
            </div>
            <div className="message-content">
              <Spin size="small" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input">
        <TextArea
          value={input}
          onChange={(e) => {
            const value = e.target.value
            setInput(value)
            // 自动补全
            const hints = getCommandHints(value)
            setCommandHints(hints)
            setShowCommandHint(hints.length > 0 && value.startsWith('/'))
            setSelectedHintIndex(0)
          }}
          onPressEnter={(e) => {
            if (showCommandHint && commandHints.length > 0) {
              e.preventDefault()
              const selected = commandHints[selectedHintIndex]
              setInput('/' + selected.name + ' ')
              setShowCommandHint(false)
              return
            }
            if (!e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          onKeyDown={(e) => {
            if (showCommandHint && commandHints.length > 0) {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelectedHintIndex(prev => (prev + 1) % commandHints.length)
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelectedHintIndex(prev => (prev - 1 + commandHints.length) % commandHints.length)
              } else if (e.key === 'Escape') {
                setShowCommandHint(false)
              }
            }
          }}
          placeholder="发送消息... (输入 /help 查看命令)"
          autoSize={{ minRows: 1, maxRows: 4 }}
          disabled={loading}
        />
        {showCommandHint && commandHints.length > 0 && (
          <div className="command-hints">
            {commandHints.map((cmd, index) => (
              <div
                key={cmd.name}
                className={`command-hint-item ${index === selectedHintIndex ? 'selected' : ''}`}
                onClick={() => {
                  setInput('/' + cmd.name + ' ')
                  setShowCommandHint(false)
                }}
              >
                <span className="command-usage">{cmd.usage}</span>
                <span className="command-desc">{cmd.description}</span>
              </div>
            ))}
          </div>
        )}
        <Button
          type="primary"
          shape="circle"
          icon={<SendOutlined />}
          onClick={handleSend}
          loading={loading}
          disabled={!input.trim()}
        />
      </div>

      <style>{`
        .chat-area {
        }
        .command-hints {
          position: absolute;
          bottom: 100%;
          left: 0;
          right: 0;
          background: white;
          border: 1px solid #d9d9d9;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          max-height: 200px;
          overflow-y: auto;
          z-index: 100;
          margin-bottom: 8px;
        }
        .command-hint-item {
          display: flex;
          justify-content: space-between;
          padding: 10px 16px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .command-hint-item:hover, .command-hint-item.selected {
          background: #f5f5f5;
        }
        .command-hint-item:first-child {
          border-radius: 8px 8px 0 0;
        }
        .command-hint-item:last-child {
          border-radius: 0 0 8px 8px;
        }
        .command-usage {
          font-weight: 500;
          color: #1890ff;
        }
        .command-desc {
          color: #888;
          font-size: 12px;
        }
        .chat-area {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #f2f2f7;
        }
        .chat-area-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          background: #f2f2f7;
        }
        .chat-header {
          padding: 12px 16px;
          background: rgba(242, 242, 247, 0.8);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 0.5px solid rgba(0, 0, 0, 0.1);
        }
        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          padding-bottom: 8px;
        }
        .chat-welcome {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #8e8e93;
        }
        .chat-welcome h2 {
          margin: 16px 0 8px;
          font-size: 20px;
          font-weight: 600;
          color: #000;
        }
        .chat-welcome p {
          font-size: 15px;
        }
        .chat-hint {
          margin-top: 16px;
          font-size: 13px;
          color: #007aff;
        }
        .message {
          display: flex;
          margin-bottom: 12px;
          animation: fadeIn 0.3s ease;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .message-user {
          flex-direction: row-reverse;
        }
        .message-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          font-size: 14px;
        }
        .message-user .message-avatar {
          background: #007aff;
          color: #fff;
        }
        .message-assistant .message-avatar {
          background: #34c759;
          color: #fff;
        }
        .message-content {
          max-width: 75%;
          margin: 0 8px;
        }
        .message-user .message-content {
          display: flex;
          justify-content: flex-end;
        }
        .message-text {
          padding: 10px 14px;
          border-radius: 18px;
          background: #fff;
          white-space: pre-wrap;
          word-break: break-word;
          font-size: 15px;
          line-height: 1.4;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }
        .message-user .message-text {
          background: #007aff;
          color: #fff;
          border-bottom-right-radius: 4px;
        }
        .message-assistant .message-text {
          border-bottom-left-radius: 4px;
        }
        .chat-input {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          padding: 8px 12px;
          padding-bottom: calc(8px + env(safe-area-inset-bottom));
          background: rgba(255, 255, 255, 0.94);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-top: 0.5px solid rgba(0, 0, 0, 0.1);
          position: relative;
        }
        .chat-input textarea {
          flex: 1;
          border-radius: 20px;
          padding: 10px 16px;
          font-size: 15px;
          border: none;
          background: #f2f2f7;
          resize: none;
        }
        .chat-input textarea:focus {
          box-shadow: none;
          border: none;
        }
        .chat-input .ant-btn-primary {
          width: 36px;
          height: 36px;
          box-shadow: 0 2px 8px rgba(0, 122, 255, 0.3);
        }
      `}</style>
    </div>
  )
}

export default ChatArea