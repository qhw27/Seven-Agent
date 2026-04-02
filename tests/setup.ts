import { vi } from 'vitest'

// Mock window.require for Electron
vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: vi.fn(),
  },
}))

// Mock window.require
global.window = {
  ...global.window,
  require: (module: string) => {
    if (module === 'electron') {
      return {
        ipcRenderer: {
          invoke: vi.fn(),
        },
      }
    }
    throw new Error(`Cannot mock ${module}`)
  },
}