import React, { useState, useEffect } from 'react'
import { Card, List, Switch, Button, Empty, Tag, Modal, message, Spin, Tooltip, Space, Input, Drawer, Select, Tabs, Badge, Divider, Row, Col, Upload, Statistic } from 'antd'
import { AppstoreOutlined, PlusOutlined, DeleteOutlined, FolderOutlined, SettingOutlined, ReloadOutlined, CheckCircleOutlined, CloseCircleOutlined, CloudDownloadOutlined, SearchOutlined, ShopOutlined, InfoCircleOutlined, ToolOutlined, CodeOutlined, InboxOutlined, ExperimentOutlined, LockOutlined } from '@ant-design/icons'
import type { RcFile } from 'antd/es/upload'

const { Dragger } = Upload
interface PluginManifest {
  id: string
  name: string
  version: string
  description?: string
  author?: string
  homepage?: string
  permissions?: string[]
  settings?: PluginSetting[]
}

interface PluginSetting {
  key: string
  label: string
  type: 'text' | 'number' | 'boolean' | 'select' | 'password'
  default?: any
  options?: { label: string; value: any }[]
  description?: string
}

interface PluginInstance {
  id: string
  name: string
  version: string
  description?: string
  author?: string
  enabled: boolean
  loaded: boolean
  manifest: PluginManifest
  settings?: Record<string, any>
  permissions: string[]
}

const { Search } = Input

export const PluginsTab: React.FC = () => {
  const [plugins, setPlugins] = useState<PluginInstance[]>([])
  const [marketPlugins, setMarketPlugins] = useState<PluginManifest[]>([])
  const [loading, setLoading] = useState(true)
  const [marketLoading, setMarketLoading] = useState(false)
  const [selectedPlugin, setSelectedPlugin] = useState<PluginInstance | null>(null)
  const [settingsVisible, setSettingsVisible] = useState(false)
  const [marketVisible, setMarketVisible] = useState(false)
  const [activeTab, setActiveTab] = useState('installed')
  const [searchQuery, setSearchQuery] = useState('')
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set())
  const [installModalVisible, setInstallModalVisible] = useState(false)
  const [installingIds, setInstallingIds] = useState<Set<string>>(new Set())

  const loadPlugins = async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI?.invoke('plugin:list')
      if (result?.plugins) {
        setPlugins(result.plugins)
      }
    } catch (error) {
      console.error('加载插件列表失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadMarketPlugins = async () => {
    setMarketLoading(true)
    try {
      console.log('[PluginsTab] 调用 plugin:getMarket')
      console.log('[PluginsTab] window.electronAPI:', window.electronAPI ? '存在' : '不存在')
      const result = await window.electronAPI?.invoke('plugin:getMarket')
      console.log('[PluginsTab] getMarket 原始结果:', JSON.stringify(result))
      if (result?.success && result?.plugins) {
        setMarketPlugins(result.plugins)
      } else if (result && !result.success) {
        console.error('[PluginsTab] 获取失败:', result.error)
      }
    } catch (error) {
      console.error('[PluginsTab] 加载插件市场失败:', error)
    } finally {
      setMarketLoading(false)
    }
  }

  const searchMarketPlugins = async (query: string) => {
    if (!query.trim()) {
      loadMarketPlugins()
      return
    }
    setMarketLoading(true)
    try {
      const result = await window.electronAPI?.invoke('plugin:search', query)
      if (result?.success && result?.plugins) {
        setMarketPlugins(result.plugins)
      }
    } catch (error) {
      console.error('搜索插件市场失败:', error)
    } finally {
      setMarketLoading(false)
    }
  }

  useEffect(() => {
    loadPlugins()
  }, [])

  useEffect(() => {
    if (marketVisible && marketPlugins.length === 0) {
      loadMarketPlugins()
    }
  }, [marketVisible])

  useEffect(() => {
    if (activeTab === 'market' && marketPlugins.length === 0) {
      loadMarketPlugins()
    }
  }, [activeTab])

  const handleEnable = async (pluginId: string, enabled: boolean) => {
    try {
      const channel = enabled ? 'plugin:enable' : 'plugin:disable'
      await window.electronAPI?.invoke(channel, pluginId)
      message.success(enabled ? '插件已启用' : '插件已禁用')
      loadPlugins()
    } catch (error) {
      message.error('操作失败')
    }
  }

  const handleUninstall = async (pluginId: string) => {
    Modal.confirm({
      title: '确认卸载',
      content: `确定要卸载插件 "${pluginId}" 吗？`,
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        try {
          await window.electronAPI?.invoke('plugin:uninstall', pluginId)
          message.success('插件已卸载')
          loadPlugins()
        } catch (error) {
          message.error('卸载失败')
        }
      }
    })
  }

  const handleOpenFolder = async () => {
    try {
      await window.electronAPI?.invoke('plugin:openPluginsFolder')
    } catch (error) {
      message.error('打开文件夹失败')
    }
  }

  const handleDownload = async (pluginId: string) => {
    setDownloadingIds(prev => new Set(prev).add(pluginId))
    try {
      console.log('[PluginsTab] 调用 plugin:download', pluginId)
      const result = await window.electronAPI?.invoke('plugin:download', pluginId)
      console.log('[PluginsTab] download 原始结果:', JSON.stringify(result))
      if (result?.success) {
        message.success('插件下载并安装成功')
        loadPlugins()
        setActiveTab('installed')
      } else {
        message.error(result?.error || '下载安装失败')
      }
    } catch (error) {
      message.error('下载安装失败')
    } finally {
      setDownloadingIds(prev => {
        const next = new Set(prev)
        next.delete(pluginId)
        return next
      })
    }
  }

  const isPluginInstalled = (pluginId: string) => {
    return plugins.some(p => p.id === pluginId)
  }

  const renderPluginIcon = (plugin: PluginInstance | PluginManifest) => {
    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b']
    const color = colors[plugin.id.charCodeAt(0) % colors.length]
    return (
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          background: `linear-gradient(135deg, ${color} 0%, ${color}99 100%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: 18,
          fontWeight: 'bold'
        }}
      >
        <AppstoreOutlined />
      </div>
    )
  }

  const renderInstalledPlugin = (plugin: PluginInstance) => (
    <Card
      size="small"
      style={{
        marginBottom: 12,
        background: 'var(--bg-secondary)',
        borderColor: 'var(--border-color)',
        transition: 'all 0.3s'
      }}
      hoverable
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {renderPluginIcon(plugin)}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
              {plugin.name}
            </span>
            <Tag color="default" style={{ fontSize: 12 }}>v{plugin.version}</Tag>
            {plugin.enabled ? (
              <Tag icon={<CheckCircleOutlined />} color="success">已启用</Tag>
            ) : (
              <Tag icon={<CloseCircleOutlined />} color="default">已禁用</Tag>
            )}
          </div>
          {plugin.description && (
            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {plugin.description}
            </p>
          )}
          {plugin.permissions && plugin.permissions.length > 0 && (
            <div style={{ marginTop: 4 }}>
              {plugin.permissions.map((perm) => (
                <Tag key={perm} color="blue" style={{ fontSize: 11 }}>{perm}</Tag>
              ))}
            </div>
          )}
        </div>
        <Space>
          {plugin.manifest.settings && plugin.manifest.settings.length > 0 && (
            <Tooltip title="设置">
              <Button
                type="text"
                icon={<SettingOutlined />}
                onClick={() => {
                  setSelectedPlugin(plugin)
                  setSettingsVisible(true)
                }}
              />
            </Tooltip>
          )}
          <Switch
            checked={plugin.enabled}
            onChange={(checked) => handleEnable(plugin.id, checked)}
            size="small"
          />
          <Tooltip title="卸载">
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleUninstall(plugin.id)}
            />
          </Tooltip>
        </Space>
      </div>
    </Card>
  )

  const renderMarketPlugin = (plugin: PluginManifest) => {
    const installed = isPluginInstalled(plugin.id)
    const downloading = downloadingIds.has(plugin.id)

    return (
      <Card
        size="small"
        style={{
          marginBottom: 12,
          background: 'var(--bg-secondary)',
          borderColor: 'var(--border-color)',
          transition: 'all 0.3s'
        }}
        hoverable
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {renderPluginIcon(plugin)}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                {plugin.name}
              </span>
              <Tag color="default" style={{ fontSize: 12 }}>v{plugin.version}</Tag>
              {installed && (
                <Tag icon={<CheckCircleOutlined />} color="success">已安装</Tag>
              )}
            </div>
            {plugin.description && (
              <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {plugin.description}
              </p>
            )}
            {plugin.author && (
              <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 12 }}>
                作者: {plugin.author}
              </p>
            )}
          </div>
          <Space>
            {installed ? (
              <Button type="default" size="small" disabled>
                已安装
              </Button>
            ) : (
              <Button
                type="primary"
                size="small"
                icon={<CloudDownloadOutlined />}
                loading={downloading}
                onClick={() => handleDownload(plugin.id)}
              >
                {downloading ? '下载中...' : '安装'}
              </Button>
            )}
          </Space>
        </div>
      </Card>
    )
  }

  return (
    <div className="plugins-tab">
      <div className="plugins-header">
        <div>
        <h2 className="plugins-title">插件管理</h2>
        <p className="plugins-desc">扩展 Seven 的能力 - 安装插件以添加新功能</p>
       </div>
        <div className="plugins-actions">
        <Space>
          <Tooltip title="刷新">
            <Button icon={<ReloadOutlined />} onClick={loadPlugins} />
          </Tooltip>
          <Button icon={<PlusOutlined />} onClick={() => setInstallModalVisible(true)}>
            从文件安装
          </Button>
          <Button icon={<FolderOutlined />} onClick={handleOpenFolder}>
            插件目录
          </Button>
        </Space>
      </div>
      </div>
      
       

      <div className="plugins-stats">
        <Row gutter={16}>
          <Col span={8}>
            <Card size="small" className="stat-card stat-total">
              <Statistic
                title="总插件数"
                value={plugins.length}
                prefix={<AppstoreOutlined />}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" className="stat-card stat-enabled">
              <Statistic
                title="已启用"
                value={plugins.filter(p => p.enabled).length}
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" className="stat-card stat-tools">
              <Statistic
                title="可用工具"
                value={plugins.filter(p => p.enabled).length}
                prefix={<ToolOutlined />}
              />
            </Card>
          </Col>
        </Row>
      </div>

      <Tabs activeKey={activeTab} onChange={setActiveTab} className="plugins-tabs" size="small">
        {/* 已安装 */}
        <Tabs.TabPane tab={<span><AppstoreOutlined /> 已安装 ({plugins.length})</span>} key="installed">
          {loading ? (
            <div className="loading-container"><Spin size="large" /></div>
          ) : plugins.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无插件"
            >
              <Button type="primary" icon={<ShopOutlined />} onClick={() => { setActiveTab('market'); loadMarketPlugins(); }}>
                浏览插件市场
              </Button>
            </Empty>
          ) : (
            <List
              dataSource={plugins}
              renderItem={renderInstalledPlugin}
            />
          )}
        </Tabs.TabPane>

        {/* 插件市场 */}
        <Tabs.TabPane tab={<span><ShopOutlined /> 插件市场</span>} key="market">
          <div className="search-bar">
            <Search
              placeholder="搜索插件..."
              allowClear
              enterButton="搜索"
              onSearch={(value) => searchMarketPlugins(value)}
              onChange={(e) => setSearchQuery(e.target.value)}
              value={searchQuery}
            />
          </div>
          {marketLoading ? (
            <div className="loading-container"><Spin size="large" /></div>
          ) : marketPlugins.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无插件"
            />
          ) : (
            <List
              dataSource={marketPlugins}
              renderItem={renderMarketPlugin}
            />
          )}
        </Tabs.TabPane>
      </Tabs>

    

      {/* 设置抽屉 */}
      <Drawer
        title={`${selectedPlugin?.name} - 设置`}
        placement="right"
        width={360}
        open={settingsVisible}
        onClose={() => {
          setSettingsVisible(false)
          setSelectedPlugin(null)
        }}
      >
        {selectedPlugin?.manifest.settings && (
          <div>
            {selectedPlugin.manifest.settings.map((setting) => (
              <div key={setting.key} style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 4, color: 'var(--text-primary)', fontWeight: 500 }}>
                  {setting.label}
                </label>
                {setting.description && (
                  <p style={{ margin: '0 0 8px', color: 'var(--text-secondary)', fontSize: 12 }}>
                    {setting.description}
                  </p>
                )}
                {setting.type === 'boolean' ? (
                  <Switch
                    checked={selectedPlugin.settings?.[setting.key] ?? setting.default ?? false}
                    onChange={(checked) => {
                      message.info('设置保存功能开发中')
                    }}
                  />
                ) : setting.type === 'select' ? (
                  <Select
                    defaultValue={selectedPlugin.settings?.[setting.key] ?? setting.default}
                    options={setting.options}
                    style={{ width: '100%' }}
                  />
                ) : (
                  <Input
                    type={setting.type}
                    defaultValue={selectedPlugin.settings?.[setting.key] ?? setting.default}
                    placeholder={setting.label}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </Drawer>

      {/* 安装插件弹窗 */}
      <Modal
        title={
          <Space>
            <PlusOutlined />
            <span>从文件安装插件</span>
          </Space>
        }
        open={installModalVisible}
        onCancel={() => setInstallModalVisible(false)}
        footer={null}
        width={500}
      >
        <div style={{ padding: '20px 0' }}>
          <Dragger
            name="file"
            accept=".zip"
            multiple={false}
            beforeUpload={(file) => {
              message.info('从文件安装功能开发中，请手动放置到插件目录');
              return false;
            }}
            showUploadList={false}
            style={{ padding: 20 }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined style={{ fontSize: 48, color: 'var(--primary)' }} />
            </p>
            <p className="ant-upload-text" style={{ fontSize: 16, color: 'var(--text-primary)' }}>
              点击或拖拽插件压缩包到此处上传
            </p>
            <p className="ant-upload-hint" style={{ color: 'var(--text-secondary)' }}>
              支持 .zip 格式的插件包
            </p>
          </Dragger>

          <Divider>
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>或</span>
          </Divider>

          <div style={{ textAlign: 'center' }}>
            <Button icon={<FolderOutlined />} onClick={handleOpenFolder}>
              打开插件目录手动安装
            </Button>
          </div>

          <div style={{ marginTop: 24, padding: 16, background: 'var(--bg-tertiary)', borderRadius: 8 }}>
            <h4 style={{ margin: '0 0 8px', color: 'var(--text-primary)', fontSize: 13 }}>
              <InfoCircleOutlined /> 安装说明
            </h4>
            <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.8 }}>
              <li>插件包必须是包含 manifest.json 的 zip 压缩包</li>
              <li>你也可以直接将插件文件夹放入插件目录</li>
              <li>安装后可在"已安装"标签页查看和管理</li>
            </ul>
          </div>
        </div>
      </Modal>

      <style>{`
        .plugins-tab {
          padding: 20px;
          height: 100%;
          overflow-y: auto;
        }

        .plugins-header {
          margin-bottom: 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

         .plugins-actions {
          padding-top: 20px;
        }

        .plugins-title {
          font-size: 28px;
          font-weight: 700;
          background: var(--gradient-primary);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0 0 8px 0;
        }

        .plugins-desc {
          font-size: 14px;
          color: var(--text-muted);
          margin: 0;
        }

        .plugins-tabs .ant-tabs-nav {
          margin-bottom: 20px;
        }

        .plugins-tabs .ant-tabs-tab {
          padding: 8px 16px;
          color: var(--text-secondary);
          transition: var(--transition-smooth);
        }

        .plugins-tabs .ant-tabs-tab:hover {
          color: var(--text-primary);
        }

        .plugins-tabs .ant-tabs-tab-active .ant-tabs-tab-btn {
          color: var(--primary) !important;
        }

        .plugins-tabs .ant-tabs-ink-bar {
          background: var(--gradient-primary);
          height: 3px;
          border-radius: 3px;
        }



        .plugins-stats {
          margin-top: 20px;
        }

        .stat-card {
          border-radius: var(--radius-md);
          background: var(--bg-tertiary);
          border: 1px solid var(--border-subtle);
        }

        .stat-card .ant-statistic-title {
          color: var(--text-muted);
          font-size: 12px;
        }

        .stat-card .ant-statistic-content-value {
          color: var(--text-primary);
          font-weight: 600;
        }

        .stat-total {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%);
          border-color: rgba(99, 102, 241, 0.3);
        }

        .stat-total .ant-statistic-content-prefix {
          color: var(--primary);
        }

        .stat-enabled {
          background: linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(22, 163, 74, 0.15) 100%);
          border-color: rgba(34, 197, 94, 0.3);
        }

        .stat-enabled .ant-statistic-content-prefix {
          color: var(--success);
        }

        .stat-tools {
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(217, 119, 6, 0.15) 100%);
          border-color: rgba(245, 158, 11, 0.3);
        }

        .stat-tools .ant-statistic-content-prefix {
          color: var(--warning);
        }

        .loading-container {
          display: flex;
          justify-content: center;
          padding: 60px;
        }

        .search-bar {
          margin-bottom: 20px;
        }

        .search-bar .ant-input-search .ant-input-search-button {
          background: var(--gradient-primary) !important;
          border: none !important;
        }
      `}</style>
    </div>
  )
}