import { useState, useEffect } from 'react'
import { Modal, Tabs, Spin, message, Image, Button } from 'antd'
import {
  FileTextOutlined,
  FilePdfOutlined,
  FileImageOutlined,
  CodeOutlined,
  FileOutlined,
  DownloadOutlined,
  EyeOutlined,
  CloseOutlined
} from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'

// PDF预览组件 (简化版，不依赖 react-pdf)
const PdfPreview = ({ url, onClose }: { url: string; onClose: () => void }) => {
  const [loading, setLoading] = useState(true)

  return (
    <div style={{ height: '70vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        padding: '12px 16px',
        borderBottom: '1px solid #f0f0f0'
      }}>
        <span style={{ fontWeight: 500 }}>PDF 预览</span>
        <div>
          <Button 
            type="link" 
            icon={<DownloadOutlined />} 
            href={url}
            target="_blank"
          >
            下载
          </Button>
          <Button type="link" icon={<CloseOutlined />} onClick={onClose}>
            关闭
          </Button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', background: '#f5f5f5', padding: 20 }}>
        <iframe
          src={`https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`}
          style={{ width: '100%', height: '100%', border: 'none', borderRadius: 8 }}
          title="PDF Preview"
          onLoad={() => setLoading(false)}
        />
      </div>
    </div>
  )
}

// Markdown预览组件
const MarkdownPreview = ({ content }: { content: string }) => {
  return (
    <div className="markdown-preview">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '')
            const isInline = !match
            return isInline ? (
              <code className={className} {...props} style={{
                background: '#f5f5f5',
                padding: '2px 6px',
                borderRadius: 4,
                fontSize: '0.9em'
              }}>
                {children}
              </code>
            ) : (
              <SyntaxHighlighter
                style={oneDark as any}
                language={match[1]}
                PreTag="div"
                customStyle={{
                  borderRadius: 8,
                  margin: '12px 0'
                }}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            )
          },
          a({ node, ...props }) {
            return (
              <a {...props} target="_blank" rel="noopener noreferrer" style={{ color: '#1890ff' }}>
                {props.children}
              </a>
            )
          },
          table({ node, ...props }) {
            return (
              <table style={{ borderCollapse: 'collapse', width: '100%', margin: '12px 0' }} {...props} />
            )
          },
          th({ node, ...props }) {
            return (
              <th style={{ border: '1px solid #d9d9d9', padding: 8, background: '#fafafa' }} {...props} />
            )
          },
          td({ node, ...props }) {
            return (
              <td style={{ border: '1px solid #d9d9d9', padding: 8 }} {...props} />
            )
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

// 代码预览组件
const CodePreview = ({ content, language = 'javascript' }: { content: string; language?: string }) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(content)
    setCopied(true)
    message.success('代码已复制到剪贴板')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ position: 'relative' }}>
      <Button
        type="text"
        size="small"
        icon={copied ? <span>✓</span> : <span>📋</span>}
        onClick={handleCopy}
        style={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }}
      >
        {copied ? '已复制' : '复制'}
      </Button>
      <SyntaxHighlighter
        style={oneDark as any}
        language={language}
        showLineNumbers
        customStyle={{
          borderRadius: 8,
          margin: 0,
          fontSize: 13
        }}
        lineNumberStyle={{ minWidth: 40 }}
      >
        {content}
      </SyntaxHighlighter>
    </div>
  )
}

// 文本预览组件
const TextPreview = ({ content }: { content: string }) => {
  return (
    <pre style={{
      margin: 0,
      padding: 12,
      background: '#fafafa',
      borderRadius: 8,
      overflow: 'auto',
      maxHeight: '60vh',
      fontSize: 13,
      fontFamily: 'monospace',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word'
    }}>
      {content}
    </pre>
  )
}

// 图片预览组件
const ImagePreview = ({ url, name }: { url: string; name?: string }) => {
  const [loading, setLoading] = useState(true)

  return (
    <div style={{ textAlign: 'center', padding: 16 }}>
      {loading && <Spin tip="加载中..." />}
      <Image
        src={url}
        alt={name || '图片'}
        style={{ maxWidth: '100%', display: loading ? 'none' : 'inline-block' }}
        onLoad={() => setLoading(false)}
        onError={() => {
          setLoading(false)
          message.error('图片加载失败')
        }}
        preview={{
          mask: (
            <div style={{ color: '#fff' }}>
              <EyeOutlined />
              <span style={{ marginLeft: 8 }}>预览</span>
            </div>
          )
        }}
      />
    </div>
  )
}

// 检测文件类型
const detectFileType = (url: string, content?: string): string => {
  // URL 扩展名检测
  const urlExt = url.split('.').pop()?.toLowerCase() || ''
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico']
  const pdfExts = ['pdf']
  const mdExts = ['md', 'markdown']
  const codeExts = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'css', 'html', 'json', 'xml', 'yaml', 'yml', 'sql', 'sh', 'bash']

  if (imageExts.includes(urlExt)) return 'image'
  if (pdfExts.includes(urlExt)) return 'pdf'
  if (mdExts.includes(urlExt)) return 'markdown'
  if (codeExts.includes(urlExt)) return 'code'

  // 内容检测
  if (content) {
    // 检测 JSON
    try {
      JSON.parse(content)
      return 'json'
    } catch {}

    // 检测 Markdown 特征
    if (content.startsWith('#') || content.includes('## ') || content.includes('```')) {
      return 'markdown'
    }

    // 检测代码特征
    if (/^(import|export|const|let|var|function|class|def|public|private)/m.test(content)) {
      return 'code'
    }
  }

  return 'text'
}

// 预览组件属性
interface FilePreviewProps {
  visible: boolean
  url?: string
  content?: string
  fileName?: string
  onClose: () => void
}

// 主预览组件
const FilePreview = ({ visible, url, content, fileName, onClose }: FilePreviewProps) => {
  const [activeTab, setActiveTab] = useState('preview')

  if (!visible || (!url && !content)) return null

  const fileType = detectFileType(url || '', content)
  const fileNameStr = fileName || url?.split('/').pop() || '文件'

  // 渲染预览内容
  const renderPreview = () => {
    if (fileType === 'image' && url) {
      return <ImagePreview url={url} name={fileNameStr} />
    }

    if (fileType === 'pdf' && url) {
      return <PdfPreview url={url} onClose={onClose} />
    }

    if (fileType === 'markdown' && content) {
      return <MarkdownPreview content={content} />
    }

    if (fileType === 'code' && content) {
      // 尝试检测语言
      const ext = fileNameStr.split('.').pop()?.toLowerCase() || 'javascript'
      const langMap: Record<string, string> = {
        js: 'javascript',
        ts: 'typescript',
        jsx: 'javascript',
        tsx: 'typescript',
        py: 'python',
        java: 'java',
        cpp: 'cpp',
        c: 'c',
        css: 'css',
        html: 'html',
        json: 'json',
        xml: 'xml',
        yaml: 'yaml',
        yml: 'yaml',
        sql: 'sql',
        sh: 'bash',
        bash: 'bash'
      }
      return <CodePreview content={content} language={langMap[ext] || 'text'} />
    }

    if (fileType === 'json' && content) {
      try {
        const formatted = JSON.stringify(JSON.parse(content), null, 2)
        return <CodePreview content={formatted} language="json" />
      } catch {
        return <TextPreview content={content} />
      }
    }

    return <TextPreview content={content || '无法预览此文件'} />
  }

  // 获取文件类型图标和标签
  const getFileTypeInfo = () => {
    switch (fileType) {
      case 'image':
        return { icon: <FileImageOutlined />, label: '图片' }
      case 'pdf':
        return { icon: <FilePdfOutlined />, label: 'PDF' }
      case 'markdown':
        return { icon: <FileTextOutlined />, label: 'Markdown' }
      case 'code':
        return { icon: <CodeOutlined />, label: '代码' }
      case 'json':
        return { icon: <CodeOutlined />, label: 'JSON' }
      default:
        return { icon: <FileOutlined />, label: '文本' }
    }
  }

  const typeInfo = getFileTypeInfo()

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      footer={null}
      width={fileType === 'image' ? '90vw' : 800}
      style={{ top: 20 }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {typeInfo.icon}
          <span>{fileNameStr}</span>
          <span style={{ 
            fontSize: 12, 
            color: '#888', 
            fontWeight: 'normal',
            marginLeft: 8 
          }}>
            ({typeInfo.label})
          </span>
        </div>
      }
      styles={{ body: { padding: 0, maxHeight: '70vh', overflow: 'auto' } }}
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'preview',
            label: '预览',
            children: renderPreview()
          },
          ...(content ? [{
            key: 'source',
            label: '源码',
            children: <CodePreview content={content} language="text" />
          }] : [])
        ]}
      />
    </Modal>
  )
}

export default FilePreview
export { FilePreview, MarkdownPreview, CodePreview, TextPreview, ImagePreview, PdfPreview }