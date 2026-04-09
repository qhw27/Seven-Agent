import { SessionRepository, SessionRow } from '../database/repositories/session.repository'
import { MessageRepository, MessageRow } from '../database/repositories/message.repository'
import { SessionValidator } from '../validators/session.validator'
import { SessionTransformer, SessionDTO, SessionListDTO, MessageDTO, SessionEntity, MessageEntity } from '../transformers/session.transformer'
import { getDb } from '../database'

/**
 * 会话业务逻辑层
 * 负责处理会话相关的业务逻辑、数据验证和事务编排
 */
export class SessionService {
  /**
   * 创建会话
   */
  public static createSession(data: any): SessionDTO {
    // 验证数据
    const validation = SessionValidator.validateSessionData(data)
    if (!validation.valid) {
      throw new Error(validation.error)
    }

    // 准备会话数据
    const now = new Date().toISOString()
    const sessionRow: SessionRow = {
      id: data.id,
      title: data.title,
      model: data.model,
      thinking_level: data.thinkingLevel || 'medium',
      created_at: now,
      last_modified: now,
      message_count: 0
    }

    // 插入数据库
    SessionRepository.insert(sessionRow)

    // 转换并返回
    const entity = SessionTransformer.toSessionEntity(sessionRow)
    return SessionTransformer.toSessionDTO(entity)
  }

  /**
   * 获取会话详情（包含消息列表）
   */
  public static getSession(id: string): SessionDTO | null {
    const sessionRow = SessionRepository.findById(id)
    if (!sessionRow) {
      return null
    }

    const messageRows = MessageRepository.findBySessionId(id)

    const sessionEntity = SessionTransformer.toSessionEntity(sessionRow)
    const messageEntities = messageRows.map(row => SessionTransformer.toMessageEntity(row))

    return SessionTransformer.toSessionDTO(sessionEntity, messageEntities)
  }

  /**
   * 获取会话列表（分页）
   */
  public static getSessionList(page: number = 0, pageSize: number = 100): SessionListDTO {
    const validation = SessionValidator.validatePagination(page, pageSize)
    if (!validation.valid) {
      throw new Error(validation.error)
    }

    const offset = page * pageSize
    const sessionRows = SessionRepository.findAll(pageSize, offset)
    const total = SessionRepository.count()

    const entities = sessionRows.map(row => SessionTransformer.toSessionEntity(row))

    return SessionTransformer.toSessionListDTO(entities, total, page, pageSize)
  }

  /**
   * 搜索会话
   */
  public static searchSessions(keyword?: string): SessionDTO[] {
    const validation = SessionValidator.validateSearchKeyword(keyword)
    if (!validation.valid) {
      throw new Error(validation.error)
    }

    let sessionRows: SessionRow[]
    if (!keyword || keyword.trim() === '') {
      sessionRows = SessionRepository.findAll(100, 0)
    } else {
      sessionRows = SessionRepository.searchByTitle(keyword.trim())
    }

    return sessionRows.map(row => {
      const entity = SessionTransformer.toSessionEntity(row)
      return SessionTransformer.toSessionDTO(entity)
    })
  }

  /**
   * 更新会话标题
   */
  public static updateSessionTitle(sessionId: string, newTitle: string): SessionDTO {
    const validation = SessionValidator.validateTitleUpdate(sessionId, newTitle)
    if (!validation.valid) {
      throw new Error(validation.error)
    }

    if (!SessionRepository.exists(sessionId)) {
      throw new Error('会话不存在')
    }

    SessionRepository.updateTitle(sessionId, newTitle.trim())

    const sessionRow = SessionRepository.findById(sessionId)
    if (!sessionRow) {
      throw new Error('获取更新后的会话失败')
    }

    const entity = SessionTransformer.toSessionEntity(sessionRow)
    return SessionTransformer.toSessionDTO(entity)
  }

  /**
   * 删除会话
   */
  public static deleteSession(sessionId: string): void {
    const validation = SessionValidator.validateDelete(sessionId, 'session')
    if (!validation.valid) {
      throw new Error(validation.error)
    }

    const dbConn = DatabaseConnection.getInstance()
    dbConn.transaction(() => {
      MessageRepository.deleteBySessionId(sessionId)
      SessionRepository.delete(sessionId)
    })
  }

  /**
   * 添加消息到会话
   */
  public static addMessage(sessionId: string, messageData: any): MessageDTO {
    if (!SessionRepository.exists(sessionId)) {
      throw new Error('会话不存在')
    }

    const validation = SessionValidator.validateMessageData({
      ...messageData,
      session_id: sessionId
    })
    if (!validation.valid) {
      throw new Error(validation.error)
    }

    const messageRow: MessageRow = {
      id: messageData.id,
      session_id: sessionId,
      role: messageData.role,
      content: messageData.content || null,
      created_at: messageData.createdAt || new Date().toISOString(),
      metadata: messageData.metadata ? JSON.stringify(messageData.metadata) : null
    }

    MessageRepository.insert(messageRow)

    const messageCount = MessageRepository.countUserMessagesBySessionId(sessionId)
    SessionRepository.updateMessageCount(sessionId, messageCount)

    const entity = SessionTransformer.toMessageEntity(messageRow)
    return SessionTransformer.toMessageDTO(entity)
  }

  /**
   * 删除消息
   */
  public static deleteMessage(messageId: string): void {
    const validation = SessionValidator.validateDelete(messageId, 'message')
    if (!validation.valid) {
      throw new Error(validation.error)
    }

    const sessionId = MessageRepository.getSessionId(messageId)
    if (!sessionId) {
      throw new Error('消息不存在')
    }

    MessageRepository.delete(messageId)

    const messageCount = MessageRepository.countUserMessagesBySessionId(sessionId)
    SessionRepository.updateMessageCount(sessionId, messageCount)
  }

  /**
   * 获取会话元数据
   */
  public static getSessionMetadata(sessionId: string): SessionDTO | null {
    const sessionRow = SessionRepository.findById(sessionId)
    if (!sessionRow) {
      return null
    }

    const entity = SessionTransformer.toSessionEntity(sessionRow)
    return SessionTransformer.toSessionDTO(entity)
  }

  /**
   * 批量保存会话（用于数据迁移）
   */
  public static saveSessionBatch(sessions: any[]): void {
    const dbConn = DatabaseConnection.getInstance()

    dbConn.transaction(() => {
      for (const session of sessions) {
        const userMessageCount = session.messages?.filter((msg: any) => msg.role === 'user').length || 0
        const sessionRow: SessionRow = {
          id: session.id,
          title: session.title,
          model: session.model,
          thinking_level: session.thinkingLevel || 'medium',
          created_at: session.createdAt,
          last_modified: session.lastModified,
          message_count: userMessageCount
        }

        try {
          SessionRepository.insert(sessionRow)
        } catch (error) {
          console.error(`[SessionService] 插入会话失败: ${session.id}`, error)
        }

        if (session.messages && session.messages.length > 0) {
          const messageRows: MessageRow[] = session.messages.map((msg: any) => ({
            id: msg.id,
            session_id: session.id,
            role: msg.role,
            content: msg.content || null,
            created_at: msg.createdAt || new Date().toISOString(),
            metadata: msg.metadata ? JSON.stringify(msg.metadata) : null
          }))

          try {
            MessageRepository.insertBatch(messageRows)
          } catch (error) {
            console.error(`[SessionService] 插入消息失败: ${session.id}`, error)
          }
        }
      }
    })
  }
}