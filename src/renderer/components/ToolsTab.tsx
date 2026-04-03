import { useState, useEffect } from 'react'
import { Card, Tabs, Tag, Button, Empty, Spin, message, List, Badge, Input } from 'antd'
const { TabPane } = Tabs
import {
  FileTextOutlined,
  FolderOutlined,
  CloudOutlined,
  CodeOutlined,
  DownloadOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  SyncOutlined,
  ToolOutlined,
  SearchOutlined,
  SettingOutlined
} from '@ant-design/icons'

const { Search } = Input

// 内置工具列表
const BUILT_IN_TOOLS = [
  { id: 'file_read', name: '文件读取', icon: <FileTextOutlined />, desc: '读取文件内容', category: '文件' },
  { id: 'file_write', name: '文件写入', icon: <FileTextOutlined />, desc: '写入内容到文件', category: '文件' },
  { id: 'dir_list', name: '目录列表', icon: <FolderOutlined />, desc: '列出目录内容', category: '文件' },
  { id: 'weather', name: '天气查询', icon: <CloudOutlined />, desc: '查询城市天气', category: '生活' },
  { id: 'execute_command', name: '执行命令', icon: <CodeOutlined />, desc: '运行系统命令', category: '系统' }
]

interface SkillHubSkill {
  id: string
  name: string
  description: string
  downloads: number
  stars: number
  categories: string[]
  installed?: boolean
}

function ToolsTab(): JSX.Element {
  const [localSkills, setLocalSkills] = useState<SkillHubSkill[]>([])
  const [hubSkills, setHubSkills] = useState<SkillHubSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')
  const [searching, setSearching] = useState(false)

  // 加载技能列表
  useEffect(() => {
    loadSkills()
  }, [])

  const loadSkills = async () => {
    setLoading(true)
    try {
      // 获取本地技能
      const local = await window.api.skill.getLocalSkills()
      setLocalSkills(local.map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        downloads: 0,
        stars: 0,
        categories: s.tags || [],
        installed: true
      })))

      // 获取 SkillHub 技能
      const hub = await window.api.skill.getSkillHubSkills(30)
      const localIds = new Set(local.map((s: any) => s.id))
      setHubSkills(hub.map((s: any) => ({
        ...s,
        installed: localIds.has(s.id)
      })))
    } catch (error) {
      console.error('Load skills error:', error)
    } finally {
      setLoading(false)
    }
  }

  // 搜索 SkillHub 技能
  const handleSearch = async (value: string) => {
    if (!value.trim()) {
      loadSkills()
      return
    }

    setSearching(true)
    try {
      const results = await window.api.skill.searchSkills(value)
      const localIds = new Set(localSkills.map(s => s.id))
      setHubSkills(results.map((s: any) => ({
        ...s,
        installed: localIds.has(s.id)
      })))
    } catch (error) {
      console.error('Search skills error:', error)
      message.error('搜索失败')
    } finally {
      setSearching(false)
    }
  }

  // 安装技能
  const handleInstall = async (skillId: string) => {
    setInstalling(skillId)
    try {
      const success = await window.api.skill.downloadSkill(skillId)
      if (success) {
        message.success(`${skillId} 安装成功`)
        loadSkills()
      } else {
        message.error(`${skillId} 安装失败`)
      }
    } catch (error) {
      message.error(`安装失败: ${error}`)
    } finally {
      setInstalling(null)
    }
  }

  // 删除技能
  const handleDelete = async (skillId: string) => {
    try {
      const success = await window.api.skill.deleteSkill(skillId)
      if (success) {
        message.success(`${skillId} 已删除`)
        loadSkills()
      } else {
        message.error(`删除失败`)
      }
    } catch (error) {
      message.error(`删除失败: ${error}`)
    }
  }

  // 按分类分组内置工具
  const groupedBuiltIn = BUILT_IN_TOOLS.reduce((acc, tool) => {
    if (!acc[tool.category]) acc[tool.category] = []
    acc[tool.category].push(tool)
    return acc
  }, {} as Record<string, typeof BUILT_IN_TOOLS>)

  // 过滤技能列表
  const filteredHubSkills = searchText
    ? hubSkills.filter(skill =>
        skill.name.toLowerCase().includes(searchText.toLowerCase()) ||
        skill.description?.toLowerCase().includes(searchText.toLowerCase()) ||
        skill.categories?.some((cat: string) => cat.toLowerCase().includes(searchText.toLowerCase()))
      )
    : hubSkills

  return (
    <div className="tools-tab">
      <div className="tools-header">
        <h2 className="tools-title">工具中心</h2>
        <p className="tools-desc">管理和扩展 AI 能力</p>
      </div>

      <Tabs defaultActiveKey="builtin" size="small" className="tools-tabs">
        {/* 内置工具 */}
        <TabPane tab={<span><ToolOutlined /> 内置工具</span>} key="builtin">
          <div className="tools-section">
            {Object.entries(groupedBuiltIn).map(([category, tools]) => (
              <div key={category} className="tool-category">
                <h3 className="category-title">
                  <span className="category-dot"></span>
                  {category}
                </h3>
                <div className="tool-grid">
                  {tools.map(tool => (
                    <Card
                      key={tool.id}
                      size="small"
                      className="tool-card built-in"
                    >
                      <div className="tool-icon">
                        {tool.icon}
                      </div>
                      <div className="tool-info">
                        <div className="tool-name">
                          {tool.name}
                          <Tag className="tool-tag">内置</Tag>
                        </div>
                        <div className="tool-desc">{tool.desc}</div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TabPane>

        {/* 已安装技能 */}
        <TabPane tab={<span><CheckCircleOutlined /> 已安装</span>} key="installed">
          {loading ? (
            <div className="loading-container"><Spin /></div>
          ) : localSkills.length === 0 ? (
            <Empty description="暂无已安装的技能" />
          ) : (
            <List
              dataSource={localSkills}
              renderItem={skill => (
                <List.Item
                  className="skill-item"
                  actions={[
                    <Button
                      key="delete"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => handleDelete(skill.id)}
                    >
                      删除
                    </Button>
                  ]}
                >
                  <List.Item.Meta
                    avatar={
                      <div className="skill-avatar">
                        <SettingOutlined />
                      </div>
                    }
                    title={skill.name}
                    description={skill.description || '暂无描述'}
                  />
                </List.Item>
              )}
            />
          )}
        </TabPane>

        {/* SkillHub 技能商店 */}
        <TabPane tab={<span><DownloadOutlined /> 技能商店</span>} key="store">
          <div className="search-bar">
            <Search
              placeholder="搜索技能名称、描述或分类..."
              allowClear
              enterButton="搜索"
              loading={searching}
              onSearch={handleSearch}
              onChange={(e) => setSearchText(e.target.value)}
              value={searchText}
              prefix={<SearchOutlined style={{ color: 'var(--text-muted)' }} />}
            />
          </div>
          {loading ? (
            <div className="loading-container"><Spin /></div>
          ) : filteredHubSkills.length === 0 ? (
            <Empty description={searchText ? "未找到匹配的技能" : "暂无技能"} />
          ) : (
            <List
              dataSource={filteredHubSkills}
              renderItem={skill => (
                <List.Item
                  className="skill-item"
                  actions={[
                    skill.installed ? (
                      <Tag key="installed" color="success">已安装</Tag>
                    ) : (
                      <Button
                        key="install"
                        type="primary"
                        size="small"
                        icon={<DownloadOutlined />}
                        loading={installing === skill.id}
                        onClick={() => handleInstall(skill.id)}
                      >
                        安装
                      </Button>
                    )
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <span>
                        {skill.name}
                        {skill.stars > 100 && <Tag color="gold" style={{ marginLeft: 8 }}>⭐ {skill.stars}</Tag>}
                      </span>
                    }
                    description={
                      <div>
                        <div className="skill-desc">{skill.description?.substring(0, 100)}...</div>
                        <div className="skill-tags">
                          {skill.categories?.slice(0, 3).map((cat: string) => (
                            <Tag key={cat} size="small" className="skill-tag">{cat}</Tag>
                          ))}
                        </div>
                      </div>
                    }
                  />
                </List.Item>
              )}
            />
          )}
          <div className="refresh-btn">
            <Button icon={<SyncOutlined />} onClick={loadSkills}>刷新</Button>
          </div>
        </TabPane>
      </Tabs>

      <style>{`
        .tools-tab {
          padding: 20px;
          height: 100%;
          overflow-y: auto;
        }

        .tools-header {
          margin-bottom: 24px;
        }

        .tools-title {
          font-size: 28px;
          font-weight: 700;
          background: var(--gradient-primary);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0 0 8px 0;
        }

        .tools-desc {
          font-size: 14px;
          color: var(--text-muted);
          margin: 0;
        }

        .tools-tabs .ant-tabs-nav {
          margin-bottom: 20px;
        }

        .tools-tabs .ant-tabs-tab {
          padding: 8px 16px;
          color: var(--text-secondary);
          transition: var(--transition-smooth);
        }

        .tools-tabs .ant-tabs-tab:hover {
          color: var(--text-primary);
        }

        .tools-tabs .ant-tabs-tab-active .ant-tabs-tab-btn {
          color: var(--primary) !important;
        }

        .tools-tabs .ant-tabs-ink-bar {
          background: var(--gradient-primary);
          height: 3px;
          border-radius: 3px;
        }

        .tools-section {
          padding: 8px 0;
        }

        .tool-category {
          margin-bottom: 24px;
        }

        .category-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 16px;
          padding-left: 4px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .category-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--gradient-primary);
        }

        .tool-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 16px;
        }

        .tool-card {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px;
          border-radius: var(--radius-md);
          background: var(--bg-tertiary);
          border: 1px solid var(--border-subtle);
          transition: var(--transition-smooth);
        }

        .tool-card:hover {
          border-color: var(--primary);
          box-shadow: var(--shadow-glow);
          transform: translateY(-2px);
        }

        .tool-card.built-in {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%);
          border: 1px solid rgba(99, 102, 241, 0.2);
        }

        .tool-icon {
          width: 44px;
          height: 44px;
          border-radius: var(--radius-md);
          background: var(--gradient-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          color: #fff;
          flex-shrink: 0;
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
        }

        .tool-info {
          flex: 1;
          min-width: 0;
        }

        .tool-name {
          font-size: 15px;
          font-weight: 600;
          color: var(--text-primary);
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .tool-tag {
          font-size: 10px;
          padding: 0 6px;
          background: rgba(99, 102, 241, 0.2);
          border: none;
          color: var(--primary-light);
          border-radius: 4px;
        }

        .tool-desc {
          font-size: 12px;
          color: var(--text-muted);
          margin-top: 4px;
        }

        .skill-item {
          background: var(--bg-tertiary);
          border-radius: var(--radius-md);
          padding: 14px 20px 14px 24px !important;
          margin-bottom: 10px;
          margin-left: 4px;
          border: 1px solid var(--border-subtle);
          transition: var(--transition-smooth);
        }

        .skill-item:hover {
          border-color: var(--border-default);
        }

        .skill-item .ant-list-item-meta-title {
          color: var(--text-primary) !important;
          font-weight: 600;
          font-size: 15px;
          margin-bottom: 4px;
        }

        .skill-item .ant-list-item-meta-description {
          color: var(--text-secondary) !important;
          font-size: 13px;
        }

        .skill-avatar {
          width: 40px;
          height: 40px;
          border-radius: var(--radius-md);
          background: var(--gradient-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: 16px;
        }

        .skill-desc {
          font-size: 13px;
          color: var(--text-secondary);
          margin-bottom: 8px;
        }

        .skill-tags {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .skill-tag {
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          color: var(--text-muted);
          font-size: 11px;
        }

        .loading-container {
          display: flex;
          justify-content: center;
          padding: 60px;
        }

        .refresh-btn {
          text-align: center;
          margin-top: 20px;
        }

        .refresh-btn .ant-btn {
          background: var(--bg-tertiary);
          border-color: var(--border-default);
          color: var(--text-secondary);
        }

        .refresh-btn .ant-btn:hover {
          border-color: var(--primary);
          color: var(--primary);
        }

        .search-bar {
          margin-bottom: 20px;
        }

        .search-bar .ant-input-search .ant-input {
          background: var(--bg-tertiary) !important;
        }

        .search-bar .ant-input-search .ant-input-search-button {
          background: var(--gradient-primary) !important;
          border: none !important;
        }
      `}</style>
    </div>
  )
}

export default ToolsTab