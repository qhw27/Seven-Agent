/**
 * 翻译插件示例
 * 带有一个 translate 工具
 */

module.exports = {
  // 生命周期钩子
  onLoad: function(plugin) {
    console.log('[Plugin] example-translate 加载了')
  },

  onEnable: function(plugin) {
    console.log('[Plugin] example-translate 启用了')
  },

  // 注册工具
  tools: [
    {
      id: 'translate',
      name: 'translate',
      description: '简单的翻译工具（测试用）',
      execute: async function(args) {
        console.log('[Plugin] translate 工具被调用了，参数:', args)
        const { text, to } = args
        return JSON.stringify({
          original: text,
          translated: `[翻译] ${text} -> ${to || 'en'}`,
          from: 'plugin'
        })
      }
    }
  ]
}