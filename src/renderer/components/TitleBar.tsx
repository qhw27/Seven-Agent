import { useState, useEffect } from 'react'
import { Tooltip } from 'antd'
import {
  MinusSquareOutlined,
  ExpandOutlined,
  CloseOutlined,
  ReloadOutlined
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

  const handleMinimize = () => {
    window.api.window.minimize()
  }

  const handleMaximize = () => {
    window.api.window.maximize()
  }

  const handleClose = () => {
    window.api.window.close()
  }

  const handleRefresh = () => {
    window.location.reload()
  }

  return (
    <div className="title-bar">
      <div className="title-bar-drag">
        <span className="title-bar-title">Seven</span>
      </div>
      <div className="title-bar-controls">
        <Tooltip title="刷新" placement="bottom">
          <button className="title-bar-btn" onClick={handleRefresh}>
            <ReloadOutlined />
          </button>
        </Tooltip>
        <Tooltip title="最小化" placement="bottom">
          <button className="title-bar-btn" onClick={handleMinimize}>
            <MinusSquareOutlined />
          </button>
        </Tooltip>
        <Tooltip title={isMaximized ? '还原' : '最大化'} placement="bottom">
          <button className="title-bar-btn" onClick={handleMaximize}>
            <ExpandOutlined style={{ transform: isMaximized ? 'rotate(180deg)' : 'none' }} />
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
          height: 40px;
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 0.5px solid rgba(0, 0, 0, 0.08);
          user-select: none;
        }
        .title-bar-drag {
          flex: 1;
          height: 100%;
          display: flex;
          align-items: center;
          padding-left: 16px;
          -webkit-app-region: drag;
        }
        .title-bar-title {
          font-size: 13px;
          font-weight: 600;
          color: #000;
        }
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
          font-size: 14px;
          color: #000;
          transition: background 0.15s;
        }
        .title-bar-btn:hover {
          background: rgba(0, 0, 0, 0.06);
        }
        .title-bar-btn-close:hover {
          background: #e81123;
          color: #fff;
        }
      `}</style>
    </div>
  )
}

export default TitleBar