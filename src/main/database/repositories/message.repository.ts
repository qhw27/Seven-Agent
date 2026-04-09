import { getDb } from '../../database'

export interface MessageRow {
  id: string
  session_id: string
  role: string
  content: string | null
  created_at: string
  metadata: string | null
}

/**
 * 消息仓库 - 负责消息数据的数据库操作
 */
export class MessageRepository {
  private static db = () => getDb()

  /**
   * 插入消息
   */
  public static insert(row: MessageRow): void {
    const stmt = this.db().prepare(`
      INSERT INTO messages (id, session_id, role, content, created_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    stmt.run(row.id, row.session_id, row.role, row.content, row.created_at, row.metadata)
  }

  /**
   * 批量插入消息
   */
  public static insertBatch(rows: MessageRow[]): void {
    const stmt = this.db().prepare(`
      INSERT INTO messages (id, session_id, role, content, created_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    const insertMany = this.db().transaction((rows: MessageRow[]) => {
      for (const row of rows) {
        stmt.run(row.id, row.session_id, row.role, row.content, row.created_at, row.metadata)
      }
    })

    insertMany(rows)
  }

  /**
   * 根据会话 ID 查询
   */
  public static findBySessionId(sessionId: string): MessageRow[] {
    return this.db().prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC').all(sessionId) as MessageRow[]
  }

  /**
   * 根据 ID 查询
   */
  public static findById(id: string): MessageRow | null {
    return this.db().prepare('SELECT * FROM messages WHERE id = ?').get(id) as MessageRow | null
  }

  /**
   * 统计用户消息数量（对话轮数）
   */
  public static countUserMessagesBySessionId(sessionId: string): number {
    const row = this.db().prepare('SELECT COUNT(*) as count FROM messages WHERE session_id = ? AND role = ?').get(sessionId, 'user') as { count: number }
    return row.count
  }

  /**
   * 获取消息所属会话 ID
   */
  public static getSessionId(messageId: string): string | null {
    const row = this.db().prepare('SELECT session_id FROM messages WHERE id = ?').get(messageId) as { session_id: string } | null
    return row?.session_id || null
  }

  /**
   * 删除
   */
  public static delete(id: string): void {
    this.db().prepare('DELETE FROM messages WHERE id = ?').run(id)
  }

  /**
   * 根据会话 ID 删除
   */
  public static deleteBySessionId(sessionId: string): void {
    this.db().prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId)
  }
}