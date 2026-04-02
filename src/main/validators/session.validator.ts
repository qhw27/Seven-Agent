/**
 * 会话数据验证器
 */
export class SessionValidator {
  /**
   * 验证会话数据
   */
  public static validateSessionData(data: any): { valid: boolean; error?: string } {
    if (!data) {
      return { valid: false, error: '会话数据不能为空' }
    }

    if (!data.id || typeof data.id !== 'string') {
      return { valid: false, error: '会话 ID 不能为空' }
    }

    if (data.id.length > 100) {
      return { valid: false, error: '会话 ID 长度不能超过 100' }
    }

    if (!data.title || typeof data.title !== 'string') {
      return { valid: false, error: '会话标题不能为空' }
    }

    if (data.title.length > 200) {
      return { valid: false, error: '会话标题长度不能超过 200' }
    }

    if (!data.model || typeof data.model !== 'string') {
      return { valid: false, error: '模型不能为空' }
    }

    return { valid: true }
  }

  /**
   * 验证分页参数
   */
  public static validatePagination(page: number, pageSize: number): { valid: boolean; error?: string } {
    if (page < 0) {
      return { valid: false, error: '页码不能为负数' }
    }

    if (pageSize < 1) {
      return { valid: false, error: '每页数量必须大于 0' }
    }

    if (pageSize > 1000) {
      return { valid: false, error: '每页数量不能超过 1000' }
    }

    return { valid: true }
  }

  /**
   * 验证搜索关键词
   */
  public static validateSearchKeyword(keyword?: string): { valid: boolean; error?: string } {
    if (keyword && keyword.length > 200) {
      return { valid: false, error: '搜索关键词长度不能超过 200' }
    }

    return { valid: true }
  }

  /**
   * 验证标题更新
   */
  public static validateTitleUpdate(sessionId: string, newTitle: string): { valid: boolean; error?: string } {
    if (!sessionId || typeof sessionId !== 'string') {
      return { valid: false, error: '会话 ID 不能为空' }
    }

    if (!newTitle || typeof newTitle !== 'string') {
      return { valid: false, error: '新标题不能为空' }
    }

    if (newTitle.length > 200) {
      return { valid: false, error: '标题长度不能超过 200' }
    }

    return { valid: true }
  }

  /**
   * 验证删除操作
   */
  public static validateDelete(id: string, type: 'session' | 'message'): { valid: boolean; error?: string } {
    if (!id || typeof id !== 'string') {
      return { valid: false, error: `${type} ID 不能为空` }
    }

    if (id.length > 100) {
      return { valid: false, error: `${type} ID 长度不能超过 100` }
    }

    return { valid: true }
  }

  /**
   * 验证消息数据
   */
  public static validateMessageData(data: any): { valid: boolean; error?: string } {
    if (!data) {
      return { valid: false, error: '消息数据不能为空' }
    }

    if (!data.id || typeof data.id !== 'string') {
      return { valid: false, error: '消息 ID 不能为空' }
    }

    if (!data.session_id || typeof data.session_id !== 'string') {
      return { valid: false, error: '会话 ID 不能为空' }
    }

    if (!data.role || !['user', 'assistant', 'system'].includes(data.role)) {
      return { valid: false, error: '消息角色无效' }
    }

    return { valid: true }
  }
}