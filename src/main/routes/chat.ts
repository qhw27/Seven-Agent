import { Hono } from 'hono'
import { query, run, get, all } from '../database'

const chatRouter = new Hono()

// 获取会话列表
chatRouter.get('/conversations', (c) => {
  const conversations = all('SELECT * FROM conversations ORDER BY updated_at DESC')
  return c.json({ conversations })
})

// 创建新会话
chatRouter.post('/conversations', async (c) => {
  const body = await c.req.json()
  const { title, model } = body

  const result = run(
    'INSERT INTO conversations (title, model) VALUES (?, ?)',
    [title || '新对话', model || 'qwen']
  )

  return c.json({
    id: result.lastInsertRowid,
    title: title || '新对话',
    model: model || 'qwen'
  })
})

// 获取会话消息
chatRouter.get('/conversations/:id/messages', (c) => {
  const id = c.req.param('id')
  const messages = all('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC', [id])
  return c.json({ messages })
})

// 保存消息
chatRouter.post('/conversations/:id/messages', async (c) => {
  const conversationId = c.req.param('id')
  const body = await c.req.json()
  const { role, content, model } = body

  const result = run(
    'INSERT INTO messages (conversation_id, role, content, model) VALUES (?, ?, ?, ?)',
    [conversationId, role, content, model]
  )

  // 更新会话时间
  run("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?", [conversationId])

  return c.json({
    id: result.lastInsertRowid,
    conversation_id: conversationId,
    role,
    content
  })
})

// 删除会话
chatRouter.delete('/conversations/:id', (c) => {
  const id = c.req.param('id')
  run('DELETE FROM messages WHERE conversation_id = ?', [id])
  run('DELETE FROM conversations WHERE id = ?', [id])
  return c.json({ message: 'Conversation deleted successfully' })
})

// 重命名会话
chatRouter.patch('/conversations/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { title } = body

  run('UPDATE conversations SET title = ? WHERE id = ?', [title, id])

  return c.json({ message: 'Conversation renamed successfully' })
})

export { chatRouter }