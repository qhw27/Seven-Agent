/**
 * 插件系统类型定义
 */

// 插件清单
export interface PluginManifest {
  id: string
  name: string
  version: string
  description?: string
  author?: string
  homepage?: string
  main?: string         // 入口文件
  preload?: string      // 预加载脚本
  renderer?: string     // 渲染进程入口
  dependencies?: string[]
  permissions?: string[]
  settings?: PluginSetting[]
}

// 插件设置项
export interface PluginSetting {
  key: string
  label: string
  type: 'text' | 'number' | 'boolean' | 'select' | 'password'
  default?: any
  options?: { label: string; value: any }[]
  description?: string
}

// 插件实例
export interface PluginInstance {
  id: string
  name: string
  version: string
  description?: string
  author?: string
  enabled: boolean
  loaded: boolean
  manifest: PluginManifest
  module?: NodeModule
  settings?: Record<string, any>
  permissions: string[]
}

// 插件生命周期钩子
export interface PluginLifecycle {
  onLoad?: (plugin: PluginInstance) => Promise<void> | void
  onEnable?: (plugin: PluginInstance) => Promise<void> | void
  onDisable?: (plugin: PluginInstance) => Promise<void> | void
  onUnload?: (plugin: PluginInstance) => Promise<void> | void
}

// 插件 API（插件可以使用的 API）
export interface PluginAPI {
  // 事件系统
  on(event: string, callback: (...args: any[]) => void): void
  off(event: string, callback: (...args: any[]) => void): void
  emit(event: string, ...args: any[]): void

  // 日志
  log(...args: any[]): void
  error(...args: any[]): void
  warn(...args: any[]): void

  // 配置
  getSetting(key: string): any
  setSetting(key: string, value: any): void
  saveSettings(): Promise<void>

  // IPC
  sendToMain(channel: string, ...args: any[]): Promise<any>
  sendToRenderer(channel: string, ...args: any[]): void
  registerMainHandler(channel: string, handler: Function): void

  // 工具系统
  registerTool(tool: PluginTool): void
  unregisterTool(toolId: string): void

  // 数据库
  dbQuery(sql: string, params?: any[]): Promise<any>
  dbRun(sql: string, params?: any[]): Promise<any>
}

// 插件可注册的工具
export interface PluginTool {
  id: string
  name: string
  description: string
  execute: (args: any) => Promise<any>
}

// 插件状态
export type PluginStatus = 'loaded' | 'enabled' | 'disabled' | 'error'

// 插件错误
export class PluginError extends Error {
  constructor(
    message: string,
    public pluginId: string,
    public code?: string
  ) {
    super(message)
    this.name = 'PluginError'
  }
}

// 插件列表响应
export interface PluginListResponse {
  plugins: PluginInstance[]
  total: number
}

// 插件市场项
export interface PluginMarketItem {
  id: string
  name: string
  version: string
  description?: string
  author?: string
  homepage?: string
  downloads?: number
  stars?: number
  tags?: string[]
  categories?: string[]
}

// 插件市场响应
export interface PluginMarketResponse {
  plugins: PluginMarketItem[]
  total: number
}

