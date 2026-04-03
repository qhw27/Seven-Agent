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
    chat: (messages: unknown[], options?: { model?: string }) => ipcRenderer.invoke('ai:chat', messages, options),
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

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
}