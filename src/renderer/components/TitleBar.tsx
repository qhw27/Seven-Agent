import { useState, useEffect } from 'react'
import { Tooltip } from 'antd'
import {
  MinusOutlined,
  ExpandOutlined,
  CloseOutlined,
  ReloadOutlined,
  DiscordOutlined
} from '@ant-design/icons'

function TitleBar(): JSX.Element {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    // 获取初始最大化状态
    window.api.window.isMaximized().then(setIsMaximized)

    // 监听最大化状态变化
    window.api.window.onMaximizedChanged((_event, maximized) => {
      setIsMaximized(maximized)
    })
    return () => {
      window.api.window.offMaximizedChanged(() => {})
    }
  }, [])

  const handleMinimize = () => window.api.window.minimize()
  const handleMaximize = () => window.api.window.maximize()
  const handleClose = () => window.api.window.close()
  const handleRefresh = () => window.location.reload()

  return (
    <div className="title-bar">
      <div className="title-bar-drag">
        {/* Logo */}
        <div className="title-bar-logo">
          <div className="logo-icon">
            <DiscordOutlined />
          </div>
          <span className="logo-text">Seven</span>
        </div>
      </div>
      
      <div className="title-bar-controls">
        <Tooltip title="刷新" placement="bottom">
          <button className="title-bar-btn" onClick={handleRefresh}>
            <ReloadOutlined />
          </button>
        </Tooltip>
        <Tooltip title="最小化" placement="bottom">
          <button className="title-bar-btn" onClick={handleMinimize}>
            <MinusOutlined />
          </button>
        </Tooltip>
        <Tooltip title={isMaximized ? '还原' : '最大化'} placement="bottom">
          <button className="title-bar-btn" onClick={handleMaximize}>
            <ExpandOutlined style={{ 
              transform: isMaximized ? 'rotate(180deg)' : 'none',
              fontSize: 12
            }} />
          </button>
        </Tooltip>
        <Tooltip title="关闭" placement="bottom">
          <button className="title-bar-btn title-bar-btn-close" onClick={handleClose}>
            <CloseOutlined />
          </button>
        </Tooltip>
      </div>

      <style>{`
        .title-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 48px;
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border-subtle);
          user-select: none;
          -webkit-app-region: drag;
        }

        .title-bar-drag {
          flex: 1;
          height: 100%;
          display: flex;
          align-items: center;
          padding-left: 12px;
        }

        /* Logo 区域 */
        .title-bar-logo {
          display: flex;
          align-items: center;
          gap: 10px;
          -webkit-app-region: no-drag;
        }

        .logo-icon {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--gradient-primary);
          border-radius: 8px;
          font-size: 14px;
          color: white;
          box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
        }

        .logo-text {
          font-size: 15px;
          font-weight: 700;
          background: var(--gradient-primary);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          letter-spacing: -0.5px;
        }

        /* 窗口控制按钮 */
        .title-bar-controls {
          display: flex;
          height: 100%;
          -webkit-app-region: no-drag;
        }

        .title-bar-btn {
          width: 46px;
          height: 100%;
          border: none;
          background: transparent;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          color: var(--text-secondary);
          transition: var(--transition-fast);
        }

        .title-bar-btn:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .title-bar-btn-close:hover {
          background: var(--error);
          color: white;
        }

        /* 最小化按钮动画 */
        .title-bar-btn:nth-child(2):hover {
          background: var(--bg-tertiary);
        }

        /* 最大化按钮 */
        .title-bar-btn:nth-child(3):hover {
          background: var(--bg-tertiary);
        }
      `}</style>
    </div>
  )
}

export default TitleBar