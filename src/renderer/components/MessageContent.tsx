import { useState } from 'react'
import { Tag, Button, Tooltip } from 'antd'
import {
  FileTextOutlined,
  FilePdfOutlined,
  FileImageOutlined,
  CodeOutlined,
  FileOutlined,
  EyeOutlined,
  DownloadOutlined,
  LinkOutlined
} from '@ant-design/icons'
import FilePreview from './FilePreview'

// 文件链接属性
interface FileLinkProps {
  url?: string
  content?: string
  fileName?: string
  showPreview?: boolean
  showDownload?: boolean
}

// 检测文件类型
const detectFileType = (url: string, content?: string): string => {
  const urlExt = url.split('.').pop()?.toLowerCase() || ''
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico']
  const pdfExts = ['pdf']
  const mdExts = ['md', 'markdown']
  const codeExts = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'css', 'html', 'json', 'xml', 'yaml', 'yml', 'sql', 'sh', 'bash']

  if (imageExts.includes(urlExt)) return 'image'
  if (pdfExts.includes(urlExt)) return 'pdf'
  if (mdExts.includes(urlExt)) return 'markdown'
  if (codeExts.includes(urlExt)) return 'code'

  if (content) {
    try {
      JSON.parse(content)
      return 'json'
    } catch {}
    if (content.startsWith('#') || content.includes('## ') || content.includes('```')) {
      return 'markdown'
    }
    if (/^(import|export|const|let|var|function|class|def|public|private)/m.test(content)) {
      return 'code'
    }
  }

  return 'text'
}

// 文件链接组件 - 在消息中显示可点击的文件
const FileLink = ({ url, content, fileName, showPreview = true, showDownload = true }: FileLinkProps) => {
  const [previewVisible, setPreviewVisible] = useState(false)

  if (!url && !content) return null

  const fileType = detectFileType(url || '', content)
  const name = fileName || url?.split('/').pop() || '文件'

  // 获取文件类型信息
  const getFileTypeInfo = () => {
    switch (fileType) {
      case 'image':
        return { icon: <FileImageOutlined />, color: 'green', label: '图片' }
      case 'pdf':
        return { icon: <FilePdfOutlined />, color: 'red', label: 'PDF' }
      case 'markdown':
        return { icon: <FileTextOutlined />, color: 'blue', label: 'Markdown' }
      case 'code':
        return { icon: <CodeOutlined />, color: 'purple', label: '代码' }
      case 'json':
        return { icon: <CodeOutlined />, color: 'orange', label: 'JSON' }
      default:
        return { icon: <FileOutlined />, color: 'default', label: '文件' }
    }
  }

  const typeInfo = getFileTypeInfo()

  // 渲染内容
  const renderContent = () => {
    if (fileType === 'image' && url) {
      return (
        <div className="file-link-image">
          <img 
            src={url} 
            alt={name} 
            style={{ maxWidth: 200, maxHeight: 150, borderRadius: 8, cursor: 'pointer' }}
            onClick={() => showPreview && setPreviewVisible(true)}
          />
        </div>
      )
    }

    return (
      <div className="file-link-card">
        <div className="file-link-icon" style={{ color: typeInfo.color === 'default' ? '#666' : undefined }}>
          {typeInfo.icon}
        </div>
        <div className="file-link-info">
          <span className="file-link-name">{name}</span>
          <Tag color={typeInfo.color} style={{ marginLeft: 8 }}>{typeInfo.label}</Tag>
        </div>
        <div className="file-link-actions">
          {showPreview && (
            <Tooltip title="预览">
              <Button 
                type="text" 
                size="small" 
                icon={<EyeOutlined />} 
                onClick={() => setPreviewVisible(true)}
              />
            </Tooltip>
          )}
          {showDownload && url && (
            <Tooltip title="下载">
              <Button 
                type="text" 
                size="small" 
                icon={<DownloadOutlined />}
              >
                <a 
                  href={url} 
                  download={name}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'inherit', textDecoration: 'none' }}
                />
              </Button>
            </Tooltip>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="file-link-container" style={{ margin: '8px 0' }}>
        {renderContent()}
      </div>

      <FilePreview
        visible={previewVisible}
        url={url}
        content={content}
        fileName={name}
        onClose={() => setPreviewVisible(false)}
      />

      <style>{`
        .file-link-container {
          display: inline-block;
        }

        .file-link-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          background: #fafafa;
          border: 1px solid #e8e8e8;
          border-radius: 8px;
          min-width: 200px;
          max-width: 400px;
          transition: all 0.2s;
        }

        .file-link-card:hover {
          background: #f0f0f0;
          border-color: #d9d9d9;
        }

        .file-link-icon {
          font-size: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .file-link-info {
          flex: 1;
          display: flex;
          align-items: center;
          min-width: 0;
        }

        .file-link-name {
          font-size: 13px;
          color: #333;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 150px;
        }

        .file-link-actions {
          display: flex;
          gap: 4px;
        }

        .file-link-image img {
          transition: transform 0.2s;
        }

        .file-link-image img:hover {
          transform: scale(1.02);
        }
      `}</style>
    </>
  )
}

// 解析消息中的文件链接
interface ParsedContent {
  type: 'text' | 'file'
  content: string
  url?: string
}

// 解析消息内容，提取文件链接
const parseMessageContent = (content: string): ParsedContent[] => {
  const results: ParsedContent[] = []
  
  // 匹配文件链接格式: [文件名](URL) 或 <URL|文件名>
  const fileLinkRegex = /\[([^\]]+)\]\(([^)]+)\)|<([^|>]+)\|([^>]+)>/g
  
  let lastIndex = 0
  let match
  
  while ((match = fileLinkRegex.exec(content)) !== null) {
    // 添加文本部分
    if (match.index > lastIndex) {
      results.push({
        type: 'text',
        content: content.slice(lastIndex, match.index)
      })
    }
    
    // 添加文件链接
    if (match[1] && match[2]) {
      // [文件名](URL) 格式
      results.push({
        type: 'file',
        content: match[1],
        url: match[2]
      })
    } else if (match[3] && match[4]) {
      // <URL|文件名> 格式
      results.push({
        type: 'file',
        content: match[4],
        url: match[3]
      })
    }
    
    lastIndex = match.index + match[0].length
  }
  
  // 添加剩余文本
  if (lastIndex < content.length) {
    results.push({
      type: 'text',
      content: content.slice(lastIndex)
    })
  }
  
  return results.length > 0 ? results : [{ type: 'text', content }]
}

// 消息内容渲染组件 - 支持文件和文本混合显示
interface MessageContentProps {
  content: string
}

const MessageContent = ({ content }: MessageContentProps) => {
  const parsed = parseMessageContent(content)

  return (
    <div className="message-content-renderer">
      {parsed.map((item, index) => {
        if (item.type === 'file' && item.url) {
          return (
            <FileLink
              key={index}
              url={item.url}
              fileName={item.content}
            />
          )
        }
        
        // 渲染文本，保留换行
        return (
          <div key={index} style={{ whiteSpace: 'pre-wrap' }}>
            {item.content}
          </div>
        )
      })}

      <style>{`
        .message-content-renderer {
          font-size: 14px;
          line-height: 1.6;
        }

        .message-content-renderer > div {
          margin-bottom: 4px;
        }

        .message-content-renderer > div:last-child {
          margin-bottom: 0;
        }
      `}</style>
    </div>
  )
}

export default MessageContent
export { FileLink, MessageContent, parseMessageContent }