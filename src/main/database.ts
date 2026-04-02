import { app } from 'electron'
import { join } from 'path'
import initSqlJs, { Database } from 'sql.js'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

// 数据库路径
let dbPath: string
let db: Database | null = null

// 初始化数据库
async function initDatabase(): Promise<Database> {
  if (db) return db

  dbPath = join(app.getPath('userData'), 'seven.db')

  const SQL = await initSqlJs()

  // 尝试加载已存在的数据库
  try {
    const fs = await import('fs')
    if (fs.existsSync(dbPath)) {
      const fileBuffer = fs.readFileSync(dbPath)
      db = new SQL.Database(fileBuffer)
      console.log('[Database] Loaded existing database from:', dbPath)
    } else {
      db = new SQL.Database()
      console.log('[Database] Created new database')
    }
  } catch {
    db = new SQL.Database()
    console.log('[Database] Created new database (fallback)')
  }

  // 创建表
  db.run(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      model TEXT DEFAULT 'qwen',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      model TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  // 检查 models 表是否存在，如果存在则检查列
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='models'")
  if (tables.length === 0) {
    // 创建 models 表 - 使用 TEXT 作为 id 以支持字符串 ID
    db.run(`
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
    saveDatabase() // 保存新建的表
  } else {
    // 检查 id 列类型，如果是 INTEGER 则需要重建表
    const columns = db.exec("PRAGMA table_info(models)")
    const columnNames = columns[0]?.values?.map((v: any) => v[1]) || []
    const idColumnType = columns[0]?.values?.find((v: any) => v[1] === 'id')?.[2]

    if (idColumnType === 'INTEGER') {
      // 需要重建表，因为 SQLite 不支持 ALTER TABLE 修改 PRIMARY KEY
      db.run("ALTER TABLE models RENAME TO models_old")
      db.run(`
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
      // 复制旧数据
      db.run(`
        INSERT INTO models (id, name, provider, api_key, endpoint, modelName, enabled, created_at)
        SELECT CAST(id AS TEXT), name, provider, api_key, endpoint, modelName, enabled, created_at FROM models_old
      `)
      db.run("DROP TABLE models_old")
      saveDatabase()
    } else {
      // 检查是否需要添加 modelName 列
      if (!columnNames.includes('modelName')) {
        db.run("ALTER TABLE models ADD COLUMN modelName TEXT")
        saveDatabase() // 保存列添加
      }
      if (!columnNames.includes('enabled')) {
        db.run("ALTER TABLE models ADD COLUMN enabled INTEGER DEFAULT 1")
        saveDatabase() // 保存列添加
      }
    }
  }

  // 立即保存数据库
  saveDatabase()

  console.log('[Database] Initialized at:', dbPath)
  return db
}

// 保存数据库到文件
function saveDatabase(): void {
  if (!db) return
  try {
    const data = db.export()
    const buffer = Buffer.from(data)
    const fs = require('fs')
    const dir = require('path').dirname(dbPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(dbPath, buffer)
    console.log('[Database] Saved to:', dbPath)
  } catch (error) {
    console.error('[Database] Save error:', error)
  }
}

// 获取数据库实例
async function getDb(): Promise<Database> {
  if (!db) {
    await initDatabase()
  }
  return db!
}

// 便捷查询方法
function query<T>(sql: string, params: unknown[] = []): T[] {
  if (!db) throw new Error('Database not initialized')
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const results: T[] = []
  while (stmt.step()) {
    const row = stmt.getAsObject()
    results.push(row as T)
  }
  stmt.free()
  return results
}

function run(sql: string, params: unknown[] = []): { changes: number; lastInsertRowid: number } {
  if (!db) throw new Error('Database not initialized')
  db.run(sql, params)
  saveDatabase()
  const lastId = db.exec("SELECT last_insert_rowid()")
  const lastInsertRowid = lastId[0]?.values?.[0]?.[0] as number || 0
  return { changes: db.getRowsModified(), lastInsertRowid }
}

function get<T>(sql: string, params: unknown[] = []): T | undefined {
  const results = query<T>(sql, params)
  return results[0]
}

function all<T>(sql: string, params: unknown[] = []): T[] {
  return query<T>(sql, params)
}

export { db, initDatabase, getDb, saveDatabase, query, run, get, all }