import { SessionService } from './session.service'

/**
 * 会话 API 层 - 处理 IPC 通信的数据转换和异常处理
 */
export class SessionAPI {
  /**
   * 创建会话
   */
  public static createSession(sessionData: any): any {
    try {
      return SessionService.createSession(sessionData)
    } catch (error) {
      console.error('[SessionAPI] 创建会话失败:', error)
      throw error
    }
  }

  /**
   * 获取会话详情
   */
  public static getSession(sessionId: string): any {
    try {
      return SessionService.getSession(sessionId)
    } catch (error) {
      console.error('[SessionAPI] 获取会话失败:', error)
      throw error
    }
  }

  /**
   * 获取会话列表
   */
  public static getSessionList(page?: number, pageSize?: number): any {
    try {
      return SessionService.getSessionList(page, pageSize)
    } catch (error) {
      console.error('[SessionAPI] 获取会话列表失败:', error)
      throw error
    }
  }

  /**
   * 搜索会话
   */
  public static searchSessions(keyword?: string): any {
    try {
      return SessionService.searchSessions(keyword)
    } catch (error) {
      console.error('[SessionAPI] 搜索会话失败:', error)
      throw error
    }
  }

  /**
   * 更新会话标题
   */
  public static updateSessionTitle(sessionId: string, newTitle: string): any {
    try {
      return SessionService.updateSessionTitle(sessionId, newTitle)
    } catch (error) {
      console.error('[SessionAPI] 更新会话标题失败:', error)
      throw error
    }
  }

  /**
   * 删除会话
   */
  public static deleteSession(sessionId: string): any {
    try {
      SessionService.deleteSession(sessionId)
      return { success: true }
    } catch (error) {
      console.error('[SessionAPI] 删除会话失败:', error)
      throw error
    }
  }

  /**
   * 获取会话元数据
   */
  public static getSessionMetadata(sessionId: string): any {
    try {
      return SessionService.getSessionMetadata(sessionId)
    } catch (error) {
      console.error('[SessionAPI] 获取会话元数据失败:', error)
      throw error
    }
  }

  /**
   * 添加消息
   */
  public static addMessage(sessionId: string, messageData: any): any {
    try {
      return SessionService.addMessage(sessionId, messageData)
    } catch (error) {
      console.error('[SessionAPI] 添加消息失败:', error)
      throw error
    }
  }

  /**
   * 删除消息
   */
  public static deleteMessage(messageId: string): any {
    try {
      SessionService.deleteMessage(messageId)
      return { success: true }
    } catch (error) {
      console.error('[SessionAPI] 删除消息失败:', error)
      throw error
    }
  }

  /**
   * 批量保存会话
   */
  public static saveSessionBatch(sessions: any[]): any {
    try {
      SessionService.saveSessionBatch(sessions)
      return { success: true }
    } catch (error) {
      console.error('[SessionAPI] 批量保存会话失败:', error)
      throw error
    }
  }
}