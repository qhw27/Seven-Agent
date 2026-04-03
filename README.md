# Seven-Agent
Attempt to build an AI assistant


( AI 助手)
├── 核心引擎
│   ├── QueryEngine - 查询引擎与LLM管道
│   ├── Task - 任务管理
│   └── Tool - 工具系统
│
├── 多Agent协调系统
│   ├── Coordinator - 协调器模式
│   ├── Team Agent - 团队Agent管理
│   └── Agent工具与子Agent派生
│
├── 工具系统
│   ├── 工具注册与模式
│   ├── 核心文件与Shell工具
│   └── MCP与LSP工具集成
│
├── 命令系统
│   ├── 斜杠命令注册表
│   ├── 特性门控命令
│   └── 技能与插件命令
│
├── 终端UI与渲染
│   ├── React Ink组件架构
│   ├── REPL与屏幕管理
│   └── 虚拟滚动与Diff渲染
│
├── 桥接与IDE集成
│   ├── 桥接通信协议
│   └── JWT认证与会话管理
│
├── 插件与技能系统
│   ├── 插件加载与生命周期
│   └── 技能定义与执行
│
├── 权限与安全
│   ├── Bash安全与沙箱
│   └── 权限模型
│
└── 其他关键模块
    ├── 成本追踪 (cost-tracker.ts)
    ├── 上下文管理 (context/)
    ├── 历史记录 (history.ts)
    ├── Vim集成 (vim/)
    └── 语音支持 (voice/)
