import { app, BrowserWindow, ipcMain, screen, session, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { setupIpcHandlers, startApp } from './ipc'
import * as fs from 'fs'

let mainWindow: BrowserWindow | null = null

// 手动加载 .env 和 .env.development 文件
function loadEnvFile(): void {
  // 先加载 .env，再加载 .env.development（后者会覆盖前者）
  const envFiles = ['.env', '.env.development']

  for (const envFile of envFiles) {
    const envPath = join(__dirname, `../../${envFile}`)
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8')
      envContent.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/)
        if (match) {
          const key = match[1].trim()
          const value = match[2].trim()
          if (key && value && !key.startsWith('#')) {
            process.env[key] = value
          }
        }
      })
      console.log(`[Env] Loaded from ${envFile}`)
    }
  }

  // 打印环境变量（隐藏敏感信息）
  console.log('[Env] ANTHROPIC_AUTH_TOKEN:', process.env.ANTHROPIC_AUTH_TOKEN ? '***' : 'empty')
  console.log('[Env] OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '***' : 'empty')
  console.log('[Env] MINIMAX_API_KEY:', process.env.MINIMAX_API_KEY ? '***' : 'empty')
  console.log('[Env] QWEN_API_KEY:', process.env.QWEN_API_KEY ? '***' : 'empty')
  console.log('[Env] DEEPSEEK_API_KEY:', process.env.DEEPSEEK_API_KEY ? '***' : 'empty')
  console.log('[Env] KIMI_API_KEY:', process.env.KIMI_API_KEY ? '***' : 'empty')
}

loadEnvFile()

function createWindow(): void {
  console.log('Creating main window...')
  console.log('NODE_ENV:', process.env.NODE_ENV)

  // 设置 Content Security Policy
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
          "style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data: https:; " +
          "font-src 'self' data:; " +
          "connect-src 'self' http: https: ws: wss:; " +
          "worker-src 'self' blob:;"
        ]
      }
    })
  })

  // 获取主显示器尺寸
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

  // 设置窗口图标路径
  const iconFileName = process.platform === 'win32' ? 'favicon.ico' : 'favicon.icns'
  const iconPath = join(__dirname, `../../../${iconFileName}`)

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    x: Math.floor((screenWidth - 1200) / 2),
    y: Math.floor((screenHeight - 800) / 2),
    icon: iconPath,
    frame: false, // 隐藏默认标题栏
    titleBarStyle: 'hidden', // macOS
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false // 禁用 webview 标签
    },
    backgroundColor: '#ffffff',
    show: false
  })

  // 监听窗口关闭事件
  mainWindow.on('closed', () => {
    mainWindow = null
    if (process.platform === 'darwin') {
      app.quit()
    }
  })

  console.log('Window created, loading content...')

  const isDev = process.env.NODE_ENV === 'development'
  console.log('isDev:', isDev)

  // 添加错误处理
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[Main] Failed to load:', errorCode, errorDescription)
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Main] Render process gone:', details)
  })

  mainWindow.webContents.on('unresponsive', () => {
    console.warn('[Main] Window became unresponsive')
  })

  mainWindow.webContents.on('responsive', () => {
    console.log('[Main] Window became responsive again')
  })

  // 拦截导航事件
  mainWindow.webContents.on('will-navigate', (event, url) => {
    console.log('[Main] will-navigate:', url)
    if (url.startsWith('file://') && !url.includes('index.html') && !url.includes('/assets/')) {
      console.log('[Main] Blocking navigation to file://:', url)
      event.preventDefault()
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log('[Main] setWindowOpenHandler:', url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    console.log('Loading dev server:', process.env['ELECTRON_RENDERER_URL'])
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    console.log('Window ready to show')
    mainWindow?.show()
  })

  // 监听窗口最大化状态变化
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window-maximized-changed', true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window-maximized-changed', false)
  })
}

// 窗口控制 IPC 处理器
ipcMain.on('window-minimize', () => {
  mainWindow?.minimize()
})

ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})

ipcMain.on('window-close', () => {
  mainWindow?.close()
})

ipcMain.handle('window-is-maximized', () => {
  return mainWindow?.isMaximized() ?? false
})

// 平台信息
ipcMain.handle('get-platform', () => {
  return process.platform
})

// 系统路径
ipcMain.handle('system:getPath', (_event, name: string) => {
  return app.getPath(name as any)
})

// 外部链接
ipcMain.handle('system:openExternal', (_event, url: string) => {
  shell.openExternal(url)
})

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.seven.claw')

  // 启动应用（初始化数据库和后端服务，并设置IPC处理器）
  await startApp()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  console.log('[App] 收到退出信号，正在关闭...')
})