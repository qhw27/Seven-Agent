/**
 * 会话数据类型定义
 */
export interface SessionEntity {
  id: string
  title: string
  model: string
  thinkingLevel: string
  createdAt: string
  lastModified: string
  messageCount: number
}

export interface MessageEntity {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  content: string | null
  createdAt: string
  metadata: Record<string, any> | null
}

export interface SessionDTO {
  id: string
  title: string
  model: string
  thinkingLevel: string
  createdAt: string
  lastModified: string
  messageCount: number
  messages?: MessageDTO[]
}

export interface SessionListDTO {
  sessions: SessionDTO[]
  total: number
  page: number
  pageSize: number
}

export interface MessageDTO {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  content: string | null
  createdAt: string
  metadata?: Record<string, any>
}

/**
 * 会话数据转换器 - 负责数据库行与实体/DTO 之间的转换
 */
export class SessionTransformer {
  /**
   * 数据库行转换为会话实体
   */
  public static toSessionEntity(row: any): SessionEntity {
    return {
      id: row.id,
      title: row.title,
      model: row.model,
      thinkingLevel: row.thinking_level || 'medium',
      createdAt: row.created_at,
      lastModified: row.last_modified,
      messageCount: row.message_count || 0
    }
  }

  /**
   * 数据库行转换为消息实体
   */
  public static toMessageEntity(row: any): MessageEntity {
    return {
      id: row.id,
      sessionId: row.session_id,
      role: row.role as 'user' | 'assistant' | 'system',
      content: row.content,
      createdAt: row.created_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : null
    }
  }

  /**
   * 会话实体转换为 DTO
   */
  public static toSessionDTO(entity: SessionEntity, messages?: MessageEntity[]): SessionDTO {
    const dto: SessionDTO = {
      id: entity.id,
      title: entity.title,
      model: entity.model,
      thinkingLevel: entity.thinkingLevel,
      createdAt: entity.createdAt,
      lastModified: entity.lastModified,
      messageCount: entity.messageCount
    }

    if (messages) {
      dto.messages = messages.map(msg => this.toMessageDTO(msg))
    }

    return dto
  }

  /**
   * 消息实体转换为 DTO
   */
  public static toMessageDTO(entity: MessageEntity): MessageDTO {
    return {
      id: entity.id,
      sessionId: entity.sessionId,
      role: entity.role,
      content: entity.content,
      createdAt: entity.createdAt,
      metadata: entity.metadata || undefined
    }
  }

  /**
   * 会话列表实体转换为 DTO
   */
  public static toSessionListDTO(entities: SessionEntity[], total: number, page: number, pageSize: number): SessionListDTO {
    return {
      sessions: entities.map(entity => this.toSessionDTO(entity)),
      total,
      page,
      pageSize
    }
  }
}