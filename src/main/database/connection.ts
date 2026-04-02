import Database from 'better-sqlite3'
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

/**
 * 数据库连接管理类（单例模式）
 * 负责管理 SQLite 数据库连接的生命周期
 */
export class DatabaseConnection {
  private static instance: DatabaseConnection | null = null
  private db: Database.Database | null = null
  private dbPath: string

  private constructor() {
    // 数据库文件存储在用户数据目录
    const userDataPath = app.getPath('userData')
    // 开发环境和生产环境使用不同的数据库文件
    const dbFileName = process.env.NODE_ENV === 'development' ? 'seven-dev.db' : 'seven.db'
    this.dbPath = path.join(userDataPath, dbFileName)
  }

  /**
   * 获取数据库连接单例
   */
  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection()
    }
    return DatabaseConnection.instance
  }

  /**
   * 初始化数据库连接
   */
  public initialize(): void {
    try {
      // 确保用户数据目录存在
      const userDataPath = app.getPath('userData')
      if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true })
      }

      // 创建数据库连接
      this.db = new Database(this.dbPath, {
        verbose: process.env.NODE_ENV === 'development' ? console.log : undefined
      })

      // 启用 WAL 模式优化性能
      this.db.pragma('journal_mode = WAL')

      // 启用外键约束
      this.db.pragma('foreign_keys = ON')

      console.log(`[Database] 数据库初始化成功: ${this.dbPath}`)
    } catch (error) {
      console.error('[Database] 数据库初始化失败:', error)
      throw error
    }
  }

  /**
   * 获取数据库连接
   */
  public getConnection(): Database.Database {
    if (!this.db) {
      throw new Error('[Database] 数据库未初始化，请先调用 initialize()')
    }
    return this.db
  }

  /**
   * 关闭数据库连接
   */
  public close(): void {
    if (this.db) {
      try {
        this.db.close()
        this.db = null
        console.log('[Database] 数据库连接已关闭')
      } catch (error) {
        console.error('[Database] 关闭数据库连接失败:', error)
        throw error
      }
    }
  }

  /**
   * 获取数据库文件路径
   */
  public getDbPath(): string {
    return this.dbPath
  }

  /**
   * 检查数据库是否已初始化
   */
  public isInitialized(): boolean {
    return this.db !== null
  }

  /**
   * 执行事务
   * @param fn 事务函数
   */
  public transaction<T>(fn: () => T): T {
    const db = this.getConnection()
    const transaction = db.transaction(fn)
    return transaction()
  }
}