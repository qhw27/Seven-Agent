import { app } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'

// 数据库实例
let db: Database.Database | null = null
let dbPath: string

/**
 * 初始化数据库 (使用 better-sqlite3)
 * better-sqlite3 是同步 API，直接操作文件，无需手动保存
 */
function initDatabase(): Database.Database {
  if (db) return db

  // 数据库文件存储在用户数据目录
  const userDataPath = app.getPath('userData')
  dbPath = join(userDataPath, 'seven.db')

  // 创建数据库连接
  db = new Database(dbPath, {
    verbose: process.env.NODE_ENV === 'development' ? console.log : undefined
  })

  // 启用 WAL 模式优化性能
  db.pragma('journal_mode = WAL')

  // 启用外键约束
  db.pragma('foreign_keys = ON')

  console.log(`[Database] 数据库初始化成功: ${dbPath}`)

  // 创建表
  createTables()

  return db
}

/**
 * 创建数据表
 */
function createTables(): void {
  if (!db) return

  // sessions 表
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      model TEXT DEFAULT 'qwen',
      thinking_level TEXT DEFAULT 'medium',
      created_at TEXT DEFAULT (datetime('now')),
      last_modified TEXT DEFAULT (datetime('now')),
      message_count INTEGER DEFAULT 0
    )
  `)

  // messages 表
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      metadata TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `)

  // settings 表
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  // models 表 - 检查并创建/迁移
  const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='models'").get()

  if (!tableExists) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS models (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider TEXT NOT NULL,
        api_key TEXT,
        endpoint TEXT,
        modelName TEXT,
        enabled INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `)
  } else {
    // 检查并迁移旧表结构
    migrateModelsTable()
  }
}

/**
 * 迁移 models 表（如果需要）
 */
function migrateModelsTable(): void {
  if (!db) return

  const columns = db.pragma('table_info(models)') as Array<{ name: string; type: string }>
  const columnNames = columns.map(c => c.name)
  const idColumn = columns.find(c => c.name === 'id')

  // 如果 id 是 INTEGER 类型，需要重建表
  if (idColumn && idColumn.type === 'INTEGER') {
    db.exec('ALTER TABLE models RENAME TO models_old')
    db.exec(`
      CREATE TABLE models (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider TEXT NOT NULL,
        api_key TEXT,
        endpoint TEXT,
        modelName TEXT,
        enabled INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `)
    db.exec(`
      INSERT INTO models (id, name, provider, api_key, endpoint, modelName, enabled, created_at)
      SELECT CAST(id AS TEXT), name, provider, api_key, endpoint, modelName, enabled, created_at FROM models_old
    `)
    db.exec('DROP TABLE models_old')
  } else {
    // 添加缺失的列
    if (!columnNames.includes('modelName')) {
      db.exec('ALTER TABLE models ADD COLUMN modelName TEXT')
    }
    if (!columnNames.includes('enabled')) {
      db.exec('ALTER TABLE models ADD COLUMN enabled INTEGER DEFAULT 1')
    }
  }
}

/**
 * 关闭数据库连接
 */
function closeDatabase(): void {
  if (db) {
    try {
      db.close()
      db = null
      console.log('[Database] 数据库连接已关闭')
    } catch (error) {
      console.error('[Database] 关闭数据库连接失败:', error)
    }
  }
}

/**
 * 获取数据库实例
 */
function getDb(): Database.Database {
  if (!db) {
    return initDatabase()
  }
  return db
}

/**
 * 执行查询，返回所有结果
 */
function query<T>(sql: string, params: unknown[] = []): T[] {
  const database = getDb()
  const stmt = database.prepare(sql)
  return stmt.all(...params) as T[]
}

/**
 * 执行写入操作，返回影响行数和最后插入ID
 */
function run(sql: string, params: unknown[] = []): { changes: number; lastInsertRowid: number | bigint } {
  const database = getDb()
  const stmt = database.prepare(sql)
  const result = stmt.run(...params)
  return {
    changes: result.changes,
    lastInsertRowid: result.lastInsertRowid
  }
}

/**
 * 执行查询，返回单条结果
 */
function get<T>(sql: string, params: unknown[] = []): T | undefined {
  const database = getDb()
  const stmt = database.prepare(sql)
  return stmt.get(...params) as T | undefined
}

/**
 * 执行查询，返回所有结果（别名）
 */
function all<T>(sql: string, params: unknown[] = []): T[] {
  return query<T>(sql, params)
}

/**
 * 执行事务
 */
function transaction<T>(fn: () => T): T {
  const database = getDb()
  return database.transaction(fn)()
}

// 兼容性导出 - saveDatabase 不再需要，保留空函数以保持 API 兼容
function saveDatabase(): void {
  // better-sqlite3 自动持久化，无需手动保存
}

export {
  db,
  initDatabase,
  closeDatabase,
  getDb,
  saveDatabase,
  query,
  run,
  get,
  all,
  transaction
}