import { getDb } from '../database'
import type Database from 'better-sqlite3'

/**
 * 数据库迁移管理
 * 负责创建和更新数据库表结构
 */
export class DatabaseMigrations {
  private static CURRENT_VERSION = 3

  /**
   * 执行所有迁移
   */
  public static runMigrations(): void {
    const db = getDb()

    try {
      // 创建版本表（如果不存在）
      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_version (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL
        )
      `)

      // 获取当前版本
      const currentVersion = this.getCurrentVersion(db)

      // 执行增量迁移
      if (currentVersion < 1) {
        this.migrationV1(db)
      }

      if (currentVersion < 2) {
        this.migrationV2(db)
      }

      if (currentVersion < 3) {
        this.migrationV3(db)
      }

      console.log(`[Migration] 数据库迁移完成，当前版本: ${this.CURRENT_VERSION}`)
    } catch (error) {
      console.error('[Migration] 数据库迁移失败:', error)
      throw error
    }
  }

  /**
   * 获取当前数据库版本
   */
  private static getCurrentVersion(db: Database.Database): number {
    const row = db.prepare('SELECT MAX(version) as version FROM schema_version').get() as { version: number | null }
    return row?.version || 0
  }

  /**
   * 记录迁移版本
   */
  private static recordMigration(db: Database.Database, version: number): void {
    db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(version, new Date().toISOString())
  }

  /**
   * 迁移 V1: 创建初始表结构
   */
  private static migrationV1(db: Database.Database): void {
    console.log('[Migration] 执行迁移 V1...')

    // 创建会话表
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        model TEXT NOT NULL,
        thinking_level TEXT DEFAULT 'medium',
        created_at TEXT NOT NULL,
        last_modified TEXT NOT NULL,
        message_count INTEGER DEFAULT 0
      )
    `)

    // 创建消息表
    db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT,
        created_at TEXT NOT NULL,
        metadata TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `)

    // 创建模型配置表
    db.exec(`
      CREATE TABLE IF NOT EXISTS models (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider TEXT NOT NULL,
        api_key TEXT,
        endpoint TEXT,
        modelName TEXT,
        enabled INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
      )
    `)

    // 创建设置表
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `)

    // 创建索引
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_title ON sessions(title);
      CREATE INDEX IF NOT EXISTS idx_sessions_last_modified ON sessions(last_modified);
      CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)
    `)

    // 记录迁移
    this.recordMigration(db, 1)

    console.log('[Migration] 迁移 V1 完成')
  }

  /**
   * 迁移 V2: 更新 message_count 为用户消息数量（对话轮数）
   */
  private static migrationV2(db: Database.Database): void {
    console.log('[Migration] 执行迁移 V2...')

    // 更新所有会话的 message_count
    db.exec(`
      UPDATE sessions
      SET message_count = (
        SELECT COUNT(*)
        FROM messages
        WHERE messages.session_id = sessions.id
        AND messages.role = 'user'
      )
    `)

    // 记录迁移
    this.recordMigration(db, 2)

    console.log('[Migration] 迁移 V2 完成：已更新所有会话的消息计数为对话轮数')
  }

  /**
   * 迁移 V3: 修复 model_name 字段名为 modelName（与代码保持一致）
   */
  private static migrationV3(db: Database.Database): void {
    console.log('[Migration] 执行迁移 V3...')

    // 检查是否存在旧的 model_name 字段
    const tableInfo = db.pragma('table_info(models)') as Array<{ name: string }>
    const hasOldField = tableInfo.some(col => col.name === 'model_name')

    if (hasOldField) {
      // 如果存在旧字段，复制数据到新字段（如果新字段不存在的话）
      const hasNewField = tableInfo.some(col => col.name === 'modelName')
      if (!hasNewField) {
        // 添加新字段
        db.exec('ALTER TABLE models ADD COLUMN modelName TEXT')
      }
      // 复制数据
      db.exec('UPDATE models SET modelName = model_name WHERE modelName IS NULL')
      console.log('[Migration] 已将 model_name 数据迁移到 modelName')
    }

    // 记录迁移
    this.recordMigration(db, 3)

    console.log('[Migration] 迁移 V3 完成：字段名已统一为 modelName')
  }
}