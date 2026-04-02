import { Hono } from 'hono'
import { query, run, get } from '../database'

const aiRouter = new Hono()

// 获取可用模型列表
aiRouter.get('/models', (c) => {
  const models = query('SELECT * FROM models WHERE enabled = 1')
  return c.json({ models })
})

// 添加模型
aiRouter.post('/models', async (c) => {
  const body = await c.req.json()
  const { name, provider, api_key, endpoint } = body

  const result = run(
    'INSERT INTO models (name, provider, api_key, endpoint) VALUES (?, ?, ?, ?)',
    [name, provider, api_key, endpoint]
  )

  return c.json({ id: result.lastInsertRowid, message: 'Model added successfully' })
})

// 删除模型
aiRouter.delete('/models/:id', (c) => {
  const id = c.req.param('id')
  run('DELETE FROM models WHERE id = ?', [id])
  return c.json({ message: 'Model deleted successfully' })
})

// 切换模型启用状态
aiRouter.patch('/models/:id/toggle', (c) => {
  const id = c.req.param('id')
  const model = get<{ enabled: number }>('SELECT enabled FROM models WHERE id = ?', [id])

  if (model) {
    const newEnabled = model.enabled === 1 ? 0 : 1
    run('UPDATE models SET enabled = ? WHERE id = ?', [newEnabled, id])
  }

  return c.json({ message: 'Model toggled successfully' })
})

export { aiRouter }