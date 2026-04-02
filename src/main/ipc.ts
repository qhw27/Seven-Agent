import { app, ipcMain } from 'electron'
import { initDatabase, query, run, get, all, saveDatabase } from './database'
import { startServer } from './server'
import { aiService, DEFAULT_MODEL, type ChatMessage } from './ai-service'
import { ModelConfig, PRESET_MODELS,  } from '../shared/model-config';
import { DatabaseConnection } from './database/connection'
import { DatabaseMigrations } from './database/migrations'
import { SessionAPI } from './services/session.api'

// 打印环境变量（调试用）
console.log('[Env] ===== Seven App Start =====')
console.log('[Env] ANTHROPIC_AUTH_TOKEN:', process.env.ANTHROPIC_AUTH_TOKEN ? '***' : 'empty')
console.log('[Env] ANTHROPIC_BASE_URL:', process.env.ANTHROPIC_BASE_URL)
console.log('[Env] ANTHROPIC_MODEL:', process.env.ANTHROPIC_MODEL)
console.log('[Env] OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '***' : 'empty')
console.log('[Env] MINIMAX_API_KEY:', process.env.MINIMAX_API_KEY ? '***' : 'empty')
console.log('[Env] QWEN_API_KEY:', process.env.QWEN_API_KEY ? '***' : 'empty')
console.log('[Env] DEEPSEEK_API_KEY:', process.env.DEEPSEEK_API_KEY ? '***' : 'empty')
console.log('[Env] KIMI_API_KEY:', process.env.KIMI_API_KEY ? '***' : 'empty')
console.log('[Env] HTTPS_PROXY:', process.env.HTTPS_PROXY || 'not set')
console.log('[Env] ==========================')

let serverPort = 3000

// 模型 ID 映射（简称 -> 完整 ID）
const MODEL_ID_MAP: Record<string, string> = {
  'claude': 'claude-3-5-sonnet',
  'claude-3-5': 'claude-3-5-sonnet',
  'gpt': 'gpt-4o',
  'gpt-4': 'gpt-4o',
  'qwen': 'qwen-turbo',
  'minimax': 'minimax-m2.5',
  'kimi': 'kimi',
  'deepseek': 'deepseek-chat',
}


// IPC 处理器
function setupIpcHandlers(): void {
  // 数据库操作 (使用 sql.js)
  ipcMain.handle('db:query', async (_event, sql: string, params?: unknown[]) => {
    try {
      return query(sql, params || [])
    } catch (error) {
      console.error('[DB Error]', error)
      throw error
    }
  })

  ipcMain.handle('db:run', async (_event, sql: string, params?: unknown[]) => {
    return run(sql, params || [])
  })

  ipcMain.handle('db:get', async (_event, sql: string, params?: unknown[]) => {
    return get(sql, params || [])
  })

  ipcMain.handle('db:all', async (_event, sql: string, params?: unknown[]) => {
    return all(sql, params || [])
  })

  // 会话操作 - 使用 sql.js
  ipcMain.handle('db-create-session', async (_event, sessionData: any) => {
    try {
      const now = new Date().toISOString()
      run('INSERT INTO sessions (id, title, model, thinking_level, created_at, last_modified, message_count) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [sessionData.id, sessionData.title, sessionData.model, sessionData.thinkingLevel || 'medium', now, now, 0])
      saveDatabase()
      return { id: sessionData.id, title: sessionData.title, model: sessionData.model, createdAt: now, lastModified: now, messageCount: 0 }
    } catch (error) {
      console.error('[IPC] create-session error:', error)
      throw error
    }
  })

  ipcMain.handle('db-get-session', async (_event, sessionId: string) => {
    try {
      const session = get<any>('SELECT * FROM sessions WHERE id = ?', [sessionId])
      if (!session) return null
      const messages = all<any>('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC', [sessionId])
      return {
        id: session.id,
        title: session.title,
        model: session.model,
        thinkingLevel: session.thinking_level,
        createdAt: session.created_at,
        lastModified: session.last_modified,
        messageCount: session.message_count,
        messages: messages.map(m => ({
          id: m.id,
          sessionId: m.session_id,
          role: m.role,
          content: m.content,
          createdAt: m.created_at,
          metadata: m.metadata ? JSON.parse(m.metadata) : undefined
        }))
      }
    } catch (error) {
      console.error('[IPC] get-session error:', error)
      throw error
    }
  })

  ipcMain.handle('db-get-session-list', async (_event, page?: number, pageSize?: number) => {
    try {
      const offset = (page || 0) * (pageSize || 100)
      const sessions = all<any>('SELECT * FROM sessions ORDER BY last_modified DESC LIMIT ? OFFSET ?', [pageSize || 100, offset])
      const total = get<any>('SELECT COUNT(*) as count FROM sessions')?.count || 0
      return {
        sessions: sessions.map(s => ({
          id: s.id,
          title: s.title,
          model: s.model,
          thinkingLevel: s.thinking_level,
          createdAt: s.created_at,
          lastModified: s.last_modified,
          messageCount: s.message_count
        })),
        total,
        page: page || 0,
        pageSize: pageSize || 100
      }
    } catch (error) {
      console.error('[IPC] get-session-list error:', error)
      throw error
    }
  })

  ipcMain.handle('db-search-sessions', async (_event, keyword?: string) => {
    try {
      let sessions
      if (!keyword || keyword.trim() === '') {
        sessions = all<any>('SELECT * FROM sessions ORDER BY last_modified DESC LIMIT 100', [])
      } else {
        sessions = all<any>('SELECT * FROM sessions WHERE title LIKE ? ORDER BY last_modified DESC', [`%${keyword.trim()}%`])
      }
      return sessions.map(s => ({
        id: s.id,
        title: s.title,
        model: s.model,
        thinkingLevel: s.thinking_level,
        createdAt: s.created_at,
        lastModified: s.last_modified,
        messageCount: s.message_count
      }))
    } catch (error) {
      console.error('[IPC] search-sessions error:', error)
      throw error
    }
  })

  ipcMain.handle('db-update-session-title', async (_event, sessionId: string, newTitle: string) => {
    try {
      const now = new Date().toISOString()
      run('UPDATE sessions SET title = ?, last_modified = ? WHERE id = ?', [newTitle.trim(), now, sessionId])
      saveDatabase()
      const session = get<any>('SELECT * FROM sessions WHERE id = ?', [sessionId])
      return {
        id: session.id,
        title: session.title,
        model: session.model,
        thinkingLevel: session.thinking_level,
        createdAt: session.created_at,
        lastModified: session.last_modified,
        messageCount: session.message_count
      }
    } catch (error) {
      console.error('[IPC] update-session-title error:', error)
      throw error
    }
  })

  ipcMain.handle('db-delete-session', async (_event, sessionId: string) => {
    try {
      run('DELETE FROM messages WHERE session_id = ?', [sessionId])
      run('DELETE FROM sessions WHERE id = ?', [sessionId])
      saveDatabase()
      return { success: true }
    } catch (error) {
      console.error('[IPC] delete-session error:', error)
      throw error
    }
  })

  ipcMain.handle('db-get-session-metadata', async (_event, sessionId: string) => {
    try {
      const session = get<any>('SELECT * FROM sessions WHERE id = ?', [sessionId])
      if (!session) return null
      return {
        id: session.id,
        title: session.title,
        model: session.model,
        thinkingLevel: session.thinking_level,
        createdAt: session.created_at,
        lastModified: session.last_modified,
        messageCount: session.message_count
      }
    } catch (error) {
      console.error('[IPC] get-session-metadata error:', error)
      throw error
    }
  })

  ipcMain.handle('db-add-message', async (_event, sessionId: string, messageData: any) => {
    try {
      const now = messageData.createdAt || new Date().toISOString()
      const metadata = messageData.metadata ? JSON.stringify(messageData.metadata) : null
      run('INSERT INTO messages (id, session_id, role, content, created_at, metadata) VALUES (?, ?, ?, ?, ?, ?)',
        [messageData.id, sessionId, messageData.role, messageData.content || null, now, metadata])

      // 更新会话消息数量
      const userMsgCount = get<any>('SELECT COUNT(*) as count FROM messages WHERE session_id = ? AND role = ?', [sessionId, 'user'])?.count || 0
      run('UPDATE sessions SET message_count = ?, last_modified = ? WHERE id = ?', [userMsgCount, now, sessionId])
      saveDatabase()

      return {
        id: messageData.id,
        sessionId,
        role: messageData.role,
        content: messageData.content,
        createdAt: now
      }
    } catch (error) {
      console.error('[IPC] add-message error:', error)
      throw error
    }
  })

  ipcMain.handle('db-delete-message', async (_event, messageId: string) => {
    try {
      const message = get<any>('SELECT session_id FROM messages WHERE id = ?', [messageId])
      if (message) {
        run('DELETE FROM messages WHERE id = ?', [messageId])
        // 更新消息数量
        const userMsgCount = get<any>('SELECT COUNT(*) as count FROM messages WHERE session_id = ? AND role = ?', [message.session_id, 'user'])?.count || 0
        const now = new Date().toISOString()
        run('UPDATE sessions SET message_count = ?, last_modified = ? WHERE id = ?', [userMsgCount, now, message.session_id])
        saveDatabase()
      }
      return { success: true }
    } catch (error) {
      console.error('[IPC] delete-message error:', error)
      throw error
    }
  })

  ipcMain.handle('db-save-session-batch', async (_event, sessions: any[]) => {
    try {
      for (const session of sessions) {
        const userMessageCount = session.messages?.filter((msg: any) => msg.role === 'user').length || 0
        run('INSERT OR REPLACE INTO sessions (id, title, model, thinking_level, created_at, last_modified, message_count) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [session.id, session.title, session.model, session.thinkingLevel || 'medium', session.createdAt, session.lastModified, userMessageCount])

        if (session.messages && session.messages.length > 0) {
          for (const msg of session.messages) {
            const metadata = msg.metadata ? JSON.stringify(msg.metadata) : null
            run('INSERT OR REPLACE INTO messages (id, session_id, role, content, created_at, metadata) VALUES (?, ?, ?, ?, ?, ?)',
              [msg.id, session.id, msg.role, msg.content || null, msg.createdAt, metadata])
          }
        }
      }
      saveDatabase()
      return { success: true }
    } catch (error) {
      console.error('[IPC] save-session-batch error:', error)
      throw error
    }
  })

  // AI 对话 - 使用预设模型配置
  ipcMain.handle('ai:chat', async (_event, messages: ChatMessage[], options?: { model?: string }) => {
    // 处理模型 ID 映射
    let modelId = options?.model || DEFAULT_MODEL.id

    // 映射简称到完整 ID
    if (MODEL_ID_MAP[modelId]) {
      modelId = MODEL_ID_MAP[modelId]
    }

    console.log('[AI] Chat with model:', modelId)
    console.log('[AI] Available preset models:', PRESET_MODELS.map(m => m.id))

    // 先尝试从预设模型获取配置
    let modelConfig = aiService.getModelById(modelId)
    console.log('[AI] Found preset model:', modelConfig ? modelConfig.id : 'not found')

    // 如果没找到预设模型，从数据库查找用户自定义模型
    if (!modelConfig) {
      console.log('[AI] Searching in database for:', modelId)
      const dbModel = get<{
        id: string
        name: string
        provider: string
        api_key?: string
        endpoint?: string
        modelName?: string
      }>('SELECT * FROM models WHERE id = ?', [modelId])

      if (dbModel && dbModel.api_key) {
        modelConfig = {
          id: dbModel.id,
          name: dbModel.name,
          provider: dbModel.provider as ModelConfig['provider'],
          model: dbModel.modelName || dbModel.name,
          baseURL: dbModel.endpoint || '',
          apiKey: dbModel.api_key,
          reasoning: false,
          input: ['text'],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 32000,
          maxTokens: 4096
        }
        console.log('[AI] Found in database:', dbModel.id)
      }
    }

    // 如果还没有，尝试按 provider 查找
    // 修复：使用预设模型的 provider 来查找，而不是 modelId
    if (!modelConfig?.apiKey) {
      const providerToSearch = modelConfig?.provider || modelId
      const dbModelByProvider = get<{
        id: string
        name: string
        provider: string
        api_key?: string
        endpoint?: string
        modelName?: string
      }>('SELECT * FROM models WHERE provider = ?', [providerToSearch])

      if (dbModelByProvider && dbModelByProvider.api_key) {
        modelConfig = {
          id: dbModelByProvider.id,
          name: dbModelByProvider.name,
          provider: dbModelByProvider.provider as ModelConfig['provider'],
          model: dbModelByProvider.modelName || dbModelByProvider.name,
          baseURL: dbModelByProvider.endpoint || '',
          apiKey: dbModelByProvider.api_key,
          reasoning: false,
          input: ['text'],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 32000,
          maxTokens: 4096
        }
      }
    }

    // 如果找到了配置，打印配置信息
    if (modelConfig) {
      console.log('[AI] Using config:', {
        id: modelConfig.id,
        provider: modelConfig.provider,
        hasApiKey: !!modelConfig.apiKey,
        baseURL: modelConfig.baseURL,
        model: modelConfig.model
      })
    }

    // 简化版：只用环境变量覆盖 API Key
    let envApiKey: string | undefined
    const providerType = modelConfig?.provider || modelId
    if (providerType === 'anthropic') {
      envApiKey = process.env.ANTHROPIC_AUTH_TOKEN
    } else if (providerType === 'minimax') {
      envApiKey = process.env.MINIMAX_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN
    } else if (providerType === 'openai') {
      envApiKey = process.env.OPENAI_API_KEY
    } else if (providerType === 'deepseek') {
      envApiKey = process.env.DEEPSEEK_API_KEY
    } else if (providerType === 'qwen') {
      envApiKey = process.env.QWEN_API_KEY
    } else if (providerType === 'moonshot') {
      envApiKey = process.env.KIMI_API_KEY
    }

    if (envApiKey) {
      console.log('[AI] Using env API Key for:', providerType)
      modelConfig = { ...modelConfig, apiKey: envApiKey }
    }

    if (!modelConfig?.apiKey) {
      return {
        content: `请先在"模型管理"中配置模型 API Key\n\n当前模型 ID：${modelId}\n\n已支持的预设模型：\n${PRESET_MODELS.map(m => `- ${m.name} (${m.id})`).join('\n')}`
      }
    }

    try {
      const response = await aiService.chat(messages, modelConfig)
      return { content: response }
    } catch (error) {
      console.error('[AI] Error:', error)
      const errMsg = error instanceof Error ? error.message : String(error)
      return { content: `AI 调用失败: ${errMsg}` }
    }
  })

  // 列出所有可用模型（预设 + 用户自定义）
  ipcMain.handle('ai:listModels', async () => {
    const dbModels = all<{
      id: string
      name: string
      provider: string
      api_key?: string
      endpoint?: string
      modelName?: string
    }>('SELECT * FROM models')

    const allModels: Array<{
      id: string
      name: string
      provider: string
      modelName: string
      endpoint: string
      configured: boolean
      apiKey?: string
    }> = []

    // 添加预设模型 - 优先使用环境变量
    for (const model of PRESET_MODELS) {
      const dbModel = dbModels.find(dm => dm.id === model.id || dm.provider === model.provider)
      const hasEnvApiKey = !!model.apiKey
      const hasDbApiKey = !!(dbModel?.api_key)
      const configured = hasEnvApiKey || hasDbApiKey

      allModels.push({
        id: model.id,
        name: model.name,
        provider: model.provider,
        modelName: model.model,
        endpoint: model.baseURL || '',
        configured,
        apiKey: model.apiKey || dbModel?.api_key
      })
    }

    // 添加用户自定义模型（不在预设中的）
    for (const dbModel of dbModels) {
      const exists = PRESET_MODELS.find(p => p.id === dbModel.id || p.provider === dbModel.provider)
      if (!exists) {
        allModels.push({
          id: dbModel.id,
          name: dbModel.name,
          provider: dbModel.provider,
          modelName: dbModel.modelName || dbModel.name,
          endpoint: dbModel.endpoint || '',
          configured: true,
          apiKey: dbModel.api_key
        })
      }
    }

    return allModels
  })

  // 列出所有可用模型（包括未配置的）
  ipcMain.handle('ai:listAllModels', async () => {
    return PRESET_MODELS.map(model => ({
      id: model.id,
      name: model.name,
      provider: model.provider,
      modelName: model.model,
      endpoint: model.baseURL,
      configured: false
    }))
  })

  // 添加/更新模型配置
  ipcMain.handle('ai:setModelConfig', async (_event, config: {
    id: string
    apiKey?: string
    name?: string
    provider?: string
    endpoint?: string
    modelName?: string
  }) => {
    const { id, apiKey, name, provider, endpoint, modelName } = config
    console.log('[AI] Saving model config:', { id, apiKey: apiKey ? '***' : 'empty' })

    // 映射简称到完整 ID
    let finalId = id
    if (MODEL_ID_MAP[id]) {
      finalId = MODEL_ID_MAP[id]
    }

    const presetModel = aiService.getModelById(finalId)

    const finalName = name || presetModel?.name || id
    const finalProvider = provider || presetModel?.provider || 'custom'
    const finalEndpoint = endpoint || presetModel?.baseURL || ''
    const finalModelName = modelName || presetModel?.model || id

    const existing = get<{ id: string; api_key?: string }>('SELECT id, api_key FROM models WHERE id = ?', [finalId])

    if (existing) {
      const finalApiKey = apiKey && apiKey.trim() !== '' ? apiKey : existing.api_key
      run('UPDATE models SET api_key = ?, name = ?, endpoint = ?, modelName = ? WHERE id = ?',
        [finalApiKey, finalName, finalEndpoint, finalModelName, finalId])
    } else {
      run('INSERT INTO models (id, name, provider, api_key, endpoint, modelName) VALUES (?, ?, ?, ?, ?, ?)',
        [finalId, finalName, finalProvider, apiKey || '', finalEndpoint, finalModelName])
    }

    saveDatabase()
    return { success: true, message: '模型配置已保存' }
  })

  // 删除模型
  ipcMain.handle('ai:deleteModel', async (_event, modelId: string) => {
    console.log('[AI] Delete request for modelId:', modelId)

    const existing = get<{ id: number }>('SELECT id FROM models WHERE id = ?', [modelId])

    if (existing) {
      run('DELETE FROM models WHERE id = ?', [modelId])
      saveDatabase()
      console.log('[AI] Model deleted successfully')
      return { success: true, message: '模型已删除' }
    } else {
      return { success: false, message: '模型不存在' }
    }
  })

  // 测试模型连接
  ipcMain.handle('ai:testConnection', async (_event, config: { id?: string; apiKey?: string; provider?: string; modelName?: string; endpoint?: string }) => {
    const { id, apiKey, provider, modelName, endpoint } = config

    // 映射简称
    let modelId = id || ''
    if (id && MODEL_ID_MAP[id]) {
      modelId = MODEL_ID_MAP[id]
    }

    let model = modelId ? aiService.getModelById(modelId) : null

    // 如果没找到预设模型，尝试从数据库查找
    if (!model && modelId) {
      const dbModel = get<{ name: string; provider: string; endpoint?: string; modelName?: string; api_key?: string }>
        ('SELECT * FROM models WHERE id = ?', [modelId])

      if (dbModel) {
        model = {
          id: modelId,
          name: dbModel.name,
          provider: dbModel.provider as ModelConfig['provider'],
          baseURL: dbModel.endpoint,
          model: dbModel.modelName || dbModel.name,
          apiKey: apiKey || dbModel.api_key
        }
      }
    }

    // 如果还没找到，使用传入的参数
    if (!model) {
      model = {
        id: modelId || modelName || 'test',
        name: modelName || id || '测试模型',
        provider: (provider || 'custom') as ModelConfig['provider'],
        baseURL: endpoint || '',
        model: modelName || id || 'test',
        apiKey: apiKey || ''
      }
    }

    const modelEndpoint = model.baseURL || model.endpoint || ''
    if (!modelEndpoint && !model.apiKey) {
      return { success: false, message: '缺少 API 地址或 API Key' }
    }

    const testConfig = {
      ...model,
      baseURL: modelEndpoint,
      apiKey: apiKey || model.apiKey
    }
    console.log('[Test] Testing connection with:', { id: testConfig.id, provider: testConfig.provider, endpoint: testConfig.baseURL })

    try {
      const success = await aiService.testConnection(testConfig)
      return { success, message: success ? '连接成功' : '连接失败' }
    } catch (error) {
      console.error('[Test] Error:', error)
      return { success: false, message: error instanceof Error ? error.message : '连接失败' }
    }
  })

  // Ollama 操作
  ipcMain.handle('ollama:list', async () => {
    try {
      const response = await fetch('http://localhost:11434/api/tags')
      if (!response.ok) throw new Error('Ollama not running')
      const data = await response.json()
      return data.models || []
    } catch {
      return []
    }
  })

  // 外部链接 - 使用 index.ts 中已有的处理器
  // system:getPath 和 system:openExternal 已在 index.ts 中注册

  // 窗口操作
  ipcMain.handle('window:minimize', async (event) => {
    const win = (event as any).sender.getOwnerBrowserWindow()
    win.minimize()
  })

  ipcMain.handle('window:maximize', async (event) => {
    const win = (event as any).sender.getOwnerBrowserWindow()
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  })

  ipcMain.handle('window:close', async (event) => {
    const win = (event as any).sender.getOwnerBrowserWindow()
    win.close()
  })
}


// 启动应用
async function startApp(): Promise<void> {
  // 初始化数据库（使用 sql.js）
  await initDatabase()

  // 启动后端服务
  serverPort = await startServer()

  // 设置 IPC 处理器
  setupIpcHandlers()

  console.log('[App] Seven started, server port:', serverPort)
}


export { setupIpcHandlers, startApp, serverPort }