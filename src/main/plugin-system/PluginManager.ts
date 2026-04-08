/**
 * 插件管理器
 * 负责插件的加载、卸载、启用/禁用
 */

import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import * as os from 'os'
import { spawn } from 'child_process'
import { app } from 'electron'
import {
  type PluginManifest,
  type PluginInstance,
  type PluginLifecycle,
  type PluginAPI,
  type PluginTool,
  type PluginListResponse,
  PluginError
} from './types'

// 开发环境标志
const isDev = process.env.NODE_ENV === 'development'

// 插件市场 API
const PLUGIN_MARKET_API = 'https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com'

// 超时配置
const DOWNLOAD_TIMEOUT = 300000
const HTTP_REQUEST_TIMEOUT = 120000

function devLog(...args: any[]): void {
  if (isDev) {
    console.log('[PluginManager]', ...args)
  }
}

function devError(...args: any[]): void {
  if (isDev) {
    console.error('[PluginManager]', ...args)
  }
}

/**
 * 使用 Node.js https 请求获取 URL 内容
 */
function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = ''
      res.on('data', (chunk) => data += chunk)
      res.on('end', () => resolve(data))
    })
    req.on('error', (err) => {
      devError('[PluginManager] fetchUrl 错误:', err.message)
      reject(err)
    })
    req.setTimeout(HTTP_REQUEST_TIMEOUT, () => {
      req.destroy()
      reject(new Error(`Request timeout after ${HTTP_REQUEST_TIMEOUT}ms`))
    })
  })
}

/**
 * 获取插件目录
 */
function getPluginsDir(): string {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'plugins')
  }
  return path.join(__dirname, '..', '..', 'plugins')
}

/**
 * 获取插件数据目录
 */
function getPluginDataDir(pluginId: string): string {
  const dataDir = path.join(app.getPath('userData'), 'plugin-data', pluginId)
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  return dataDir
}

/**
 * 插件管理器类
 */
export class PluginManager {
  private plugins: Map<string, PluginInstance> = new Map()
  private pluginLifecycle: Map<string, PluginLifecycle> = new Map()
  private pluginAPIs: Map<string, PluginAPI> = new Map()
  private tools: Map<string, PluginTool> = new Map()
  private settings: Map<string, Record<string, any>> = new Map()
  private events: Map<string, Set<Function>> = new Map()

  /**
   * 初始化插件管理器
   */
  async init(): Promise<void> {
    const pluginsDir = getPluginsDir()
    devLog('初始化插件系统, 目录:', pluginsDir)

    // 确保插件目录存在
    if (!fs.existsSync(pluginsDir)) {
      fs.mkdirSync(pluginsDir, { recursive: true })
      devLog('创建插件目录:', pluginsDir)
      return
    }

    // 加载所有插件
    await this.loadAllPlugins()

    // 启用所有插件
    await this.enableAllPlugins()

    devLog(`插件系统初始化完成, 已加载 ${this.plugins.size} 个插件`)
  }

  /**
   * 加载所有插件
   */
  async loadAllPlugins(): Promise<void> {
    const pluginsDir = getPluginsDir()
    if (!fs.existsSync(pluginsDir)) return

    const entries = fs.readdirSync(pluginsDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const pluginPath = path.join(pluginsDir, entry.name)
      try {
        await this.loadPlugin(entry.name, pluginPath)
      } catch (error) {
        devError(`加载插件失败: ${entry.name}`, error)
      }
    }
  }

  /**
   * 加载单个插件
   */
  async loadPlugin(pluginId: string, pluginPath: string): Promise<PluginInstance> {
    // 检查是否已加载
    if (this.plugins.has(pluginId)) {
      devLog(`插件已加载: ${pluginId}`)
      return this.plugins.get(pluginId)!
    }

    const manifestPath = path.join(pluginPath, 'manifest.json')
    if (!fs.existsSync(manifestPath)) {
      throw new PluginError(`插件清单不存在: ${manifestPath}`, pluginId, 'MANIFEST_NOT_FOUND')
    }

    // 读取并解析清单
    const manifestContent = fs.readFileSync(manifestPath, 'utf-8')
    const manifest: PluginManifest = JSON.parse(manifestContent)

    // 验证必要字段
    if (!manifest.id || !manifest.name || !manifest.version) {
      throw new PluginError('插件清单缺少必要字段', pluginId, 'INVALID_MANIFEST')
    }

    // 验证 ID 匹配
    if (manifest.id !== pluginId) {
      throw new PluginError(`插件 ID 不匹配: ${manifest.id} != ${pluginId}`, pluginId, 'ID_MISMATCH')
    }

    // 创建插件实例
    const plugin: PluginInstance = {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      author: manifest.author,
      enabled: false,
      loaded: false,
      manifest,
      permissions: manifest.permissions || []
    }

    // 加载设置
    await this.loadPluginSettings(pluginId)

    // 如果有主入口文件，尝试加载
    if (manifest.main) {
      const mainPath = path.join(pluginPath, manifest.main)
      if (fs.existsSync(mainPath)) {
        try {
          // 动态加载模块（需要先设置 module path）
          const module = require(mainPath)
          plugin.module = module

          // 获取生命周期钩子
          if (module.onLoad) {
            this.pluginLifecycle.set(pluginId, {
              onLoad: module.onLoad,
              onEnable: module.onEnable,
              onDisable: module.onDisable,
              onUnload: module.onUnload
            })
          }
        } catch (error) {
          devError(`加载插件模块失败: ${pluginId}`, error)
        }
      }
    }

    // 注册插件 API
    this.pluginAPIs.set(pluginId, this.createPluginAPI(plugin))

    // 注册工具
    if (manifest.main) {
      const pluginPath2 = path.join(getPluginsDir(), pluginId)
      const mainPath = path.join(pluginPath2, manifest.main)
      try {
        const module = require(mainPath)
        if (module.tools) {
          for (const tool of module.tools) {
            this.registerTool(pluginId, tool)
          }
        }
      } catch (error) {
        devError(`注册插件工具失败: ${pluginId}`, error)
      }
    }

    this.plugins.set(pluginId, plugin)
    devLog(`插件加载成功: ${pluginId} v${plugin.version}`)

    return plugin
  }

  /**
   * 创建插件 API
   */
  private createPluginAPI(plugin: PluginInstance): PluginAPI {
    const pluginId = plugin.id

    return {
      // 事件系统
      on: (event: string, callback: Function) => {
        const key = `${pluginId}:${event}`
        if (!this.events.has(key)) {
          this.events.set(key, new Set())
        }
        this.events.get(key)!.add(callback)
      },
      off: (event: string, callback: Function) => {
        const key = `${pluginId}:${event}`
        this.events.get(key)?.delete(callback)
      },
      emit: (event: string, ...args: any[]) => {
        const key = `${pluginId}:${event}`
        this.events.get(key)?.forEach(cb => {
          try {
            cb(...args)
          } catch (error) {
            devError(`插件事件回调错误: ${pluginId}.${event}`, error)
          }
        })
      },

      // 日志
      log: (...args: any[]) => devLog(`[${pluginId}]`, ...args),
      error: (...args: any[]) => devError(`[${pluginId}]`, ...args),
      warn: (...args: any[]) => console.warn(`[${pluginId}]`, ...args),

      // 配置
      getSetting: (key: string) => {
        const pluginSettings = this.settings.get(pluginId) || {}
        const manifestSetting = plugin.manifest.settings?.find(s => s.key === key)
        return pluginSettings[key] ?? manifestSetting?.default
      },
      setSetting: (key: string, value: any) => {
        const pluginSettings = this.settings.get(pluginId) || {}
        pluginSettings[key] = value
        this.settings.set(pluginId, pluginSettings)
      },
      saveSettings: async () => {
        await this.savePluginSettings(pluginId)
      },

      // IPC（通过主进程）
      sendToMain: async (channel: string, ...args: any[]) => {
        // 这里可以扩展为通过 IPC 发送消息
        console.log(`[${pluginId}] sendToMain: ${channel}`, args)
        return null
      },
      sendToRenderer: (channel: string, ...args: any[]) => {
        // 这里可以扩展为发送到渲染进程
        console.log(`[${pluginId}] sendToRenderer: ${channel}`, args)
      },
      registerMainHandler: (channel: string, handler: Function) => {
        // 这里可以扩展为注册主进程处理器
        console.log(`[${pluginId}] registerMainHandler: ${channel}`)
      },

      // 工具系统
      registerTool: (tool: PluginTool) => {
        this.registerTool(pluginId, tool)
      },
      unregisterTool: (toolId: string) => {
        this.unregisterTool(`${pluginId}:${toolId}`)
      },

      // 数据库
      dbQuery: async (sql: string, params?: any[]) => {
        const { get } = await import('../database')
        return get(sql, params)
      },
      dbRun: async (sql: string, params?: any[]) => {
        const { run, saveDatabase } = await import('../database')
        const result = run(sql, params)
        saveDatabase()
        return result
      }
    }
  }

  /**
   * 注册工具
   */
  registerTool(pluginId: string, tool: PluginTool): void {
    const fullId = `${pluginId}:${tool.id}`
    this.tools.set(fullId, tool)
    devLog(`注册插件工具: ${fullId}`)
  }

  /**
   * 注销工具
   */
  unregisterTool(toolId: string): void {
    if (this.tools.has(toolId)) {
      this.tools.delete(toolId)
      devLog(`注销工具: ${toolId}`)
    }
  }

  /**
   * 获取所有插件工具
   */
  getPluginTools(): PluginTool[] {
    return Array.from(this.tools.values())
  }

  /**
   * 启用所有插件
   */
  async enableAllPlugins(): Promise<void> {
    for (const [pluginId, plugin] of this.plugins) {
      try {
        await this.enablePlugin(pluginId)
      } catch (error) {
        devError(`启用插件失败: ${pluginId}`, error)
      }
    }
  }

  /**
   * 启用单个插件
   */
  async enablePlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId)
    if (!plugin) {
      throw new PluginError('插件不存在', pluginId, 'NOT_FOUND')
    }

    if (plugin.enabled) {
      devLog(`插件已启用: ${pluginId}`)
      return
    }

    // 调用 onEnable 钩子
    const lifecycle = this.pluginLifecycle.get(pluginId)
    if (lifecycle?.onEnable) {
      const api = this.pluginAPIs.get(pluginId)
      if (api) {
        await lifecycle.onEnable(plugin)
      }
    }

    plugin.enabled = true
    devLog(`插件已启用: ${pluginId}`)
  }

  /**
   * 禁用单个插件
   */
  async disablePlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId)
    if (!plugin) {
      throw new PluginError('插件不存在', pluginId, 'NOT_FOUND')
    }

    if (!plugin.enabled) {
      devLog(`插件已禁用: ${pluginId}`)
      return
    }

    // 调用 onDisable 钩子
    const lifecycle = this.pluginLifecycle.get(pluginId)
    if (lifecycle?.onDisable) {
      const api = this.pluginAPIs.get(pluginId)
      if (api) {
        await lifecycle.onDisable(plugin)
      }
    }

    plugin.enabled = false
    devLog(`插件已禁用: ${pluginId}`)
  }

  /**
   * 卸载插件
   */
  async unloadPlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId)
    if (!plugin) {
      throw new PluginError('插件不存在', pluginId, 'NOT_FOUND')
    }

    // 如果已启用，先禁用
    if (plugin.enabled) {
      await this.disablePlugin(pluginId)
    }

    // 调用 onUnload 钩子
    const lifecycle = this.pluginLifecycle.get(pluginId)
    if (lifecycle?.onUnload) {
      const api = this.pluginAPIs.get(pluginId)
      if (api) {
        await lifecycle.onUnload(plugin)
      }
    }

    // 注销该插件的所有工具
    for (const [toolId] of this.tools) {
      if (toolId.startsWith(`${pluginId}:`)) {
        this.tools.delete(toolId)
      }
    }

    // 清理资源
    this.pluginLifecycle.delete(pluginId)
    this.pluginAPIs.delete(pluginId)
    this.settings.delete(pluginId)

    // 清理事件
    for (const [key] of this.events) {
      if (key.startsWith(`${pluginId}:`)) {
        this.events.delete(key)
      }
    }

    this.plugins.delete(pluginId)
    devLog(`插件已卸载: ${pluginId}`)
  }

  /**
   * 获取插件列表
   */
  getPluginList(): PluginListResponse {
    const plugins = Array.from(this.plugins.values()).map(p => ({
      id: p.id,
      name: p.name,
      version: p.version,
      description: p.description,
      author: p.author,
      enabled: p.enabled,
      loaded: p.loaded,
      manifest: p.manifest,
      settings: this.settings.get(p.id) || {},
      permissions: p.permissions
    }))

    return {
      plugins,
      total: plugins.length
    }
  }

  /**
   * 获取单个插件信息
   */
  getPlugin(pluginId: string): PluginInstance | undefined {
    return this.plugins.get(pluginId)
  }

  /**
   * 获取插件 API
   */
  getPluginAPI(pluginId: string): PluginAPI | undefined {
    return this.pluginAPIs.get(pluginId)
  }

  /**
   * 加载插件设置
   */
  private async loadPluginSettings(pluginId: string): Promise<void> {
    const settingsPath = path.join(getPluginDataDir(pluginId), 'settings.json')
    if (fs.existsSync(settingsPath)) {
      try {
        const content = fs.readFileSync(settingsPath, 'utf-8')
        this.settings.set(pluginId, JSON.parse(content))
      } catch (error) {
        devError(`加载插件设置失败: ${pluginId}`, error)
      }
    }
  }

  /**
   * 保存插件设置
   */
  private async savePluginSettings(pluginId: string): Promise<void> {
    const pluginSettings = this.settings.get(pluginId)
    if (pluginSettings) {
      const settingsPath = path.join(getPluginDataDir(pluginId), 'settings.json')
      fs.writeFileSync(settingsPath, JSON.stringify(pluginSettings, null, 2))
    }
  }

  /**
   * 安装插件（从 zip 包）
   */
  async installPlugin(zipPath: string): Promise<boolean> {
    const AdmZip = (await import('adm-zip')).default
    const pluginsDir = getPluginsDir()

    try {
      const zip = new AdmZip(zipPath)
      const entries = zip.getEntries()

      // 查找 manifest.json
      let manifestEntry = entries.find(e => e.entryName.endsWith('manifest.json'))
      if (!manifestEntry) {
        devError('安装失败: 插件包中缺少 manifest.json')
        return false
      }

      const manifest: PluginManifest = JSON.parse(manifestEntry.getData().toString('utf8'))
      const pluginId = manifest.id

      // 检查是否已存在
      const existingPath = path.join(pluginsDir, pluginId)
      if (fs.existsSync(existingPath)) {
        devLog(`插件已存在，先卸载: ${pluginId}`)
        await this.unloadPlugin(pluginId)
      }

      // 解压到临时目录
      const tempDir = path.join(pluginsDir, `.tmp-${pluginId}`)
      zip.extractAllTo(tempDir, true)

      // 移动到目标目录
      const targetDir = path.join(pluginsDir, pluginId)
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true })
      }
      fs.renameSync(tempDir, targetDir)

      // 加载插件
      await this.loadPlugin(pluginId, targetDir)

      // 启用插件
      await this.enablePlugin(pluginId)

      devLog(`插件安装成功: ${pluginId}`)
      return true
    } catch (error) {
      devError('安装插件失败:', error)
      return false
    }
  }

  /**
   * 从市场下载并安装插件
   */
  async downloadAndInstall(pluginId: string): Promise<boolean> {
    const pluginsDir = getPluginsDir()
    const tempZipPath = path.join(os.tmpdir(), `${pluginId}.zip`)

    try {
      devLog(`从市场下载插件: ${pluginId}`)

      // 尝试下载插件 zip
      const downloadUrl = `${PLUGIN_MARKET_API}/plugins/${pluginId}.zip`
      devLog(`下载地址: ${downloadUrl}`)

      // 使用 Node.js fetch 下载
      const response = await fetch(downloadUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'Seven/1.0' }
      })

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`插件 ${pluginId} 在市场上不存在`)
        }
        throw new Error(`下载失败: HTTP ${response.status}`)
      }

      const buffer = await response.arrayBuffer()
      fs.writeFileSync(tempZipPath, Buffer.from(buffer))

      // 检查下载的文件
      if (!fs.existsSync(tempZipPath)) {
        throw new Error('下载的文件不存在')
      }

      const stats = fs.statSync(tempZipPath)
      if (stats.size < 100) {
        const content = fs.readFileSync(tempZipPath, 'utf-8')
        // 检查是否是错误信息
        if (content.includes('Not Found') || content.includes('404')) {
          throw new Error(`插件 ${pluginId} 在市场上不存在`)
        }
        throw new Error('下载的文件太小，可能是错误页面')
      }

      devLog(`插件下载成功，大小: ${stats.size} bytes`)

      // 安装插件
      const result = await this.installPlugin(tempZipPath)

      // 清理临时文件
      try { fs.unlinkSync(tempZipPath) } catch (e) { }

      return result
    } catch (error) {
      devError(`下载安装插件失败: ${pluginId}`, error)
      // 清理临时文件
      try { if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath) } catch (e) { }
      return false
    }
  }

  /**
   * 获取插件市场列表
   */
  async getMarketPlugins(): Promise<PluginManifest[]> {
    try {
      const url = `${PLUGIN_MARKET_API}/skills.json`
      const data = await fetchUrl(url)
      const marketData = JSON.parse(data)
      // 转换为插件格式
      const skills = marketData.skills || []
      return skills.map((skill: any) => ({
        id: skill.slug,
        name: skill.name,
        version: skill.version || '1.0.0',
        description: skill.description,
        author: skill.homepage,
        homepage: skill.homepage,
        permissions: []
      }))
    } catch (error) {
      devError('获取插件市场列表失败:', error)
      return []
    }
  }

  /**
   * 搜索插件市场（本地过滤）
   */
  async searchMarketPlugins(query: string): Promise<PluginManifest[]> {
    try {
      // 先获取所有插件
      const allPlugins = await this.getMarketPlugins()
      const lowerQuery = query.toLowerCase()
      return allPlugins.filter(p =>
        p.name.toLowerCase().includes(lowerQuery) ||
        (p.description && p.description.toLowerCase().includes(lowerQuery))
      )
    } catch (error) {
      devError('搜索插件失败:', error)
      return []
    }
  }

  /**
   * 卸载插件（删除文件）
   */
  async uninstallPlugin(pluginId: string): Promise<boolean> {
    const pluginsDir = getPluginsDir()
    const pluginPath = path.join(pluginsDir, pluginId)

    if (!fs.existsSync(pluginPath)) {
      devError(`插件不存在: ${pluginId}`)
      return false
    }

    try {
      // 先卸载
      await this.unloadPlugin(pluginId)

      // 删除文件
      fs.rmSync(pluginPath, { recursive: true, force: true })

      devLog(`插件卸载成功: ${pluginId}`)
      return true
    } catch (error) {
      devError('卸载插件失败:', error)
      return false
    }
  }

  /**
   * 更新插件设置
   */
  async updatePluginSettings(pluginId: string, newSettings: Record<string, any>): Promise<void> {
    const pluginSettings = this.settings.get(pluginId) || {}
    const merged = { ...pluginSettings, ...newSettings }
    this.settings.set(pluginId, merged)
    await this.savePluginSettings(pluginId)

    // 通知插件设置已更新
    const api = this.pluginAPIs.get(pluginId)
    if (api) {
      api.emit('settings:updated', newSettings)
    }
  }
}

// 导出单例
export const pluginManager = new PluginManager()