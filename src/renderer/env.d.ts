export {}

declare global {
  interface Window {
    api: {
      db: {
        query: (sql: string, params?: unknown[]) => Promise<unknown>
        run: (sql: string, params?: unknown[]) => Promise<unknown>
        get: (sql: string, params?: unknown[]) => Promise<unknown>
        all: (sql: string, params?: unknown[]) => Promise<unknown[]>
      }
      ai: {
        chat: (messages: { role: string; content: string }[], options?: { model?: string; useTools?: boolean }) => Promise<{ content: string }>
        listModels: () => Promise<Array<{
          id: string
          name: string
          provider: string
          modelName: string
          endpoint: string
          configured: boolean
          apiKey?: string
        }>>
        listAllModels: () => Promise<unknown[]>
        setModelConfig: (config: { id: string; apiKey: string }) => Promise<{ success: boolean; message: string }>
        deleteModel: (id: string) => Promise<{ success: boolean; message: string }>
        testConnection: (config: { id: string; apiKey: string }) => Promise<{ success: boolean; message: string }>
      }
      ollama: {
        list: () => Promise<unknown[]>
      }
      system: {
        getPath: (name: string) => Promise<string>
        openExternal: (url: string) => Promise<void>
      }
      session: {
        create: (sessionData: any) => Promise<any>
        get: (sessionId: string) => Promise<any>
        getList: (page?: number, pageSize?: number) => Promise<any>
        search: (keyword?: string) => Promise<any[]>
        update: (sessionId: string, data: { title?: string }) => Promise<any>
        delete: (sessionId: string) => Promise<any>
        getMetadata: (sessionId: string) => Promise<any>
      }
      message: {
        add: (sessionId: string, messageData: any) => Promise<any>
        delete: (messageId: string) => Promise<any>
      }
      window: {
        minimize: () => Promise<void>
        maximize: () => Promise<void>
        close: () => Promise<void>
      }
      skill: {
        getLocalSkills: () => Promise<Skill[]>
        getSkillHubSkills: (limit?: number) => Promise<Skill[]>
        searchSkills: (query: string) => Promise<Skill[]>
        downloadSkill: (skillId: string) => Promise<boolean>
        deleteSkill: (skillId: string) => Promise<boolean>
        executeSkill: (skillId: string, query: string) => Promise<SkillResult>
        executeSystemCommand: (command: string, timeout?: number) => Promise<SkillResult>
      }
    }
    electronAPI: {
      db: {
        query: (sql: string, params?: unknown[]) => Promise<unknown>
        run: (sql: string, params?: unknown[]) => Promise<unknown>
        get: (sql: string, params?: unknown[]) => Promise<unknown>
        all: (sql: string, params?: unknown[]) => Promise<unknown[]>
      }
      ai: {
        chat: (messages: { role: string; content: string }[], options?: { model?: string; useTools?: boolean }) => Promise<{ content: string }>
        listModels: () => Promise<Array<{
          id: string
          name: string
          provider: string
          modelName: string
          endpoint: string
          configured: boolean
          apiKey?: string
        }>>
        listAllModels: () => Promise<unknown[]>
        setModelConfig: (config: { id: string; apiKey: string }) => Promise<{ success: boolean; message: string }>
        deleteModel: (id: string) => Promise<{ success: boolean; message: string }>
        testConnection: (config: { id: string; apiKey: string }) => Promise<{ success: boolean; message: string }>
      }
      ollama: {
        list: () => Promise<unknown[]>
      }
      system: {
        getPath: (name: string) => Promise<string>
        openExternal: (url: string) => Promise<void>
      }
      session: {
        create: (sessionData: any) => Promise<any>
        get: (sessionId: string) => Promise<any>
        getList: (page?: number, pageSize?: number) => Promise<any>
        search: (keyword?: string) => Promise<any[]>
        update: (sessionId: string, data: { title?: string }) => Promise<any>
        delete: (sessionId: string) => Promise<any>
        getMetadata: (sessionId: string) => Promise<any>
      }
      message: {
        add: (sessionId: string, messageData: any) => Promise<any>
        delete: (messageId: string) => Promise<any>
      }
      window: {
        minimize: () => Promise<void>
        maximize: () => Promise<void>
        close: () => Promise<void>
      }
      skill: {
        getLocalSkills: () => Promise<Skill[]>
        getSkillHubSkills: (limit?: number) => Promise<Skill[]>
        searchSkills: (query: string) => Promise<Skill[]>
        downloadSkill: (skillId: string) => Promise<boolean>
        deleteSkill: (skillId: string) => Promise<boolean>
        executeSkill: (skillId: string, query: string) => Promise<SkillResult>
        executeSystemCommand: (command: string, timeout?: number) => Promise<SkillResult>
      }
      plugin: {
        list: () => Promise<any>
        getMarket: () => Promise<any>
        search: (query: string) => Promise<any>
        download: (pluginId: string) => Promise<any>
        install: (pluginPath: string) => Promise<any>
        uninstall: (pluginId: string) => Promise<any>
        enable: (pluginId: string) => Promise<any>
        disable: (pluginId: string) => Promise<any>
        openPluginsFolder: () => Promise<any>
      }
      agent: {
        init: (config?: { systemPrompt?: string; thinkingLevel?: string }) => Promise<{ success: boolean; error?: string }>
        prompt: (input: string) => Promise<{ success: boolean; content?: string; error?: string }>
        abort: () => Promise<{ success: boolean }>
        reset: () => Promise<{ success: boolean }>
        getMessages: () => Promise<{ success: boolean; messages?: AgentMessage[]; error?: string }>
        clearMessages: () => Promise<{ success: boolean }>
        setSystemPrompt: (prompt: string) => Promise<{ success: boolean }>
        reloadTools: () => Promise<{ success: boolean; toolCount?: number }>
        steer: (message: string) => Promise<{ success: boolean }>
        followUp: (message: string) => Promise<{ success: boolean }>
      }
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    }
  }
}

interface Skill {
  id: string
  name: string
  description: string
  icon?: string
  version?: string
  author?: string
  tags?: string[]
  downloads?: number
  stars?: number
  score?: number
  categories?: string[]
}

interface SkillResult {
  success: boolean
  output: string
  error?: string
}

interface AgentMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  timestamp: number
  toolCalls?: { id: string; name: string; arguments: string }[]
  toolCallId?: string
  metadata?: Record<string, any>
}
