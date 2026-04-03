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
        chat: (messages: { role: string; content: string }[], options?: { model?: string }) => Promise<{ content: string }>
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
        updateTitle: (sessionId: string, newTitle: string) => Promise<any>
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