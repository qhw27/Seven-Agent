import { contextBridge, ipcRenderer } from 'electron'

// Custom APIs for renderer
const api = {
  // 数据库操作
  db: {
    query: (sql: string, params?: unknown[]) => ipcRenderer.invoke('db:query', sql, params),
    run: (sql: string, params?: unknown[]) => ipcRenderer.invoke('db:run', sql, params),
    get: (sql: string, params?: unknown[]) => ipcRenderer.invoke('db:get', sql, params),
    all: (sql: string, params?: unknown[]) => ipcRenderer.invoke('db:all', sql, params)
  },
  // 会话操作
  session: {
    create: (sessionData: any) => ipcRenderer.invoke('db-create-session', sessionData),
    get: (sessionId: string) => ipcRenderer.invoke('db-get-session', sessionId),
    getList: (page?: number, pageSize?: number) => ipcRenderer.invoke('db-get-session-list', page, pageSize),
    search: (keyword?: string) => ipcRenderer.invoke('db-search-sessions', keyword),
    update: (sessionId: string, data: { title?: string }) => ipcRenderer.invoke('db-update-session-title', sessionId, data.title || ''),
    delete: (sessionId: string) => ipcRenderer.invoke('db-delete-session', sessionId),
    getMetadata: (sessionId: string) => ipcRenderer.invoke('db-get-session-metadata', sessionId)
  },
  // 消息操作
  message: {
    add: (sessionId: string, messageData: any) => ipcRenderer.invoke('db-add-message', sessionId, messageData),
    delete: (messageId: string) => ipcRenderer.invoke('db-delete-message', messageId)
  },
  // AI 模型操作
  ai: {
    chat: (messages: unknown[], options?: { model?: string; useTools?: boolean; abortSignal?: AbortSignal }) => 
      ipcRenderer.invoke('ai:chat', messages, options),
    abortChat: () => ipcRenderer.invoke('ai:abort'),
    listModels: () => ipcRenderer.invoke('ai:listModels'),
    listAllModels: () => ipcRenderer.invoke('ai:listAllModels'),
    setModelConfig: (config: { id: string; apiKey: string }) => ipcRenderer.invoke('ai:setModelConfig', config),
    deleteModel: (id: string) => ipcRenderer.invoke('ai:deleteModel', id),
    testConnection: (config: { id: string; apiKey: string }) => ipcRenderer.invoke('ai:testConnection', config)
  },
  // 本地模型 (Ollama)
  ollama: {
    list: () => ipcRenderer.invoke('ollama:list')
  },
  // 系统操作
  system: {
    getPath: (name: string) => ipcRenderer.invoke('system:getPath', name),
    openExternal: (url: string) => ipcRenderer.invoke('system:openExternal', url)
  },
  // 窗口操作
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
    onMaximizedChanged: (callback: (event: any, isMaximized: boolean) => void) => {
      ipcRenderer.on('window-maximized-changed', callback)
    },
    offMaximizedChanged: (callback: (event: any, isMaximized: boolean) => void) => {
      ipcRenderer.removeListener('window-maximized-changed', callback)
    }
  },
  // 技能操作
  skill: {
    getLocalSkills: () => ipcRenderer.invoke('skill:getLocalSkills'),
    getSkillHubSkills: (limit?: number) => ipcRenderer.invoke('skill:getSkillHubSkills', limit),
    searchSkills: (query: string) => ipcRenderer.invoke('skill:searchSkills', query),
    downloadSkill: (skillId: string) => ipcRenderer.invoke('skill:downloadSkill', skillId),
    deleteSkill: (skillId: string) => ipcRenderer.invoke('skill:deleteSkill', skillId),
    executeSkill: (skillId: string, query: string) => ipcRenderer.invoke('skill:executeSkill', skillId, query),
    executeSystemCommand: (command: string, timeout?: number) => ipcRenderer.invoke('skill:executeSystemCommand', command, timeout)
  }
}

// 插件 API (与主进程 IPC 通信)
const pluginApi = {
  list: () => ipcRenderer.invoke('plugin:list'),
  getMarket: () => ipcRenderer.invoke('plugin:getMarket'),
  search: (query: string) => ipcRenderer.invoke('plugin:search', query),
  download: (pluginId: string) => ipcRenderer.invoke('plugin:download', pluginId),
  install: (pluginPath: string) => ipcRenderer.invoke('plugin:install', pluginPath),
  uninstall: (pluginId: string) => ipcRenderer.invoke('plugin:uninstall', pluginId),
  enable: (pluginId: string) => ipcRenderer.invoke('plugin:enable', pluginId),
  disable: (pluginId: string) => ipcRenderer.invoke('plugin:disable', pluginId),
  openPluginsFolder: () => ipcRenderer.invoke('plugin:openPluginsFolder')
}

// Agent API (基于 pi-agent-core 架构)
const agentApi = {
  init: (config?: { systemPrompt?: string; thinkingLevel?: string }) =>
    ipcRenderer.invoke('agent:init', config),
  prompt: (input: string) => ipcRenderer.invoke('agent:prompt', input),
  abort: () => ipcRenderer.invoke('agent:abort'),
  reset: () => ipcRenderer.invoke('agent:reset'),
  getMessages: () => ipcRenderer.invoke('agent:getMessages'),
  clearMessages: () => ipcRenderer.invoke('agent:clearMessages'),
  setSystemPrompt: (prompt: string) => ipcRenderer.invoke('agent:setSystemPrompt', prompt),
  reloadTools: () => ipcRenderer.invoke('agent:reloadTools'),
  steer: (message: string) => ipcRenderer.invoke('agent:steer', message),
  followUp: (message: string) => ipcRenderer.invoke('agent:followUp', message)
}

// 统一的 invoke 方法，支持动态 channel
const invoke = (channel: string, ...args: unknown[]) => {
  return ipcRenderer.invoke(channel, ...args)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('electronAPI', { ...api, plugin: pluginApi, agent: agentApi, invoke })
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore
  window.electronAPI = { ...api, plugin: pluginApi, agent: agentApi, invoke }
}