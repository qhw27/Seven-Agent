import { useState, useEffect } from 'react'
import { Card, Form, Input, Button, Select, message, Space, Tag, Modal, Tooltip } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, DesktopOutlined, CheckCircleFilled, SyncOutlined, ExportOutlined, ImportOutlined, GlobalOutlined, RobotOutlined } from '@ant-design/icons'
import { isLocalModel, API_KEY_GUIDES, PROVIDER_OPTIONS, PROVIDER_DEFAULTS } from '../../shared/model-config'


interface Model {
  id: string
  name: string
  provider: string
  modelName: string
  configured?: boolean
  apiKey?: string
  endpoint?: string
}

declare global {
  interface Window {
    api: {
      ai: {
         listModels(): Promise<Model[]>;
         setModelConfig(config: any): Promise<{ success: boolean; message: string }>;
         deleteModel(id: string): Promise<{ success: boolean }>;
         testConnection(config: any): Promise<{ success: boolean; message: string }>;
         chat(messages: Array<{ role: string; content: string }>, options: { model: string }): Promise<{ content: string }>;
      }
      system: {
        openExternal: (url: string) => void
      }
    }
  }
}

// 预设模型选项
const PRESET_MODEL_OPTIONS = [
  { value: 'gpt-4o', label: 'GPT-4o', provider: 'openai' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai' },
  { value: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet', provider: 'anthropic' },
  { value: 'claude-sonnet-4', label: 'Claude Sonnet 4', provider: 'anthropic' },
  { value: 'claude-3-haiku', label: 'Claude 3 Haiku', provider: 'anthropic' },
  { value: 'deepseek-chat', label: 'DeepSeek Chat', provider: 'deepseek' },
  { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner', provider: 'deepseek' },
  { value: 'qwen-max', label: '通义千问 Max', provider: 'qwen' },
  { value: 'qwen-plus', label: '通义千问 Plus', provider: 'qwen' },
  { value: 'kimi', label: 'Kimi', provider: 'moonshot' },
  { value: 'minimax-m2.5', label: 'MiniMax M2.5', provider: 'minimax' },
  { value: 'ollama-llama3.3', label: 'Ollama Llama 3.3', provider: 'ollama' },
  { value: 'lmstudio-llama3.3', label: 'LMStudio Llama 3.3', provider: 'lmstudio' },
]


function ModelSettings(): JSX.Element {
  const [models, setModels] = useState<Model[]>([])
  const [loading, setLoading] = useState(false)
  const [activeModel, setActiveModel] = useState<string>('')
  const [form] = Form.useForm()
  const [editForm] = Form.useForm()
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingModel, setEditingModel] = useState<Model | null>(null)
  const [deletingModel, setDeletingModel] = useState<Model | null>(null)
  const [addMode, setAddMode] = useState<'preset' | 'custom'>('preset')
  
  // 新增：动态获取模型列表
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [editAvailableModels, setEditAvailableModels] = useState<string[]>([])
  const [isLoadingEditModels, setIsLoadingEditModels] = useState(false)

  useEffect(() => {
    loadModels()
  }, [])

  const loadModels = async () => {
    try {
      const result = await window.api.ai.listModels()
      setModels(result)
      if (result.length > 0) {
        const configured = result.find(m => m.configured)
        if (configured) setActiveModel(configured.id)
      }
    } catch (error) {
      message.error('加载模型失败')
    }
  }

  // 从 API 获取模型列表（添加模型时）
  const fetchModels = async (endpoint: string, apiKey: string, isEdit: boolean = false) => {
    if (!endpoint) {
      message.warning('请先输入 API 地址')
      return
    }

    const setLoading = isEdit ? setIsLoadingEditModels : setIsLoadingModels
    const setModelsFunc = isEdit ? setEditAvailableModels : setAvailableModels

    setLoading(true)
    try {
      const url = `${endpoint.replace(/\/$/, '')}/models`
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      
      // 本地模型不需要 API Key
      if (apiKey && !isLocalModel(endpoint)) {
        headers['Authorization'] = `Bearer ${apiKey}`
      }

      const response = await fetch(url, { method: 'GET', headers })

      if (!response.ok) {
        if (response.status === 404) {
          message.info('该 API 不支持获取模型列表，请手动输入模型名称')
        }
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()
      const modelList = data.data || data.models || []
      const modelIds = modelList.map((m: any) => m.id)
      
      setModelsFunc(modelIds)
      message.success(`获取到 ${modelIds.length} 个模型`)
    } catch (error) {
      console.error('获取模型列表失败:', error)
      if (isLocalModel(endpoint)) {
        message.error('本地服务未运行，请确保 Ollama 或 LMStudio 已启动')
      } else {
        message.error('获取模型列表失败，请检查 API Key 和网络')
      }
      setModelsFunc([])
    } finally {
      setLoading(false)
    }
  }

  const handleAddModel = async (values: any) => {
    setLoading(true)
    try {
      const config: any = {
        id: values.modelId || `custom-${Date.now()}`,
        apiKey: values.apiKey,
        modelName: values.modelName,
        endpoint: values.endpoint,
        provider: values.provider,
      }

      if (addMode === 'preset') {
        config.name = values.modelName
      } else {
        config.name = values.name || values.modelName
      }

      const result = await window.api.ai.setModelConfig(config)

      if (result.success) {
        message.success('模型添加成功')
        setShowAddModal(false)
        form.resetFields()
        setAvailableModels([])
        loadModels()
      } else {
        message.error(result.message || '添加失败')
      }
    } catch (error) {
      message.error('添加失败: ' + (error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateModel = async (values: any) => {
    setLoading(true)
    try {
      const config: any = {
        id: values.modelId || values.id,
        apiKey: values.apiKey,
        modelName: values.modelName,
        endpoint: values.endpoint,
        provider: values.provider,
      }

      const result = await window.api.ai.setModelConfig(config)

      if (result.success) {
        message.success('模型更新成功')
        setEditingModel(null)
        editForm.resetFields()
        setEditAvailableModels([])
        loadModels()
      } else {
        message.error(result.message || '更新失败')
      }
    } catch (error) {
      message.error('更新失败: ' + (error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteModel = async () => {
    if (!deletingModel) return
    setLoading(true)
    try {
      const result = await window.api.ai.deleteModel(deletingModel.id)
      if (result.success) {
        message.success('模型删除成功')
        setDeletingModel(null)
        loadModels()
      } else {
        message.error(result.message || '删除失败')
      }
    } catch (error) {
      message.error('删除失败')
    } finally {
      setLoading(false)
    }
  }

  // 使用 PROVIDER_DEFAULTS 替代旧的 MODEL_DEFAULTS
  const handleProviderChange = (provider: string) => {
    const defaults = PROVIDER_DEFAULTS[provider]
    if (defaults) {
      form.setFieldsValue({
        modelName: defaults.model,
        endpoint: defaults.baseURL,
      })
      setAvailableModels([])
    }
  }

  const handleEditProviderChange = (provider: string) => {
    const defaults = PROVIDER_DEFAULTS[provider]
    if (defaults) {
      editForm.setFieldsValue({
        modelName: defaults.model,
        endpoint: defaults.baseURL,
      })
      setEditAvailableModels([])
    }
  }

  const handleModelIdChange = (modelId: string) => {
    const preset = PRESET_MODEL_OPTIONS.find(p => p.value === modelId)
    if (preset) {
      const defaults = PROVIDER_DEFAULTS[preset.provider]
      if (defaults) {
        form.setFieldsValue({
          modelName: defaults.model,
          endpoint: defaults.baseURL,
          provider: preset.provider,
        })
      }
    }
  }

  const openUrl = (url: string) => {
    window.api.system.openExternal(url)
  }

  // 测试模型连接
  const testConnection = async (values: any) => {
    setLoading(true)
    try {
      const config = {
        id: values.modelId || values.id || values.modelName || '',
        provider: values.provider,
        modelName: values.modelName,
        endpoint: values.endpoint,
        apiKey: values.apiKey,
      }
      const result = await window.api.ai.testConnection(config)
      if (result.success) {
        message.success('连接成功！')
      } else {
        message.error(result.message || '连接失败')
      }
    } catch (error) {
      message.error('连接测试失败')
    } finally {
      setLoading(false)
    }
  }

  // 导出配置
  const exportConfig = () => {
    const config = JSON.stringify({ models, activeModel }, null, 2)
    const blob = new Blob([config], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sevenclaw-models.json'
    a.click()
    URL.revokeObjectURL(url)
    message.success('配置已导出')
  }

  // 导入配置
  const importConfig = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e: any) => {
      const file = e.target.files[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = (event) => {
          try {
            const config = JSON.parse(event.target?.result as string)
            // TODO: 调用后端导入配置
            message.success('配置已导入，请刷新页面')
          } catch (error) {
            message.error('配置文件格式错误')
          }
        }
        reader.readAsText(file)
      }
    }
    input.click()
  }

  const configuredModels = models.filter(m => m.configured)

  return (
    <div className="model-settings">
      <div className="model-settings-header">
        <div className="header-left">
          <h2 className="settings-title">模型管理</h2>
          <p className="settings-desc">配置 AI 模型的 API Key，选择当前使用的模型</p>
        </div>
        <Space>
          <Tooltip title="导出配置">
            <Button shape="circle" icon={<ExportOutlined />} onClick={exportConfig} className="header-btn" />
          </Tooltip>
          <Tooltip title="导入配置">
            <Button shape="circle" icon={<ImportOutlined />} onClick={importConfig} className="header-btn" />
          </Tooltip>
          <Button
            type="primary"
            shape="circle"
            icon={<PlusOutlined />}
            onClick={() => setShowAddModal(true)}
            className="add-btn"
          />
        </Space>
      </div>

      {configuredModels.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <RobotOutlined />
          </div>
          <p className="empty-text">暂无已配置的模型</p>
          <Button type="primary" onClick={() => setShowAddModal(true)} className="empty-btn">
            添加模型
          </Button>
        </div>
      ) : (
        <div className="model-list">
          {configuredModels.map(model => (
            <div
              key={model.id}
              className={`model-item ${activeModel === model.id ? 'active' : ''}`}
              onClick={() => setActiveModel(model.id)}
            >
              <div className="model-icon">
                <DesktopOutlined />
                {model.configured && <CheckCircleFilled className="check-icon" />}
              </div>
              <div className="model-info">
                <div className="model-name">
                  <span>{model.name}</span>
                  {activeModel === model.id && <Tag className="active-tag">使用中</Tag>}
                </div>
                <p className="model-provider">{PROVIDER_OPTIONS.find(p => p.value === model.provider)?.label || model.provider}</p>
              </div>
              <div className="model-actions">
                <Tooltip title="编辑">
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    className="action-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditingModel(model)
                      editForm.setFieldsValue({
                        ...model,
                        modelId: model.id,
                        provider: model.provider,
                        endpoint: model.endpoint,
                        apiKey: model.apiKey,
                      })
                    }}
                  />
                </Tooltip>
                <Tooltip title="删除">
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    className="action-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeletingModel(model)
                    }}
                  />
                </Tooltip>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="section-title">
        <span className="section-dot"></span>
        API Key 获取
      </div>
      <div className="api-guide">
        {API_KEY_GUIDES.map(item => (
          <div key={item.name} className="api-item" onClick={() => openUrl(item.url)}>
            <span className="api-name">{item.name}</span>
            <span className="api-arrow">›</span>
          </div>
        ))}
      </div>

      {/* 添加模型弹窗 */}
      <Modal
        title="添加模型"
        open={showAddModal}
        onCancel={() => {
          setShowAddModal(false)
          form.resetFields()
          setAvailableModels([])
        }}
        footer={null}
        className="theme-modal"
        width={640}
      >
        <div className="mode-switch">
          <div
            className={`mode-btn ${addMode === 'preset' ? 'active' : ''}`}
            onClick={() => setAddMode('preset')}
          >
            预设模型
          </div>
          <div
            className={`mode-btn ${addMode === 'custom' ? 'active' : ''}`}
            onClick={() => setAddMode('custom')}
          >
            自定义模型
          </div>
        </div>

        <Form form={form} layout="vertical" onFinish={handleAddModel}>
          {addMode === 'preset' ? (
            <>
              <Form.Item name="modelId" label="选择模型" rules={[{ required: true }]}>
                <Select placeholder="选择预设模型" onChange={handleModelIdChange}>
                  {PRESET_MODEL_OPTIONS.map(p => (
                    <Select.Option key={p.value} value={p.value}>{p.label}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item name="provider" label="厂商" rules={[{ required: true }]}>
                <Select placeholder="选择厂商" onChange={handleProviderChange}>
                  {PROVIDER_OPTIONS.map(p => (
                    <Select.Option key={p.value} value={p.value}>{p.label}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item 
                name="endpoint" 
                label="API 地址" 
                rules={[{ required: true }]}
                tooltip="输入 API 基础地址，如 https://api.openai.com/v1"
              >
                <Input 
                  placeholder="如：https://api.openai.com/v1"
                  onChange={() => setAvailableModels([])}
                  suffix={
                    <Button 
                      type="link" 
                      size="small"
                      icon={<SyncOutlined spin={isLoadingModels} />} 
                      onClick={() => {
                        const endpoint = form.getFieldValue('endpoint')
                        const apiKey = form.getFieldValue('apiKey') || ''
                        if (endpoint) {
                          fetchModels(endpoint, apiKey, false)
                        }
                      }}
                      disabled={!form.getFieldValue('endpoint') || isLoadingModels}
                    >
                      {isLoadingModels ? '获取中' : '获取模型'}
                    </Button>
                  }
                />
              </Form.Item>
              {availableModels.length > 0 && (
                <Form.Item name="modelName" label="选择模型" rules={[{ required: true }]}>
                  <Select placeholder="从 API 获取的模型列表中选择">
                    {availableModels.map(m => (
                      <Select.Option key={m} value={m}>{m}</Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              )}
              {availableModels.length === 0 && (
                <Form.Item name="modelName" label="模型名称" rules={[{ required: true }]}>
                  <Input placeholder="如：gpt-4o" />
                </Form.Item>
              )}
            </>
          ) : (
            <>
              <Form.Item name="name" label="显示名称" rules={[{ required: true }]}>
                <Input placeholder="如：我的自定义模型" />
              </Form.Item>
              <Form.Item name="provider" label="厂商" rules={[{ required: true }]}>
                <Select placeholder="选择厂商" onChange={handleProviderChange}>
                  {PROVIDER_OPTIONS.map(p => (
                    <Select.Option key={p.value} value={p.value}>{p.label}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item name="endpoint" label="API 地址" rules={[{ required: true }]}>
                <Input 
                  placeholder="如：https://api.xxx.com/v1"
                  onChange={() => setAvailableModels([])}
                />
              </Form.Item>
              {form.getFieldValue('endpoint') && isLocalModel(form.getFieldValue('endpoint')) && (
                <Form.Item>
                  <Tag color="green" icon={<DesktopOutlined />}>本地模型（无需 API Key）</Tag>
                </Form.Item>
              )}
            </>
          )}
          <Form.Item 
            name="apiKey" 
            label="API Key" 
            tooltip={isLocalModel(form.getFieldValue('endpoint')) ? '本地模型无需填写' : undefined}
            rules={[{ required: !isLocalModel(form.getFieldValue('endpoint')) }]}
          >
            <Input.Password 
              placeholder={isLocalModel(form.getFieldValue('endpoint')) ? '本地模型无需填写' : '输入 API Key'} 
            />
          </Form.Item>
          <div className="modal-footer">
            <Button onClick={() => setShowAddModal(false)}>取消</Button>
            <Button type="primary" htmlType="submit" loading={loading}>添加</Button>
          </div>
        </Form>
      </Modal>

      {/* 编辑模型弹窗 */}
      <Modal
        title={`编辑模型: ${editingModel?.name}`}
        open={!!editingModel}
        onCancel={() => {
          setEditingModel(null)
          editForm.resetFields()
          setEditAvailableModels([])
        }}
        footer={null}
        className="theme-modal"
        width={640}
      >
        <Form form={editForm} layout="vertical" onFinish={handleUpdateModel}>
          <Form.Item name="id" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="modelId" label="模型ID" disabled>
            <Input />
          </Form.Item>
          <Form.Item name="provider" label="厂商">
            <Select placeholder="选择厂商" onChange={handleEditProviderChange}>
              {PROVIDER_OPTIONS.map(p => (
                <Select.Option key={p.value} value={p.value}>{p.label}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="endpoint" label="API 地址" rules={[{ required: true }]}>
            <Input 
              placeholder="如：https://api.openai.com/v1"
              onChange={() => setEditAvailableModels([])}
              suffix={
                <Button 
                  type="link" 
                  size="small"
                  icon={<SyncOutlined spin={isLoadingEditModels} />} 
                  onClick={() => {
                    const endpoint = editForm.getFieldValue('endpoint')
                    const apiKey = editForm.getFieldValue('apiKey') || ''
                    if (endpoint) {
                      fetchModels(endpoint, apiKey, true)
                    }
                  }}
                  disabled={!editForm.getFieldValue('endpoint') || isLoadingEditModels}
                >
                  {isLoadingEditModels ? '获取中' : '获取模型'}
                </Button>
              }
            />
          </Form.Item>
          {editAvailableModels.length > 0 ? (
            <Form.Item name="modelName" label="选择模型" rules={[{ required: true }]}>
              <Select placeholder="从 API 获取的模型列表中选择">
                {editAvailableModels.map(m => (
                  <Select.Option key={m} value={m}>{m}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          ) : (
            <Form.Item name="modelName" label="模型名称" rules={[{ required: true }]}>
              <Input placeholder="如：gpt-4o" />
            </Form.Item>
          )}
          <Form.Item 
            name="apiKey" 
            label="API Key"
            tooltip="留空保持不变"
          >
            <Input.Password placeholder="留空保持不变" />
          </Form.Item>
          <div className="modal-footer">
            <Button 
              onClick={() => {
                const values = editForm.getFieldsValue()
                testConnection(values)
              }}
              icon={<GlobalOutlined />}
            >
              测试连接
            </Button>
            <Space>
              <Button onClick={() => setEditingModel(null)}>取消</Button>
              <Button type="primary" htmlType="submit" loading={loading}>保存</Button>
            </Space>
          </div>
        </Form>
      </Modal>

      {/* 删除确认弹窗 */}
      <Modal
        title="删除模型"
        open={!!deletingModel}
        onOk={handleDeleteModel}
        onCancel={() => setDeletingModel(null)}
        okText="删除"
        okButtonProps={{ danger: true }}
        confirmLoading={loading}
        className="theme-modal"
      >
        <p>确定要删除模型 <strong>{deletingModel?.name}</strong> 吗？</p>
      </Modal>

      <style>{`
        .model-settings {
          padding: 20px;
          padding-bottom: calc(20px + env(safe-area-inset-bottom));
          height: 100%;
          overflow-y: auto;
        }

        .model-settings-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 24px;
        }

        .header-left {
          flex: 1;
        }

        .settings-title {
          font-size: 28px;
          font-weight: 700;
          background: var(--gradient-primary);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0 0 8px 0;
        }

        .settings-desc {
          font-size: 14px;
          color: var(--text-muted);
          margin: 0;
        }

        .header-btn {
          background: var(--bg-tertiary) !important;
          border-color: var(--border-default) !important;
          color: var(--text-secondary) !important;
        }

        .header-btn:hover {
          border-color: var(--primary) !important;
          color: var(--primary) !important;
        }

        .add-btn {
          background: var(--gradient-primary) !important;
          box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4) !important;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 20px;
          background: var(--bg-tertiary);
          border-radius: var(--radius-lg);
          margin-bottom: 24px;
          border: 1px dashed var(--border-default);
        }

        .empty-icon {
          width: 80px;
          height: 80px;
          border-radius: var(--radius-lg);
          background: var(--gradient-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 36px;
          color: #fff;
          margin-bottom: 20px;
          opacity: 0.8;
        }

        .empty-text {
          color: var(--text-muted);
          margin-bottom: 20px;
          font-size: 15px;
        }

        .empty-btn {
          background: var(--gradient-primary) !important;
          box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4) !important;
        }

        .model-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 32px;
        }

        .model-item {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px 20px;
          background: var(--bg-tertiary);
          border-radius: var(--radius-md);
          border: 1px solid var(--border-subtle);
          cursor: pointer;
          transition: var(--transition-smooth);
        }

        .model-item:hover {
          border-color: var(--border-default);
          box-shadow: var(--shadow-sm);
        }

        .model-item.active {
          border-color: var(--primary);
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%);
        }

        .model-icon {
          width: 48px;
          height: 48px;
          border-radius: var(--radius-md);
          background: var(--gradient-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          color: #fff;
          position: relative;
          flex-shrink: 0;
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
        }

        .check-icon {
          position: absolute;
          bottom: -4px;
          right: -4px;
          font-size: 12px;
          color: var(--success);
          background: var(--bg-tertiary);
          border-radius: 50%;
          padding: 2px;
        }

        .model-info {
          flex: 1;
          min-width: 0;
        }

        .model-name {
          display: flex;
          align-items: center;
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
          gap: 10px;
        }

        .active-tag {
          background: rgba(99, 102, 241, 0.2);
          border: none;
          color: var(--primary-light);
          font-size: 11px;
        }

        .model-provider {
          margin: 4px 0 0;
          font-size: 13px;
          color: var(--text-muted);
        }

        .model-actions {
          display: flex;
          gap: 4px;
        }

        .action-btn {
          color: var(--text-muted) !important;
        }

        .action-btn:hover {
          color: var(--primary) !important;
          background: rgba(99, 102, 241, 0.1) !important;
        }

        .section-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .section-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--gradient-primary);
        }

        .api-guide {
          background: var(--bg-tertiary);
          border-radius: var(--radius-md);
          overflow: hidden;
          border: 1px solid var(--border-subtle);
        }

        .api-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 18px;
          border-bottom: 1px solid var(--border-subtle);
          cursor: pointer;
          font-size: 14px;
          color: var(--text-secondary);
          transition: var(--transition-smooth);
        }

        .api-item:last-child {
          border-bottom: none;
        }

        .api-item:hover {
          background: var(--bg-elevated);
          color: var(--primary);
        }

        .api-name {
          font-weight: 500;
        }

        .api-arrow {
          font-size: 20px;
          color: var(--text-muted);
        }

        .mode-switch {
          display: flex;
          background: var(--bg-tertiary);
          border-radius: var(--radius-md);
          padding: 4px;
          margin-bottom: 24px;
          border: 1px solid var(--border-subtle);
        }

        .mode-btn {
          flex: 1;
          text-align: center;
          padding: 10px 0;
          border-radius: var(--radius-sm);
          font-size: 14px;
          color: var(--text-muted);
          cursor: pointer;
          transition: var(--transition-smooth);
        }

        .mode-btn.active {
          background: var(--gradient-primary);
          color: #fff;
          font-weight: 500;
          box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
        }

        .modal-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 24px;
          padding-top: 20px;
          border-top: 1px solid var(--border-subtle);
        }

        /* Modal 样式 */
        .theme-modal .ant-modal-content {
          background: var(--bg-secondary) !important;
          border: 1px solid var(--border-default) !important;
          border-radius: var(--radius-lg) !important;
        }

        .theme-modal .ant-modal-header {
          background: transparent !important;
          border-bottom: 1px solid var(--border-subtle) !important;
          padding: 20px 24px !important;
        }

        .theme-modal .ant-modal-title {
          color: var(--text-primary) !important;
          font-size: 18px !important;
          font-weight: 600 !important;
        }

        .theme-modal .ant-modal-body {
          padding: 24px !important;
        }

        .theme-modal .ant-modal-close {
          color: var(--text-muted) !important;
        }

        .theme-modal .ant-modal-close:hover {
          color: var(--text-primary) !important;
        }

        /* Form 样式 */
        .theme-modal .ant-form-item-label > label {
          color: var(--text-secondary) !important;
        }

        .theme-modal .ant-input,
        .theme-modal .ant-input-affix-wrapper,
        .theme-modal .ant-select-selector {
          background: var(--bg-tertiary) !important;
          border-color: var(--border-default) !important;
          border-radius: var(--radius-sm) !important;
        }

        .theme-modal .ant-input:focus,
        .theme-modal .ant-input-affix-wrapper:focus,
        .theme-modal .ant-select-focused .ant-select-selector {
          border-color: var(--primary) !important;
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2) !important;
        }
      `}</style>
    </div>
  )
}

export default ModelSettings