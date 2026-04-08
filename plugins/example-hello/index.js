/**
 * Hello World 示例插件
 * 展示插件系统的基本用法
 */

/**
 * 插件加载时调用
 */
function onLoad(plugin) {
  console.log(`[Example] 插件 ${plugin.name} 已加载`)
  // 可以在这里初始化资源
}

/**
 * 插件启用时调用
 */
function onEnable(plugin) {
  console.log(`[Example] 插件 ${plugin.name} 已启用`)
}

/**
 * 插件禁用时调用
 */
function onDisable(plugin) {
  console.log(`[Example] 插件 ${plugin.name} 已禁用`)
}

/**
 * 插件卸载时调用
 */
function onUnload(plugin) {
  console.log(`[Example] 插件 ${plugin.name} 已卸载`)
  // 清理资源
}

/**
 * 插件可以注册的工具
 */
const tools = [
  {
    id: 'hello',
    name: 'sayHello',
    description: '返回一个问候语',
    execute: async (args) => {
      const greeting = args.greeting || 'Hello'
      const name = args.name || 'World'
      const uppercase = args.uppercase || false

      let message = `${greeting}, ${name}!`
      if (uppercase) {
        message = message.toUpperCase()
      }

      return { message, success: true }
    }
  },
  {
    id: 'echo',
    name: 'echo',
    description: '回显输入的内容',
    execute: async (args) => {
      return { message: args.message || 'No message provided', success: true }
    }
  }
]

module.exports = {
  onLoad,
  onEnable,
  onDisable,
  onUnload,
  tools
}