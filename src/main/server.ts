import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { query, run, get, all } from './database'
import { aiRouter } from './routes/ai'
import { chatRouter } from './routes/chat'

const app = new Hono()

// 中间件
app.use('*', cors())
app.use('*', async (c, next) => {
  const start = Date.now()
  await next()
  const ms = Date.now() - start
  console.log(`[${c.req.method}] ${c.req.path} - ${ms}ms`)
})

// 路由
app.get('/', (c) => c.text('Seven API Server'))
app.get('/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }))

// API 路由
app.route('/api/ai', aiRouter)
app.route('/api/chat', chatRouter)

// 数据库测试
app.get('/api/db/test', (c) => {
  try {
    const conversations = query('SELECT * FROM conversations LIMIT 10')
    return c.json({ conversations })
  } catch (error) {
    return c.json({ error: String(error) }, 500)
  }
})

// 获取应用信息
app.get('/api/info', (c) => {
  return c.json({
    name: 'Seven',
    version: '1.0.0',
    description: 'AI Assistant Desktop Application'
  })
})

let server: ReturnType<typeof serve> | null = null

const DEFAULT_PORT = 3001

async function startServer(port: number = DEFAULT_PORT): Promise<number> {
  return new Promise((resolve, reject) => {
    try {
      server = serve({
        fetch: app.fetch,
        port
      })

      console.log(`[Server] HTTP server running at http://localhost:${port}`)
      resolve(port)
    } catch (error) {
      console.error('[Server] Failed to start:', error)
      reject(error)
    }
  })
}

function stopServer(): void {
  if (server) {
    server.close()
    server = null
    console.log('[Server] HTTP server stopped')
  }
}

export { startServer, stopServer, app }