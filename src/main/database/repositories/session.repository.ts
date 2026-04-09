import { getDb } from '../../database'

export interface SessionRow {
  id: string
  title: string
  model: string
  thinking_level: string
  created_at: string
  last_modified: string
  message_count: number
}

/**
 * 会话仓库 - 负责会话数据的数据库操作
 */
export class SessionRepository {
  private static db = () => getDb()

  /**
   * 插入会话
   */
  public static insert(row: SessionRow): void {
    const stmt = this.db().prepare(`
      INSERT INTO sessions (id, title, model, thinking_level, created_at, last_modified, message_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(row.id, row.title, row.model, row.thinking_level, row.created_at, row.last_modified, row.message_count)
  }

  /**
   * 根据 ID 查询
   */
  public static findById(id: string): SessionRow | null {
    return this.db().prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | null
  }

  /**
   * 查询所有（分页）
   */
  public static findAll(limit: number, offset: number): SessionRow[] {
    return this.db().prepare('SELECT * FROM sessions ORDER BY last_modified DESC LIMIT ? OFFSET ?').all(limit, offset) as SessionRow[]
  }

  /**
   * 统计总数
   */
  public static count(): number {
    const row = this.db().prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number }
    return row.count
  }

  /**
   * 搜索标题
   */
  public static searchByTitle(keyword: string): SessionRow[] {
    return this.db().prepare('SELECT * FROM sessions WHERE title LIKE ? ORDER BY last_modified DESC').all(`%${keyword}%`) as SessionRow[]
  }

  /**
   * 更新标题
   */
  public static updateTitle(id: string, title: string): void {
    this.db().prepare('UPDATE sessions SET title = ?, last_modified = ? WHERE id = ?').run(title, new Date().toISOString(), id)
  }

  /**
   * 更新消息数量
   */
  public static updateMessageCount(id: string, count: number): void {
    this.db().prepare('UPDATE sessions SET message_count = ?, last_modified = ? WHERE id = ?').run(count, new Date().toISOString(), id)
  }

  /**
   * 检查是否存在
   */
  public static exists(id: string): boolean {
    const row = this.db().prepare('SELECT 1 FROM sessions WHERE id = ?').get(id)
    return !!row
  }

  /**
   * 删除
   */
  public static delete(id: string): void {
    this.db().prepare('DELETE FROM sessions WHERE id = ?').run(id)
  }
}