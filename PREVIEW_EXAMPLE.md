# SevenClaw 预览功能示例

## 📁 支持的预览类型

### 1. 图片预览
- PNG、JPG、JPEG、GIF、WebP、BMP、SVG

### 2. 文档预览
- PDF 文件
- Markdown (.md)
- 文本文件 (.txt)

### 3. 代码预览
- JavaScript/TypeScript
- Python
- JSON/XML
- HTML/CSS

### 4. 媒体预览
- 音频文件 (mp3, wav)
- 视频文件 (mp4, webm)

---

## 🎯 使用示例

### 图片预览组件
```tsx
import { Image, Button } from 'antd';

const ImagePreview = () => (
  <Image.PreviewGroup>
    <Image src="image1.png" />
    <Image src="image2.png" />
  </Image.PreviewGroup>
);
```

### PDF 预览
```tsx
import { Document, Page, pdfjs } from 'react-pdf';

const PDFPreview = ({ url }) => (
  <Document file={url}>
    <Page pageNumber={1} />
  </Document>
);
```

### Markdown 预览
```tsx
import ReactMarkdown from 'react-markdown';

const MarkdownPreview = ({ content }) => (
  <ReactMarkdown>{content}</ReactMarkdown>
);
```

### 代码预览
```tsx
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

const CodePreview = ({ code, language = 'javascript' }) => (
  <SyntaxHighlighter 
    language={language} 
    style={vscDarkPlus}
  >
    {code}
  </SyntaxHighlighter>
);
```

---

## 📦 需要安装的依赖

```bash
# 图片预览（Ant Design 内置）
# 无需安装

# PDF 预览
pnpm add react-pdf pdfjs-dist

# Markdown 预览
pnpm add react-markdown remark-gfm

# 代码高亮
pnpm add react-syntax-highlighter @types/react-syntax-highlighter

# Office 文档预览
pnpm add @microsoft/office-js
```

---

## 🔧 实现计划

1. **第一阶段**: 图片预览（使用 Ant Design）
2. **第二阶段**: Markdown/代码预览
3. **第三阶段**: PDF 预览
4. **第四阶段**: 集成到文件管理器组件

---

*此文件于 2026年4月8日 创建*