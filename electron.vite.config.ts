import { defineConfig, externalizeDepsPlugin, loadEnv } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  // 加载环境变量
  const env = loadEnv(mode, process.cwd(), '')

  // 将环境变量注入到 process.env，过滤掉包含括号的无效键
  const defineEnv: Record<string, string> = {}
  for (const key in env) {
    // 跳过包含括号的 Windows 系统环境变量
    if (key.includes('(') || key.includes(')')) {
      continue
    }
    defineEnv[`process.env.${key}`] = JSON.stringify(env[key])
  }

  // 同时注入到全局 window 对象，方便渲染进程使用
  defineEnv['import.meta.env'] = JSON.stringify({
    ...Object.keys(env).reduce((acc, key) => {
      if (!key.includes('(') && !key.includes(')')) {
        acc[key] = env[key]
      }
      return acc
    }, {} as Record<string, string>),
    MODE: mode,
    DEV: mode === 'development',
    PROD: mode === 'production'
  })

  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      build: {
        rollupOptions: {
          input: {
            index: resolve(__dirname, 'src/main/index.ts')
          }
        }
      },
      // 注入环境变量到主进程
      define: defineEnv
    },
    preload: {
      plugins: [externalizeDepsPlugin()],
      build: {
        rollupOptions: {
          input: {
            index: resolve(__dirname, 'src/preload/index.ts')
          }
        }
      }
    },
    renderer: {
      root: resolve(__dirname, 'src/renderer'),
      build: {
        rollupOptions: {
          input: {
            index: resolve(__dirname, 'src/renderer/index.html')
          }
        }
      },
      plugins: [react()],
      // 注入环境变量到渲染进程
      define: defineEnv
    }
  }
})