import { useState } from 'react'
import { Layout, Tooltip } from 'antd'
import {
  MessageOutlined,
  BookOutlined,
  ExperimentOutlined
} from '@ant-design/icons'
import ChatArea from './components/ChatArea'
import ModelSettings from './components/ModelSettings'
import TitleBar from './components/TitleBar'
import './styles/index.css'

const { Content } = Layout

const tools = [
  { key: 'chat', icon: <MessageOutlined />, title: '对话' },
  { key: 'knowledge', icon: <BookOutlined />, title: '知识库' },
  { key: 'models', icon: <ExperimentOutlined />, title: '模型' }
]

function App(): JSX.Element {
  const [currentTool, setCurrentTool] = useState<string>('chat')

  const renderContent = () => {
    switch (currentTool) {
      case 'models':
      case 'settings':
        return <ModelSettings />
      default:
        return <ChatArea tool={currentTool} />
    }
  }

  return (
    <Layout className="app-layout">
      <TitleBar />
      <Content className="app-content">
        {renderContent()}
      </Content>
      <div className="bottom-tabs">
        <div className="tabs-container">
          {tools.map((tool) => (
            <Tooltip key={tool.key} title={tool.title} placement="top">
              <div
                className={`tab-item ${currentTool === tool.key ? 'active' : ''}`}
                onClick={() => setCurrentTool(tool.key)}
              >
                {tool.icon}
                <span className="tab-label">{tool.title}</span>
              </div>
            </Tooltip>
          ))}
        </div>
      </div>
      <style>{`
        .app-layout {
          height: 100vh;
          background: #f2f2f7;
        }
        .app-content {
          flex: 1;
          overflow: auto;
          background: #f2f2f7;
        }
        .bottom-tabs {
          padding: 8px 16px;
          padding-bottom: calc(8px + env(safe-area-inset-bottom));
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-top: 0.5px solid rgba(0, 0, 0, 0.08);
        }
        .tabs-container {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 8px;
        }
        .tab-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 8px 24px;
          border-radius: 16px;
          color: #8e8e93;
          cursor: pointer;
          font-size: 20px;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          min-width: 72px;
        }
        .tab-item:hover {
          background: rgba(0, 0, 0, 0.04);
        }
        .tab-item.active {
          color: #007aff;
          background: rgba(0, 122, 255, 0.12);
          box-shadow: 0 2px 8px rgba(0, 122, 255, 0.15);
        }
        .tab-label {
          font-size: 11px;
          margin-top: 2px;
          font-weight: 500;
        }
      `}</style>
    </Layout>
  )
}

export default App