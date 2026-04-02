import { useState, useEffect } from 'react'
import { Card, Form, Input, Button, Select, message, Space, Tag, Modal, Tooltip } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, DesktopOutlined, CheckCircleFilled, SyncOutlined, ExportOutlined, ImportOutlined, GlobalOutlined } from '@ant-design/icons'
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
        <h2>模型管理</h2>
        <Space>
          <Tooltip title="导出配置">
            <Button shape="circle" icon={<ExportOutlined />} onClick={exportConfig} />
          </Tooltip>
          <Tooltip title="导入配置">
            <Button shape="circle" icon={<ImportOutlined />} onClick={importConfig} />
          </Tooltip>
          <Button
            type="primary"
            shape="circle"
            icon={<PlusOutlined />}
            onClick={() => setShowAddModal(true)}
          />
        </Space>
      </div>

      <p className="settings-desc">
        配置 AI 模型的 API Key，选择当前使用的模型。
      </p>

      {configuredModels.length === 0 ? (
        <div className="empty-state">
          <DesktopOutlined style={{ fontSize: 48, color: '#c7c7cc', marginBottom: 12 }} />
          <p>暂无已配置的模型</p>
          <Button type="primary" onClick={() => setShowAddModal(true)}>添加模型</Button>
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
                  {activeModel === model.id && <Tag color="blue" style={{ marginLeft: 8 }}>使用中</Tag>}
                </div>
                <p className="model-provider">{PROVIDER_OPTIONS.find(p => p.value === model.provider)?.label || model.provider}</p>
              </div>
              <div className="model-actions">
                <Tooltip title="编辑">
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
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

      <div className="section-title">API Key 获取</div>
      <div className="api-guide">
        {API_KEY_GUIDES.map(item => (
          <div key={item.name} className="api-item" onClick={() => openUrl(item.url)}>
            <span>{item.name}</span>
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
        className="ios-modal"
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
        className="ios-modal"
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
      >
        <p>确定要删除模型 <strong>{deletingModel?.name}</strong> 吗？</p>
      </Modal>

      <style>{`
        .model-settings {
          padding: 16px;
          padding-bottom: calc(16px + env(safe-area-inset-bottom));
          height: 100%;
          overflow-y: auto;
        }
        .model-settings-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .model-settings-header h2 {
          margin: 0;
          font-size: 28px;
          font-weight: 700;
          color: #000;
        }
        .settings-desc {
          font-size: 14px;
          color: #8e8e93;
          margin-bottom: 20px;
        }
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 20px;
          background: #fff;
          border-radius: 12px;
          margin-bottom: 20px;
        }
        .empty-state p {
          color: #8e8e93;
          margin-bottom: 16px;
        }
        .model-list {
          display: flex;
          flex-direction: column;
          gap: 1px;
          background: rgba(0, 0, 0, 0.1);
          border-radius: 12px;
          overflow: hidden;
          margin-bottom: 24px;
        }
        .model-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          background: #fff;
          cursor: pointer;
          transition: background 0.2s;
        }
        .model-item:active {
          background: #f2f2f7;
        }
        .model-item.active {
          background: #f0f7ff;
        }
        .model-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: linear-gradient(135deg, #5e5ce6 0%, #bf5af2 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          color: #fff;
          position: relative;
          flex-shrink: 0;
        }
        .check-icon {
          position: absolute;
          bottom: -3px;
          right: -3px;
          font-size: 11px;
          color: #34c759;
          background: #fff;
          border-radius: 50%;
        }
        .model-info {
          flex: 1;
          min-width: 0;
        }
        .model-name {
          display: flex;
          align-items: center;
          font-size: 16px;
          font-weight: 500;
          color: #000;
        }
        .model-provider {
          margin: 2px 0 0;
          font-size: 13px;
          color: #8e8e93;
        }
        .model-actions {
          display: flex;
          gap: 4px;
          opacity: 0.6;
        }
        .section-title {
          font-size: 13px;
          font-weight: 600;
          color: #8e8e93;
          text-transform: uppercase;
          margin-bottom: 8px;
          padding-left: 4px;
        }
        .api-guide {
          background: #fff;
          border-radius: 12px;
          overflow: hidden;
        }
        .api-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 16px;
          border-bottom: 0.5px solid rgba(0, 0, 0, 0.1);
          cursor: pointer;
          font-size: 15px;
          color: #007aff;
        }
        .api-item:last-child {
          border-bottom: none;
        }
        .api-item:active {
          background: #f2f2f7;
        }
        .api-arrow {
          font-size: 20px;
          color: #c7c7cc;
        }
        .mode-switch {
          display: flex;
          background: #f2f2f7;
          border-radius: 8px;
          padding: 3px;
          margin-bottom: 20px;
        }
        .mode-btn {
          flex: 1;
          text-align: center;
          padding: 8px 0;
          border-radius: 6px;
          font-size: 14px;
          color: #8e8e93;
          cursor: pointer;
          transition: all 0.2s;
        }
        .mode-btn.active {
          background: #fff;
          color: #000;
          font-weight: 500;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        .modal-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 20px;
          padding-top: 16px;
          border-top: 0.5px solid rgba(0, 0, 0, 0.1);
        }

        /* iOS Modal 样式 */
        .ios-modal .ant-modal-content {
          border-radius: 14px;
          overflow: hidden;
        }
        .ios-modal .ant-modal-header {
          border-bottom: 0.5px solid rgba(0, 0, 0, 0.1);
        }
        .ios-modal .ant-modal-title {
          font-weight: 600;
        }
      `}</style>
    </div>
  )
}

export default ModelSettings