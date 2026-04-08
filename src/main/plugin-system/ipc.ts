/**
 * 插件 IPC 处理器
 */

import { ipcMain } from 'electron'
import { pluginManager } from './PluginManager'
import * as fs from 'fs'
import * as path from 'path'
import { app, shell } from 'electron'

/**
 * 设置插件相关的 IPC 处理器
 */
export function setupPluginIpcHandlers(): void {
  // 获取插件列表
  ipcMain.handle('plugin:list', async () => {
    try {
      return pluginManager.getPluginList()
    } catch (error) {
      console.error('[IPC] plugin:list error:', error)
      return { plugins: [], total: 0 }
    }
  })

  // 获取单个插件信息
  ipcMain.handle('plugin:get', async (_event, pluginId: string) => {
    try {
      return pluginManager.getPlugin(pluginId)
    } catch (error) {
      console.error('[IPC] plugin:get error:', error)
      return null
    }
  })

  // 启用插件
  ipcMain.handle('plugin:enable', async (_event, pluginId: string) => {
    try {
      await pluginManager.enablePlugin(pluginId)
      return { success: true }
    } catch (error) {
      console.error('[IPC] plugin:enable error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // 禁用插件
  ipcMain.handle('plugin:disable', async (_event, pluginId: string) => {
    try {
      await pluginManager.disablePlugin(pluginId)
      return { success: true }
    } catch (error) {
      console.error('[IPC] plugin:disable error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // 卸载插件
  ipcMain.handle('plugin:uninstall', async (_event, pluginId: string) => {
    try {
      const result = await pluginManager.uninstallPlugin(pluginId)
      return { success: result }
    } catch (error) {
      console.error('[IPC] plugin:uninstall error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // 安装插件（从文件路径）
  ipcMain.handle('plugin:install', async (_event, zipPath: string) => {
    try {
      const result = await pluginManager.installPlugin(zipPath)
      return { success: result }
    } catch (error) {
      console.error('[IPC] plugin:install error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // 从市场下载并安装插件
  ipcMain.handle('plugin:download', async (_event, pluginId: string) => {
    try {
      console.log('[IPC] plugin:download 开始, pluginId:', pluginId)
      const result = await pluginManager.downloadAndInstall(pluginId)
      console.log('[IPC] plugin:download 结果:', result)
      return { success: result }
    } catch (error) {
      console.error('[IPC] plugin:download error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // 获取插件市场列表
  ipcMain.handle('plugin:getMarket', async () => {
    try {
      console.log('[IPC] plugin:getMarket 正在获取...')
      const plugins = await pluginManager.getMarketPlugins()
      console.log('[IPC] plugin:getMarket 返回:', plugins.length, '个')
      return { success: true, plugins }
    } catch (error) {
      console.error('[IPC] plugin:getMarket error:', error)
      return { success: false, plugins: [], error: (error as Error).message }
    }
  })

  // 搜索插件市场
  ipcMain.handle('plugin:search', async (_event, query: string) => {
    try {
      const plugins = await pluginManager.searchMarketPlugins(query)
      return { success: true, plugins }
    } catch (error) {
      console.error('[IPC] plugin:search error:', error)
      return { success: false, plugins: [], error: (error as Error).message }
    }
  })

  // 更新插件设置
  ipcMain.handle('plugin:updateSettings', async (_event, pluginId: string, settings: Record<string, any>) => {
    try {
      await pluginManager.updatePluginSettings(pluginId, settings)
      return { success: true }
    } catch (error) {
      console.error('[IPC] plugin:updateSettings error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // 获取插件设置
  ipcMain.handle('plugin:getSettings', async (_event, pluginId: string) => {
    try {
      const plugin = pluginManager.getPlugin(pluginId)
      return plugin?.manifest.settings || []
    } catch (error) {
      console.error('[IPC] plugin:getSettings error:', error)
      return []
    }
  })

  // 获取插件工具列表
  ipcMain.handle('plugin:getTools', async () => {
    try {
      const tools = pluginManager.getPluginTools()
      return tools.map(tool => ({
        type: 'function',
        function: {
          name: `plugin_${tool.id.replace(':', '_')}`,
          description: tool.description,
          parameters: {
            type: 'object',
            properties: {
              args: { type: 'string', description: 'JSON 格式的参数' }
            },
            required: ['args']
          }
        }
      }))
    } catch (error) {
      console.error('[IPC] plugin:getTools error:', error)
      return []
    }
  })

  // 执行插件工具
  ipcMain.handle('plugin:executeTool', async (_event, toolId: string, args: string) => {
    try {
      const tools = pluginManager.getPluginTools()
      const tool = tools.find(t => `${t.id.replace(':', '_')}` === toolId.replace('plugin_', ''))

      if (!tool) {
        return { success: false, output: '', error: '工具不存在' }
      }

      let parsedArgs = {}
      try {
        parsedArgs = JSON.parse(args)
      } catch {
        parsedArgs = { args }
      }

      const result = await tool.execute(parsedArgs)
      return { success: true, output: typeof result === 'string' ? result : JSON.stringify(result) }
    } catch (error) {
      console.error('[IPC] plugin:executeTool error:', error)
      return { success: false, output: '', error: (error as Error).message }
    }
  })

  // 打开插件目录
  ipcMain.handle('plugin:openPluginsFolder', async () => {
    try {
      // 开发环境用项目根目录，打包用用户数据目录
      let pluginsDir: string;
      if (app.isPackaged) {
        pluginsDir = path.join(app.getPath('userData'), 'plugins');
      } else {
        // 开发环境：从 src/main/plugin-system 回到项目根目录
        pluginsDir = path.join(__dirname, '..', '..', '..', 'plugins');
      }

      // 确保目录存在
      if (!fs.existsSync(pluginsDir)) {
        fs.mkdirSync(pluginsDir, { recursive: true })
      }

      // 使用系统命令打开文件夹
      
      shell.openPath(pluginsDir)
      return { success: true }
    } catch (error) {
      console.error('[IPC] plugin:openPluginsFolder error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  console.log('[IPC] 插件处理器已注册');
  console.log('[IPC] 插件目录路径将在运行时确定')
}