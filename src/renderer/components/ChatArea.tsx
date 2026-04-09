import { useState, useRef, useEffect, useCallback } from 'react'
import { Input, Button, Select, Empty, Modal, message, Tooltip, Tag, Segmented, Badge } from 'antd'
import {
  SendOutlined,
  RobotOutlined,
  UserOutlined,
  DeleteOutlined,
  LoadingOutlined,
  ThunderboltOutlined,
  ApiOutlined,
  ToolOutlined,
  TeamOutlined,
} from '@ant-design/icons'

// 导入预览组件
import MessageContent from './MessageContent'

const { TextArea } = Input

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  toolCalls?: ToolCallInfo[]
  isStreaming?: boolean
}

interface ToolCallInfo {
  id: string
  name: string
  status: 'pending' | 'running' | 'success' | 'error'
  result?: string
}

interface AgentEvent {
  type: string
  toolCallId?: string
  toolName?: string
  args?: any
  result?: any
  isError?: boolean
  error?: string
  message?: any
  data?: any
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
/agent  - 切换到 Agent 模式
/ai     - 切换到传统 AI 模式
/preview - 预览文件链接

快捷键：
Shift+Enter - 换行
Enter - 发送消息

文件链接格式：
[文件名](URL) - 在消息中显示可预览的文件链接
<URL|文件名> - 另一种文件链接格式`
      Modal.info({
        title: '帮助',
        content: <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>{helpText}</pre>,
        width: 450,
        centered: true
      })
    }
  },
  {
    name: 'clear',
    description: '清除当前对话',
    usage: '/clear',
    action: async () => {}
  },
  {
    name: 'models',
    description: '列出所有可用模型',
    usage: '/models',
    action: async () => {}
  },
  {
    name: 'model',
    description: '切换当前模型',
    usage: '/model <模型ID>',
    action: async () => {}
  },
  {
    name: 'agent',
    description: '切换到 Agent 模式',
    usage: '/agent',
    action: async () => {}
  },
  {
    name: 'ai',
    description: '切换到传统 AI 模式',
    usage: '/ai',
    action: async () => {}
  }
]

// 模式类型
type ChatMode = 'ai' | 'agent'

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

  // ===== Agent 模式相关状态 =====
  const [chatMode, setChatMode] = useState<ChatMode>('ai')
  const [agentInitialized, setAgentInitialized] = useState(false)
  const [agentEvents, setAgentEvents] = useState<AgentEvent[]>([])
  const [currentToolCalls, setCurrentToolCalls] = useState<Map<string, ToolCallInfo>>(new Map())

  // ===== 多 Agent 协调相关状态 =====
  const [showCoordinator, setShowCoordinator] = useState(false)
  const [coordinatorAgents, setCoordinatorAgents] = useState<Array<{
    id: string
    name: string
    role: string
    status: 'idle' | 'running' | 'error'
    lastResult?: string
  }>>([])
  const [coordinatorStrategy, setCoordinatorStrategy] = useState<'round-robin' | 'priority' | 'broadcast' | 'router'>('router')

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

  // 初始化 Agent
  useEffect(() => {
    if (chatMode === 'agent' && !agentInitialized) {
      initAgent()
    }
  }, [chatMode, agentInitialized])

  const initAgent = async () => {
    try {
      await window.electronAPI.agent.init({
        systemPrompt: '你是一个智能助手，可以使用工具来完成任务。',
        thinkingLevel: 'medium'
      })
      await window.electronAPI.agent.reloadTools()
      setAgentInitialized(true)
      console.log('[ChatArea] Agent 初始化成功')
    } catch (error) {
      console.error('[ChatArea] Agent 初始化失败:', error)
      message.error('Agent 初始化失败')
    }
  }

  const loadSessionMessages = async () => {
    if (!sessionId) return
    try {
      const sessionData = await window.electronAPI.session.get(sessionId)
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
      const models = await window.electronAPI.ai.listModels()
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
          const models = await window.electronAPI.ai.listModels()
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
      case 'agent':
        setChatMode('agent')
        message.success('已切换到 Agent 模式')
        break
      case 'ai':
        setChatMode('ai')
        message.success('已切换到传统 AI 模式')
        break
      default:
        await command.action(args)
    }
  }, [modelOptions])

  // ===== Agent 模式发送消息 =====
  const handleAgentSend = async (trimmedInput: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: trimmedInput,
      timestamp: Date.now()
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setLoading(true)
    setAgentEvents([])
    setCurrentToolCalls(new Map())

    try {
      // 确保 Agent 已初始化
      if (!agentInitialized) {
        await initAgent()
      }

      // 发送消息
      const response = await window.electronAPI.agent.prompt(trimmedInput)

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.content || response.error || '无响应',
        timestamp: Date.now(),
        toolCalls: Array.from(currentToolCalls.values()),
      }

      setMessages((prev) => [...prev, assistantMessage])

      // 保存到数据库
      try {
        await window.electronAPI.message.add(sessionId, {
          id: userMessage.id,
          role: 'user',
          content: trimmedInput,
          createdAt: new Date().toISOString()
        })
        await window.electronAPI.message.add(sessionId, {
          id: assistantMessage.id,
          role: 'assistant',
          content: assistantMessage.content,
          createdAt: new Date().toISOString()
        })
      } catch (e) {
        console.error('Save message error:', e)
      }

    } catch (error) {
      console.error('[ChatArea] Agent 发送失败:', error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Agent 错误: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now()
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  // ===== 传统 AI 模式发送消息 =====
  const handleAISend = async (trimmedInput: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: trimmedInput,
      timestamp: Date.now()
    }

    // 保存用户消息
    try {
      await window.electronAPI.message.add(sessionId, {
        id: userMessage.id,
        role: 'user',
        content: trimmedInput,
        createdAt: new Date().toISOString()
      })
      // 更新会话标题（如果是第一条消息）
      if (messages.length === 0) {
        const title = trimmedInput.slice(0, 30) + (trimmedInput.length > 30 ? '...' : '')
        await window.electronAPI.session.update(sessionId, { title })
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

      const response = await window.electronAPI.ai.chat(
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
        await window.electronAPI.message.add(sessionId, {
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

  // ===== 统一发送处理 =====
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

    // 根据模式选择发送方式
    if (chatMode === 'agent') {
      await handleAgentSend(trimmedInput)
    } else {
      await handleAISend(trimmedInput)
    }
  }

  // 清除对话
  const handleClear = async () => {
    if (!sessionId) return
    try {
      // 删除所有消息
      const sessionData = await window.electronAPI.session.get(sessionId)
      if (sessionData?.messages) {
        for (const msg of sessionData.messages) {
          await window.electronAPI.message.delete(msg.id)
        }
      }
      setMessages([])
      setAgentEvents([])
      setCurrentToolCalls(new Map())
      message.success('对话已清除')
    } catch (error) {
      console.error('Clear error:', error)
    }
  }

  // ===== 多 Agent 协调器 =====
  const handleOpenCoordinator = () => {
    setShowCoordinator(true)
    // 初始化默认 Agent
    setCoordinatorAgents([
      { id: 'search-agent', name: '搜索专家', role: 'search', status: 'idle' },
      { id: 'code-agent', name: '代码专家', role: 'coding', status: 'idle' },
      { id: 'write-agent', name: '写作专家', role: 'writing', status: 'idle' },
    ])
  }

  const handleCoordinatorExecute = async (input: string) => {
    setLoading(true)
    setAgentEvents([])

    // 模拟协调执行
    for (const agent of coordinatorAgents) {
      setCoordinatorAgents(prev => prev.map(a =>
        a.id === agent.id ? { ...a, status: 'running' as const } : a
      ))

      try {
        const response = await window.electronAPI.agent.prompt(`[${agent.role}] ${input}`)
        setCoordinatorAgents(prev => prev.map(a =>
          a.id === agent.id ? { ...a, status: 'idle' as const, lastResult: response.content } : a
        ))
      } catch (error) {
        setCoordinatorAgents(prev => prev.map(a =>
          a.id === agent.id ? { ...a, status: 'error' as const } : a
        ))
      }

      if (coordinatorStrategy !== 'broadcast') break // 非 broadcast 模式只执行一个
    }

    setLoading(false)
    setShowCoordinator(false)
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
          {/* 模式切换 */}
          <Segmented
            value={chatMode}
            onChange={(value) => setChatMode(value as ChatMode)}
            options={[
              { value: 'ai', label: 'AI', icon: <ApiOutlined /> },
              { value: 'agent', label: 'Agent', icon: <ThunderboltOutlined /> },
            ]}
            size="small"
          />
          <span className="chat-title">
            <span className="gradient-text">{chatMode === 'agent' ? 'Agent' : 'AI'}</span> 对话
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
          {/* 多 Agent 协调按钮 */}
          {chatMode === 'agent' && (
            <Tooltip title="多 Agent 协调">
              <Button
                type="text"
                icon={<TeamOutlined />}
                onClick={handleOpenCoordinator}
                className="header-btn"
              />
            </Tooltip>
          )}
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

      {/* 消息区域 */}
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-welcome">
            <div className="welcome-icon">
              {chatMode === 'agent' ? <ThunderboltOutlined /> : <RobotOutlined />}
            </div>
            <h2>你好，我是 <span className="gradient-text">Seven</span></h2>
            <p>
              {chatMode === 'agent'
                ? 'Agent 模式支持工具调用、Steering 和 FollowUp'
                : '选择一个模型，开始对话吧'}
            </p>
            <div className="welcome-commands">
              <span className="command-tag">/help</span>
              <span className="command-tag">/clear</span>
              <span className="command-tag">/models</span>
              {chatMode === 'ai' && <span className="command-tag">/agent</span>}
              {chatMode === 'agent' && <span className="command-tag">/ai</span>}
            </div>
            <div className="welcome-preview-tip">
              💡 消息中可使用 <code>[文件名](URL)</code> 格式添加可预览的文件链接
            </div>
            {chatMode === 'agent' && (
              <div className="agent-status">
                <Badge status={agentInitialized ? 'success' : 'default'} />
                <span>{agentInitialized ? 'Agent 已就绪' : 'Agent 初始化中...'}</span>
              </div>
            )}
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={msg.id}
              className={`message message-${msg.role}`}
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <div className="message-avatar">
                {msg.role === 'user' ? <UserOutlined /> : (chatMode === 'agent' ? <ThunderboltOutlined /> : <RobotOutlined />)}
              </div>
              <div className="message-content">
                <div className="message-text">
                  {/* 使用 MessageContent 组件渲染消息，支持文件链接预览 */}
                  <MessageContent content={msg.content} />
                </div>
                {/* 显示工具调用信息 */}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="tool-calls-info">
                    {msg.toolCalls.map(tc => (
                      <Tag key={tc.id} color={tc.status === 'success' ? 'green' : tc.status === 'error' ? 'red' : 'blue'}>
                        <ToolOutlined /> {tc.name}
                      </Tag>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {/* Agent 事件实时显示 */}
        {loading && chatMode === 'agent' && agentEvents.length > 0 && (
          <div className="agent-events-panel">
            <div className="agent-events-header">
              <ToolOutlined /> Agent 执行中...
            </div>
            <div className="agent-events-list">
              {agentEvents.map((event, index) => (
                <div key={index} className={`agent-event agent-event-${event.type}`}>
                  {event.type === 'tool_execution_start' && (
                    <span><Tag color="processing">执行</Tag> {event.toolName}</span>
                  )}
                  {event.type === 'tool_execution_end' && (
                    <span><Tag color={event.isError ? 'error' : 'success'}>{event.isError ? '失败' : '完成'}</Tag> {event.toolName}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div className="message message-assistant loading">
            <div className="message-avatar">
              {chatMode === 'agent' ? <ThunderboltOutlined /> : <RobotOutlined />}
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

      {/* 输入区域 */}
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
              placeholder={chatMode === 'agent' ? "Agent 模式 - 支持工具调用... (输入 / 查看命令)" : "发送消息... (输入 / 查看命令)"}
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
            {chatMode === 'agent' && (
              <span className="mode-hint">
                <ThunderboltOutlined /> Agent 模式
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 多 Agent 协调器面板 */}
      <Modal
        title={
          <span><TeamOutlined /> 多 Agent 协调</span>
        }
        open={showCoordinator}
        onCancel={() => setShowCoordinator(false)}
        footer={null}
        width={600}
      >
        <div className="coordinator-panel">
          <div className="coordinator-strategy">
            <span>协调策略：</span>
            <Select
              value={coordinatorStrategy}
              onChange={setCoordinatorStrategy}
              options={[
                { value: 'router', label: '智能路由' },
                { value: 'round-robin', label: '轮流执行' },
                { value: 'priority', label: '优先级' },
                { value: 'broadcast', label: '并行广播' },
              ]}
              style={{ width: 150 }}
            />
          </div>

          <div className="coordinator-agents">
            {coordinatorAgents.map(agent => (
              <div key={agent.id} className={`coordinator-agent coordinator-agent-${agent.status}`}>
                <div className="agent-info">
                  <span className="agent-name">{agent.name}</span>
                  <Tag>{agent.role}</Tag>
                </div>
                <Badge status={agent.status === 'running' ? 'processing' : agent.status === 'error' ? 'error' : 'success'} />
              </div>
            ))}
          </div>

          <div className="coordinator-actions">
            <Button
              type="primary"
              onClick={() => {
                if (input.trim()) {
                  handleCoordinatorExecute(input.trim())
                }
              }}
              loading={loading}
              disabled={!input.trim()}
            >
              执行协调任务
            </Button>
          </div>
        </div>
      </Modal>

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
          gap: 12px;
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
          flex-wrap: wrap;
          justify-content: center;
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

        .welcome-preview-tip {
          margin-top: 16px;
          padding: 10px 16px;
          background: var(--bg-tertiary);
          border-radius: 8px;
          font-size: 13px;
          color: var(--text-muted);
        }

        .welcome-preview-tip code {
          background: var(--bg-secondary);
          padding: 2px 6px;
          border-radius: 4px;
          font-family: monospace;
          color: var(--primary-light);
        }

        .agent-status {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 16px;
          font-size: 13px;
          color: var(--text-muted);
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
          gap: 8px;
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

        .tool-calls-info {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }

        /* Agent 事件面板 */
        .agent-events-panel {
          background: var(--bg-tertiary);
          border: 1px solid var(--border-default);
          border-radius: 12px;
          padding: 12px;
          margin-bottom: 16px;
        }

        .agent-events-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 500;
          color: var(--text-primary);
          margin-bottom: 8px;
        }

        .agent-events-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .agent-event {
          font-size: 12px;
          color: var(--text-secondary);
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

        /* 输入区域 */
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
          align-items: center;
          gap: 16px;
          margin-top: 8px;
        }

        .input-hint {
          font-size: 11px;
          color: var(--text-muted);
        }

        .mode-hint {
          font-size: 11px;
          color: var(--primary-light);
        }

        /* 协调器面板 */
        .coordinator-panel {
          padding: 16px 0;
        }

        .coordinator-strategy {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 20px;
        }

        .coordinator-agents {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 20px;
        }

        .coordinator-agent {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background: var(--bg-secondary);
          border-radius: 8px;
          border: 1px solid var(--border-subtle);
        }

        .coordinator-agent-running {
          border-color: var(--primary);
          background: rgba(99, 102, 241, 0.1);
        }

        .coordinator-agent-error {
          border-color: #ef4444;
          background: rgba(239, 68, 68, 0.1);
        }

        .agent-info {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .agent-name {
          font-weight: 500;
          color: var(--text-primary);
        }

        .coordinator-actions {
          display: flex;
          justify-content: flex-end;
        }

        /* 滚动条 */
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

        /* Segmented 样式 */
        .ant-segmented {
          background: var(--bg-tertiary) !important;
        }

        .ant-segmented-item {
          color: var(--text-secondary) !important;
        }

        .ant-segmented-item-selected {
          background: var(--gradient-primary) !important;
          color: white !important;
        }
      `}</style>
    </div>
  )
}

export default ChatArea