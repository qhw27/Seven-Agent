import { useState, useRef, useEffect, useCallback } from 'react'
import { Input, Button, Select, Spin, Empty, Modal, message, Tooltip } from 'antd'
import { 
  SendOutlined, 
  RobotOutlined, 
  UserOutlined,
  DeleteOutlined,
  LoadingOutlined,
  ModelOutlined
} from '@ant-design/icons'

const { TextArea } = Input

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

interface ChatAreaProps {
  tool: string
  sessionId: string
  onSessionUpdate?: () => void
}

// 需要注入时间的模式
const NEED_TIME_PATTERNS = [
  /最新.*新闻/i,
  /今天.*几号/i,
  /今天.*日期/i,
  /当前.*时间/i,
  /现在.*几点/i,
  /今天.*星期/i,
  /今天.*什么.*日/i,
  /今天.*天/i,
  /几号/i,
  /星期/i,
  /几月/i,
  /哪一年/i,
  /今日/i,
  /当天/i,
  /天气/i,
  /气温/i,
  /温度/i,
  /下雨/i,
  /晴天/i,
  /阴天/i,
  /刮风/i,
  /湿度/i
]

// 注入时间到需要最新信息的查询
function enhanceWithCurrentTime(prompt: string): string {
  const now = new Date()
  const timeStr = now.toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit'
  })

  if (NEED_TIME_PATTERNS.some(p => p.test(prompt))) {
    return `[当前时间: ${timeStr}]\n${prompt}`
  }
  return prompt
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
        content: <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>{helpText}</pre>,
        width: 400,
        centered: true
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

function ChatArea({ tool, sessionId, onSessionUpdate }: ChatAreaProps): JSX.Element {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [model, setModel] = useState('minimax')
  const [modelOptions, setModelOptions] = useState<{ value: string; label: string }[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [showCommandHint, setShowCommandHint] = useState(false)
  const [commandHints, setCommandHints] = useState<Command[]>([])
  const [selectedHintIndex, setSelectedHintIndex] = useState(0)
  const [streamingContent, setStreamingContent] = useState('')

  // 加载会话消息
  useEffect(() => {
    if (sessionId) {
      loadSessionMessages()
    }
  }, [sessionId])

  // 加载模型列表
  useEffect(() => {
    loadModels()
  }, [])

  const loadSessionMessages = async () => {
    if (!sessionId) return
    try {
      const sessionData = await window.api.session.get(sessionId)
      if (sessionData && sessionData.messages) {
        setMessages(sessionData.messages.map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: new Date(m.createdAt).getTime()
        })))
      }
    } catch (error) {
      console.error('Load session messages error:', error)
    }
  }

  const loadModels = async () => {
    try {
      const models = await window.api.ai.listModels()
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, streamingContent])

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
            width: 400,
            centered: true
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

  const handleSend = async () => {
    if (!input.trim() || loading || !sessionId) return

    const trimmedInput = input.trim()

    // 检查是否是命令
    const { isCommand, command, args } = parseCommand(trimmedInput)

    if (isCommand && command) {
      await executeCommand(command, args)
      setInput('')
      return
    }

    if (isCommand) {
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

    // 保存用户消息
    try {
      await window.api.message.add(sessionId, {
        id: userMessage.id,
        role: 'user',
        content: trimmedInput,
        createdAt: new Date().toISOString()
      })
      // 更新会话标题（如果是第一条消息）
      if (messages.length === 0) {
        const title = trimmedInput.slice(0, 30) + (trimmedInput.length > 30 ? '...' : '')
        await window.api.session.update(sessionId, { title })
        onSessionUpdate?.()
      }
    } catch (e) {
      console.error('Save user message error:', e)
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setLoading(true)
    setStreamingContent('')

    try {
      const messagesWithTime = messages.concat(userMessage).map((m) => {
        if (m.role === 'user') {
          return {
            role: m.role,
            content: enhanceWithCurrentTime(m.content)
          }
        }
        return { role: m.role, content: m.content }
      })

      const response = await window.api.ai.chat(
        messagesWithTime,
        { model, useTools: true }
      ) as { content: string }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.content || '你好，我是 AI 助手 Seven，有什么可以帮助你的吗？',
        timestamp: Date.now()
      }

      // 保存助手回复
      try {
        await window.api.message.add(sessionId, {
          id: assistantMessage.id,
          role: 'assistant',
          content: assistantMessage.content,
          createdAt: new Date().toISOString()
        })
      } catch (e) {
        console.error('Save assistant message error:', e)
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
      setStreamingContent('')
    }
  }

  // 清除对话
  const handleClear = async () => {
    if (!sessionId) return
    try {
      // 删除所有消息
      const sessionData = await window.api.session.get(sessionId)
      if (sessionData?.messages) {
        for (const msg of sessionData.messages) {
          await window.api.message.delete(sessionId, msg.id)
        }
      }
      setMessages([])
      message.success('对话已清除')
    } catch (error) {
      console.error('Clear error:', error)
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
      {/* 聊天头部 */}
      <div className="chat-header">
        <div className="chat-header-left">
          <span className="chat-title">
            <span className="gradient-text">AI</span> 对话
          </span>
                    <Select
            value={model}
            onChange={setModel}
            style={{ width: 160 }}
            size="small"
            options={modelOptions}
            popupClassName="model-select-dropdown"
          />
        </div>
        <div className="chat-header-right">
          <Tooltip title="清除对话">
            <Button 
              type="text" 
              icon={<DeleteOutlined />} 
              onClick={handleClear}
              className="header-btn"
            />
          </Tooltip>
        </div>
      </div>

      {/* 消息区域 - 可滚动 */}
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-welcome">
            <div className="welcome-icon">
              <RobotOutlined />
            </div>
            <h2>你好，我是 <span className="gradient-text">Seven</span></h2>
            <p>选择一个模型，开始对话吧</p>
            <div className="welcome-commands">
              <span className="command-tag">/help</span>
              <span className="command-tag">/clear</span>
              <span className="command-tag">/models</span>
            </div>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div 
              key={msg.id} 
              className={`message message-${msg.role}`}
              style={{ animationDelay: `${index * 0.05}s` }}
            >
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
          <div className="message message-assistant loading">
            <div className="message-avatar">
              <RobotOutlined />
            </div>
            <div className="message-content">
              <div className="message-text typing">
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 - 居中显示 */}
      <div className="chat-input-container">
        <div className="chat-input-wrapper-centered">
          <div className="chat-input">
            <TextArea
              value={input}
              onChange={(e) => {
                const value = e.target.value
                setInput(value)
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
              placeholder="发送消息... (输入 / 查看命令)"
              autoSize={{ minRows: 1, maxRows: 4 }}
              disabled={loading}
              className="chat-textarea"
            />
            <Button
              type="primary"
              shape="circle"
              icon={loading ? <LoadingOutlined /> : <SendOutlined />}
              onClick={handleSend}
              loading={loading}
              disabled={!input.trim() || !sessionId}
              className="send-btn"
            />
          </div>
          
          {/* 命令提示 */}
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

          <div className="input-footer">
            <span className="input-hint">Shift + Enter 换行，Enter 发送</span>
          </div>
        </div>
      </div>

      <style>{`
        .chat-area {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--bg-primary);
          position: relative;
        }

        .chat-area-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          background: var(--bg-primary);
        }

        /* 头部 */
        .chat-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 20px;
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border-subtle);
          flex-shrink: 0;
          z-index: 10;
        }

        .chat-header-left, .chat-header-right {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .chat-title {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .header-btn {
          color: var(--text-muted) !important;
        }

        .header-btn:hover {
          color: var(--text-primary) !important;
          background: var(--bg-tertiary) !important;
        }

        /* 消息区域 */
        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding-bottom: 200px;
        }

        /* 欢迎页 */
        .chat-welcome {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          min-height: 300px;
          text-align: center;
          animation: fadeIn 0.5s ease;
        }

        .welcome-icon {
          width: 80px;
          height: 80px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--gradient-primary);
          border-radius: 24px;
          font-size: 36px;
          color: white;
          margin-bottom: 24px;
          box-shadow: 0 8px 32px rgba(99, 102, 241, 0.3);
          animation: breathe 3s ease-in-out infinite;
        }

        @keyframes breathe {
          0%, 100% { 
            box-shadow: 0 8px 32px rgba(99, 102, 241, 0.3);
          }
          50% { 
            box-shadow: 0 8px 48px rgba(99, 102, 241, 0.5);
          }
        }

        .chat-welcome h2 {
          font-size: 28px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 8px;
        }

        .chat-welcome p {
          font-size: 15px;
          color: var(--text-muted);
          margin-bottom: 24px;
        }

        .welcome-commands {
          display: flex;
          gap: 8px;
        }

        .command-tag {
          padding: 6px 14px;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-default);
          border-radius: 20px;
          font-size: 13px;
          color: var(--text-secondary);
          font-family: monospace;
        }

        /* 消息气泡 */
        .message {
          display: flex;
          gap: 12px;
          max-width: 85%;
          animation: slideUp 0.3s ease forwards;
          opacity: 0;
        }

        .message-user {
          align-self: flex-end;
          flex-direction: row-reverse;
        }

        .message-avatar {
          width: 36px;
          height: 36px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          font-size: 16px;
        }

        .message-user .message-avatar {
          background: var(--gradient-primary);
          color: white;
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
        }

        .message-assistant .message-avatar {
          background: var(--bg-tertiary);
          color: var(--primary-light);
          border: 1px solid var(--border-default);
        }

        .message-content {
          display: flex;
          flex-direction: column;
        }

        .message-text {
          padding: 12px 16px;
          border-radius: 16px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          white-space: pre-wrap;
          word-break: break-word;
          font-size: 14px;
          line-height: 1.6;
          color: var(--text-primary);
        }

        .message-user .message-text {
          background: var(--gradient-primary);
          color: white;
          border: none;
          border-bottom-right-radius: 4px;
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
        }

        .message-assistant .message-text {
          border-bottom-left-radius: 4px;
        }

        /* 加载动画 */
        .message.loading .message-text {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 12px 20px;
        }

        .typing-dot {
          width: 6px;
          height: 6px;
          background: var(--primary-light);
          border-radius: 50%;
          animation: typing 1.4s ease-in-out infinite;
        }

        .typing-dot:nth-child(2) {
          animation-delay: 0.2s;
        }

        .typing-dot:nth-child(3) {
          animation-delay: 0.4s;
        }

        @keyframes typing {
          0%, 60%, 100% {
            transform: translateY(0);
            opacity: 0.4;
          }
          30% {
            transform: translateY(-4px);
            opacity: 1;
          }
        }

        /* 输入区域容器 - 居中定位 */
        .chat-input-container {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          display: flex;
          justify-content: center;
          padding: 16px 20px;
          padding-bottom: calc(24px + env(safe-area-inset-bottom));
          background: linear-gradient(to top, var(--bg-primary) 60%, transparent);
          z-index: 100;
        }

        .chat-input-wrapper-centered {
          width: 100%;
          max-width: 800px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .chat-input {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-default);
          border-radius: 16px;
          transition: var(--transition-fast);
          width: 100%;
          box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.3);
        }

        .chat-input:focus-within {
          border-color: var(--primary);
          box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.3), 0 0 0 3px rgba(99, 102, 241, 0.15);
        }

        /* 内联模型选择器 */
        .model-select-inline {
          width: 130px;
          flex-shrink: 0;
        }

        .model-select-inline .ant-select-selector {
          background: var(--bg-tertiary) !important;
          border: 1px solid var(--border-subtle) !important;
          border-radius: 10px !important;
          height: 36px !important;
          padding: 4px 8px !important;
        }

        .model-select-inline .ant-select-selection-item {
          line-height: 26px !important;
          color: var(--text-primary);
          font-weight: 500;
        }

        .model-select-inline:hover .ant-select-selector {
          border-color: var(--primary) !important;
        }

        .model-select-inline.ant-select-focused .ant-select-selector {
          border-color: var(--primary) !important;
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15) !important;
        }

        .chat-textarea {
          flex: 1;
          border: none !important;
          background: transparent !important;
          resize: none;
          font-size: 14px;
          line-height: 1.5;
        }

        .chat-textarea:focus {
          box-shadow: none !important;
        }

        .send-btn {
          width: 40px !important;
          height: 40px !important;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* 命令提示 */
        .command-hints {
          background: var(--bg-elevated);
          border: 1px solid var(--border-default);
          border-radius: 12px;
          box-shadow: var(--shadow-lg);
          max-height: 200px;
          overflow-y: auto;
          margin-bottom: 8px;
          width: 100%;
          max-width: 800px;
          margin-top: 8px;
        }

        .command-hint-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          cursor: pointer;
          transition: var(--transition-fast);
        }

        .command-hint-item:hover, .command-hint-item.selected {
          background: var(--bg-tertiary);
        }

        .command-hint-item:first-child {
          border-radius: 12px 12px 0 0;
        }

        .command-hint-item:last-child {
          border-radius: 0 0 12px 12px;
        }

        .command-usage {
          font-weight: 500;
          color: var(--primary-light);
          font-family: monospace;
        }

        .command-desc {
          color: var(--text-muted);
          font-size: 12px;
        }

        /* 输入框底部 */
        .input-footer {
          display: flex;
          justify-content: center;
          margin-top: 8px;
        }

        .input-hint {
          font-size: 11px;
          color: var(--text-muted);
        }

        /* 模型选择下拉框 */
        .model-select-dropdown {
          background: var(--bg-elevated) !important;
          border: 1px solid var(--border-default) !important;
        }

        /* 滚动条样式 */
        .chat-messages::-webkit-scrollbar {
          width: 6px;
        }

        .chat-messages::-webkit-scrollbar-track {
          background: transparent;
        }

        .chat-messages::-webkit-scrollbar-thumb {
          background: var(--border-default);
          border-radius: 3px;
        }

        .chat-messages::-webkit-scrollbar-thumb:hover {
          background: var(--primary);
        }
      `}</style>
    </div>
  )
}

export default ChatArea