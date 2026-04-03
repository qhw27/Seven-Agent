import { vi } from 'vitest'

// Mock Electron IPC
vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: vi.fn().mockResolvedValue([
      { id: 'minimax-m2.5', name: 'MiniMax M2.5', provider: 'minimax', configured: true },
      { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', configured: false },
    ]),
  },
}))

// Mock window.require
global.window = global.window || {}
Object.defineProperty(global.window, 'require', {
  value: (module: string) => {
    if (module === 'electron') {
      return {
        ipcRenderer: {
          invoke: vi.fn().mockResolvedValue([
            { id: 'minimax-m2.5', name: 'MiniMax M2.5', provider: 'minimax', configured: true },
            { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', configured: false },
          ]),
        },
      }
    }
    throw new Error(`Cannot mock ${module}`)
  },
  writable: true,
})