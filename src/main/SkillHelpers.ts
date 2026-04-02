/**
 * SkillManager 辅助函数
 * 提取重复逻辑，提高代码复用性
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================
// 类型定义
// ============================================

/** 技能定义 */
export interface Skill {
  id: string;
  name: string;
  description: string;
  icon?: string;
  inputSchema?: Record<string, unknown>;
  command?: string;
  version?: string;
  author?: string;
  tags?: string[];
  downloads?: number;
  stars?: number;
  score?: number;
  categories?: string[];
}

/** 技能执行结果 */
export interface SkillResult {
  success: boolean;
  output: string;
  error?: string;
}

/** 权限请求类型 */
export interface PermissionRequest {
  command: string;
  commandType: 'write' | 'delete' | 'create' | 'move' | 'copy' | 'read' | 'unknown';
  targetPath?: string;
  platform: 'win32' | 'darwin' | 'linux';
  requestId: string;
}

/** 权限结果类型 */
export interface PermissionResult {
  requestId: string;
  approved: boolean;
  dontAskAgain: boolean;
}

/** 命令检测结果 */
export interface CommandDetectionResult {
  requiresPermission: boolean;
  commandType: 'write' | 'delete' | 'create' | 'move' | 'copy' | 'read' | 'unknown';
  targetPath?: string;
}

/**
 * 可执行脚本类型
 */
export type ScriptType = '.js' | '.py' | '.bat' | '.sh' | null;

/**
 * 解析可执行命令
 */
export interface ExecutableCommand {
  command: string;
  cwd: string;
  type: ScriptType;
}

// ============================================
// 辅助函数实现
// ============================================

/**
 * 解析 YAML frontmatter
 * 返回解析后的对象和剩余内容
 */
function parseFrontmatter(content: string): { metadata: Record<string, any>; content: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { metadata: {}, content };
  }

  const frontmatterStr = match[1];
  const remainingContent = content.slice(match[0].length);

  // 简单的 YAML 解析（处理基本键值对）
  const metadata: Record<string, any> = {};
  const lines = frontmatterStr.split('\n');

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('metadata:')) continue;

    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      let value = line.slice(colonIndex + 1).trim();

      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      metadata[key] = value;
    }
  }

  return { metadata, content: remainingContent };
}

/**
 * 从技能目录读取技能配置
 */
export function readSkillFromDir(skillPath: string, dirName: string): Skill | null {
  const configPath = path.join(skillPath, 'skill.json');
  const metaPath = path.join(skillPath, '_meta.json');

  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return config;
    } catch (error) {
      console.error(`[SkillHelpers] 解析 skill.json 失败: ${configPath}`, error);
    }
  }

  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      const skill: Skill = {
        id: meta.slug || dirName,
        name: meta.slug ? meta.slug.charAt(0).toUpperCase() + meta.slug.slice(1) : dirName,
        description: `Skill: ${meta.slug || dirName}`,
        version: meta.version || '1.0.0',
        author: meta.ownerId || '',
        tags: []
      };
      return skill;
    } catch (error) {
      console.error(`[SkillHelpers] 解析 _meta.json 失败: ${metaPath}`, error);
    }
  }

  const skillMdPath = path.join(skillPath, 'SKILL.md');
  let name = dirName.split('-').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
  let description = `Skill: ${dirName}`;

  if (fs.existsSync(skillMdPath)) {
    try {
      const content = fs.readFileSync(skillMdPath, 'utf-8');
      const { metadata, content: remainingContent } = parseFrontmatter(content);

      if (metadata.name) {
        name = metadata.name;
      }
      if (metadata.description) {
        description = metadata.description;
      } else {
        const lines = remainingContent.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('---') && !trimmed.startsWith('#')) {
            description = trimmed.substring(0, 200);
            break;
          }
        }
      }
    } catch (error) {
      console.warn(`[SkillHelpers] 读取 SKILL.md 失败: ${skillMdPath}`);
    }
  }

  const hasExecutable = fs.existsSync(path.join(skillPath, 'index.js')) ||
    fs.existsSync(path.join(skillPath, 'run.js')) ||
    fs.existsSync(path.join(skillPath, 'run.sh')) ||
    fs.existsSync(path.join(skillPath, 'run.bat')) ||
    fs.existsSync(path.join(skillPath, 'run.py')) ||
    fs.existsSync(path.join(skillPath, 'search.mjs')) ||
    fs.existsSync(path.join(skillPath, 'extract.mjs')) ||
    fs.existsSync(path.join(skillPath, 'scripts', 'index.js')) ||
    fs.existsSync(path.join(skillPath, 'scripts', 'run.js')) ||
    fs.existsSync(path.join(skillPath, 'scripts', 'run.py'));

  if (hasExecutable || fs.existsSync(skillMdPath)) {
    return {
      id: dirName,
      name: name,
      description: description,
      version: '1.0.0',
      author: '',
      tags: []
    };
  }

  return null;
}

/**
 * 查找并解析可执行命令
 */
export function resolveExecutableCommand(
  skillPath: string,
  query: string
): ExecutableCommand | null {
  const possibleScripts = [
    path.join(skillPath, 'run.sh'),
    path.join(skillPath, 'run.bat'),
    path.join(skillPath, 'index.js'),
    path.join(skillPath, 'run.py'),
    path.join(skillPath, 'scripts', 'run.sh'),
    path.join(skillPath, 'scripts', 'run.bat'),
    path.join(skillPath, 'scripts', 'index.js'),
    path.join(skillPath, 'scripts', 'run.py'),
    path.join(skillPath, 'scripts', 'search.py')
  ];

  for (const script of possibleScripts) {
    if (fs.existsSync(script)) {
      const ext = path.extname(script).toLowerCase() as ScriptType;
      const execCommand = buildExecCommand(script, ext, query, skillPath);

      if (execCommand) {
        return execCommand;
      }
    }
  }

  return null;
}

/**
 * 构建执行命令
 */
function buildExecCommand(
  scriptPath: string,
  ext: ScriptType,
  query: string,
  skillPath: string
): ExecutableCommand | null {
  if (!ext) return null;

  let command: string;
  let cwd = skillPath;

  const isBaiduSearch = scriptPath.includes('baidu-search') && scriptPath.includes('search.py');

  switch (ext) {
    case '.js':
      command = `node "${scriptPath}" "${query}"`;
      break;
    case '.py':
      if (isBaiduSearch) {
        const jsonArg = JSON.stringify({ query: query });
        const tempFile = path.join(os.tmpdir(), `baidu_search_${Date.now()}.json`);
        fs.writeFileSync(tempFile, jsonArg, 'utf-8');
        command = `python "${scriptPath}" "${tempFile}"`;
        cwd = path.join(skillPath, 'scripts');
      } else {
        command = `python "${scriptPath}" "${query}"`;
      }
      break;
    case '.bat':
      command = `cmd /c "${scriptPath}" "${query}"`;
      break;
    case '.sh':
      command = `bash "${scriptPath}" "${query}"`;
      break;
    default:
      return null;
  }

  return { command, cwd, type: ext };
}

/**
 * 安全删除目录
 */
export function safeRemoveDirectory(dirPath: string): boolean {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
      return true;
    }
    return false;
  } catch (error) {
    console.error(`[SkillHelpers] 删除目录失败: ${dirPath}`, error);
    return false;
  }
}

/**
 * 清理输出，移除潜在的恶意脚本、HTML标签和可疑内容
 */
export function sanitizeOutput(output: string): string {
  if (!output) return '';

  let sanitized = output;

  sanitized = sanitized.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  sanitized = sanitized.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '');
  sanitized = sanitized.replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '');
  sanitized = sanitized.replace(/<embed[^>]*>/gi, '');
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/javascript:/gi, '');
  sanitized = sanitized.replace(/data:/gi, '');
  sanitized = sanitized.replace(/src\s*=\s*["']?http:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}[^"'\s>]+["']?/gi, '');
  sanitized = sanitized.replace(/href\s*=\s*["']?http:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}[^"'\s>]+["']?/gi, '');
  sanitized = sanitized.replace(/^\s*$/gm, '');

  return sanitized.trim();
}

/**
 * 从 SKILL.md 提取帮助文本
 */
export function extractHelpText(content: string): string {
  const lines = content.split('\n');
  const helpLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('---')) continue;
    if (line.includes('```')) continue;
    if (line.startsWith('# ')) {
      helpLines.push(line);
    }
    if (line.includes('`gh ') || line.includes('`curl ')) {
      helpLines.push(line.trim());
    }
  }

  return helpLines.slice(0, 20).join('\n');
}