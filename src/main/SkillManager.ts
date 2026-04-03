import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as os from 'os';
import AdmZip from 'adm-zip';
import { app } from 'electron';
import {
  readSkillFromDir,
  resolveExecutableCommand,
  safeRemoveDirectory,
  sanitizeOutput,
  extractHelpText,
  type Skill,
  type SkillResult,
  type CommandDetectionResult
} from './SkillHelpers';

// 使用 __dirname 获取应用根目录
const getSkillsDir = () => {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'skills');
  }
  return path.join(__dirname, '..', '..', 'skills');
};

const SKILLS_DIR = getSkillsDir();

// SkillHub API 配置
const SKILLHUB_API = 'https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com';

// 超时配置
const SKILL_DOWNLOAD_TIMEOUT = 600000; // 10分钟
const HTTP_REQUEST_TIMEOUT = 300000;
const EXECUTE_TIMEOUT = 60000;

// 开发环境标志
const isDev = process.env.NODE_ENV === 'development';

function devLog(...args: any[]): void {
  if (isDev) {
    console.log(...args);
  }
}

function devError(...args: any[]): void {
  if (isDev) {
    console.error(...args);
  }
}

/**
 * 使用 Node.js https 请求获取 URL 内容
 */
function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', (err) => {
      devError(`[SkillManager] fetchUrl 错误: ${err.message}`);
      reject(err);
    });
    req.setTimeout(HTTP_REQUEST_TIMEOUT, () => {
      req.destroy();
      reject(new Error(`Request timeout after ${HTTP_REQUEST_TIMEOUT}ms`));
    });
  });
}

/**
 * 获取系统 PATH 环境变量
 */
function getSystemPath(): string {
  if (process.platform === 'win32') {
    return process.env.PATH ||
      'C:\\Windows\\system32;C:\\Windows;C:\\Windows\\System32\\WindowsPowerShell\\v1.0;' +
      'C:\\Program Files\\nodejs;' +
      (process.env.APPDATA ? path.join(process.env.APPDATA, 'npm') : '');
  }
  return process.env.PATH || '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';
}

/**
 * 执行命令并返回结果
 */
function executeCommand(
  command: string,
  options: { cwd?: string; timeout?: number } = {}
): Promise<{ stdout: string; stderr: string; code: number | null; error?: Error }> {
  return new Promise((resolve) => {
    const spawnOptions = {
      cwd: options.cwd,
      shell: true,
      env: {
        ...process.env,
        PATH: getSystemPath()
      }
    };

    const timeout = options.timeout || EXECUTE_TIMEOUT;
    const child = spawn(command, [], spawnOptions);
    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      child.kill();
      resolve({ stdout, stderr, code: null, error: new Error('Command timeout') });
    }, timeout);

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: null, error });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
  });
}

/**
 * 技能管理服务
 */
export class SkillManager {
  /**
   * 检测命令是否需要权限确认
   */
  detectCommandType(command: string): CommandDetectionResult {
    const platform = process.platform;
    const isWindows = platform === 'win32';
    const cmd = command.toLowerCase().trim();

    const writePatterns = isWindows
      ? [/^-?\s*echo\s+/i, /set-content\s+/i, /out-file/i, /^\s*>/, /^\s*>>/]
      : [/^-?\s*echo\s+/i, /^-?\s*printf\s+/i, /tee\s+/i, /^\s*>/, /^\s*>>/, /\|\s*tee/i];

    const deletePatterns = isWindows
      ? [/\bremove-item\b/i, /\bdel\s+/i, /\brm\s+/i, /\brmdir\b/i, /\bdel\b/i]
      : [/\brm\s+/i, /\brm\s+-[rfFR]\w*/i, /\brmdir\b/i, /\btrash\b/i, /\brm\s+-rf\b/i, /\brm\s+-fr\b/i, /\brm\b/i];

    const createPatterns = isWindows
      ? [/\bnew-item\s+.*-itemtype\s+directory/i, /\bmkdir\s+/i]
      : [/\bmkdir\s+-?p\b/i];

    const movePatterns = isWindows
      ? [/\bmove-item\b/i, /\brename-item\b/i]
      : [/\bmv\s+/i, /\brename\s+/i];

    const copyPatterns = isWindows
      ? [/\bcopy-item\b.*-force/i]
      : [/\bcp\s+-[fF]\b/i];

    if (writePatterns.some(p => p.test(cmd))) {
      return { requiresPermission: true, commandType: 'write', targetPath: this.extractTargetPath(command) };
    }
    if (deletePatterns.some(p => p.test(cmd))) {
      return { requiresPermission: true, commandType: 'delete', targetPath: this.extractTargetPath(command) };
    }
    if (createPatterns.some(p => p.test(cmd))) {
      return { requiresPermission: true, commandType: 'create', targetPath: this.extractTargetPath(command) };
    }
    if (movePatterns.some(p => p.test(cmd))) {
      return { requiresPermission: true, commandType: 'move', targetPath: this.extractTargetPath(command) };
    }
    if (copyPatterns.some(p => p.test(cmd))) {
      return { requiresPermission: true, commandType: 'copy', targetPath: this.extractTargetPath(command) };
    }

    return { requiresPermission: false, commandType: 'unknown' };
  }

  private extractTargetPath(command: string): string | undefined {
    try {
      const quotedMatch = command.match(/"([^"]+)"/) || command.match(/'([^']+)'/);
      if (quotedMatch) {
        return quotedMatch[1];
      }

      const redirectMatch = command.match(/>+["\s]*([^\s"']+)/);
      if (redirectMatch) {
        return redirectMatch[1];
      }

      const cmdMatch = command.match(/^\s*(echo|printf|tee|rm|mkdir|mv|cp|del|remove-item|copy-item|move-item|rename-item)\s+["\s]*([^\s"']+)/i);
      if (cmdMatch && cmdMatch[2]) {
        return cmdMatch[2];
      }
    } catch {
      // 忽略解析错误
    }
    return undefined;
  }

  /**
   * 执行系统命令
   */
  async executeSystemCommand(command: string, timeout: number = 60000): Promise<SkillResult> {
    const platform = process.platform;
    const platformName = platform === 'win32' ? 'Windows' : (platform === 'darwin' ? 'macOS' : 'Linux');
    devLog(`[SkillManager] executeSystemCommand (${platformName}): ${command}`);

    if (!command || typeof command !== 'string') {
      return { success: false, output: '', error: '无效的命令' };
    }

    const trimmedCommand = command.trim().slice(0, 5000);

    try {
      const result = await executeCommand(trimmedCommand, { timeout });

      if (result.error) {
        return { success: false, output: result.stdout, error: result.error.message };
      }

      if (result.code !== 0) {
        return {
          success: false,
          output: result.stdout,
          error: result.stderr || `命令执行失败，退出码: ${result.code}`
        };
      }

      return {
        success: true,
        output: result.stdout || result.stderr || '命令执行成功'
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      devError('[SkillManager] executeSystemCommand 错误:', errorMessage);
      return { success: false, output: '', error: errorMessage };
    }
  }

  /**
   * 从 SkillHub 获取精选技能列表
   */
  async getSkillHubSkills(limit: number = 50): Promise<Skill[]> {
    try {
      devLog(`正在从 SkillHub 获取精选技能列表 (前 ${limit} 个)...`);

      const url = `${SKILLHUB_API}/skills.json`;
      const stdout = await fetchUrl(url);

      const data = JSON.parse(stdout);
      const skillsList = data.skills || [];

      const sortedSkills = skillsList
        .filter((s: any) => s.rank >= 4)
        .sort((a: any, b: any) => (a.rank || 0) - (b.rank || 0))
        .slice(0, limit - 3);

      const skills: Skill[] = sortedSkills.map((item: any) => ({
        id: item.slug,
        name: item.name,
        description: item.description || '',
        icon: '🔧',
        version: item.version || '1.0.0',
        author: '',
        tags: item.categories || [],
        downloads: item.downloads || 0,
        stars: item.stars || 0,
        score: item.score || 0,
        categories: item.categories || []
      }));

      devLog(`获取到 ${skills.length} 个精选技能`);
      return skills;
    } catch (error) {
      devError('获取技能列表失败:', error);
      return [];
    }
  }

  /**
   * 在 SkillHub 搜索技能
   */
  async searchSkillHubSkills(query: string): Promise<Skill[]> {
    if (!query.trim()) {
      return this.getSkillHubSkills(50);
    }

    try {
      devLog(`正在 SkillHub 搜索: "${query}"...`);

      const searchUrl = `https://lightmake.site/api/v1/search?q=${encodeURIComponent(query)}`;
      const stdout = await fetchUrl(searchUrl);

      const data = JSON.parse(stdout);
      const skillsList = data.results || data.skills || [];

      const skills: Skill[] = skillsList.map((item: any) => ({
        id: item.slug || item.id,
        name: item.displayName || item.name,
        description: item.summary || item.description || '',
        icon: item.icon || '🔧',
        version: item.version || '1.0.0',
        author: item.author || '',
        tags: item.categories || item.tags || [],
        downloads: item.downloads || 0,
        stars: item.stars || 0,
        score: item.score || 0,
        categories: item.categories || []
      }));

      devLog(`搜索 "${query}" 找到 ${skills.length} 个技能`);
      return skills;
    } catch (error) {
      devError('搜索技能失败:', error);
      return this.fallbackLocalSearch(query);
    }
  }

  private async fallbackLocalSearch(query: string): Promise<Skill[]> {
    devLog(`使用本地搜索回退: "${query}"`);
    const allSkills = await this.getSkillHubSkills(50);
    const lowerQuery = query.toLowerCase();
    return allSkills.filter(skill =>
      skill.name.toLowerCase().includes(lowerQuery) ||
      skill.description.toLowerCase().includes(lowerQuery) ||
      (skill.tags && skill.tags.some((tag: string) => tag.toLowerCase().includes(lowerQuery)))
    );
  }

  /**
   * 检查技能是否存在于本地
   */
  async checkSkill(skillId: string): Promise<boolean> {
    if (!fs.existsSync(SKILLS_DIR)) {
      fs.mkdirSync(SKILLS_DIR, { recursive: true });
      return false;
    }
    const skillPath = path.join(SKILLS_DIR, skillId);
    return fs.existsSync(skillPath);
  }

  /**
   * 从 SkillHub 下载技能
   */
  async downloadSkill(skillId: string, maxRetries: number = 3): Promise<boolean> {
    if (!fs.existsSync(SKILLS_DIR)) {
      devLog(`[SkillManager] 创建 skills 目录: ${SKILLS_DIR}`);
      fs.mkdirSync(SKILLS_DIR, { recursive: true });
    }

    const skillPath = path.join(SKILLS_DIR, skillId);
    if (fs.existsSync(skillPath)) {
      devLog(`[SkillManager] 技能 ${skillId} 已安装`);
      return true;
    }

    return this.doDownloadSkill(skillId, maxRetries);
  }

  private async doDownloadSkill(skillId: string, retriesLeft: number): Promise<boolean> {
    return new Promise((resolve) => {
      devLog(`[SkillManager] 正在下载技能: ${skillId}, 剩余重试次数: ${retriesLeft}`);

      const workingDir = app.isPackaged
        ? app.getPath('userData')
        : path.join(__dirname, '..', '..');

      let command = `npx clawhub@latest install ${skillId} --force`;
      devLog(`[SkillManager] 执行命令: ${command}`);

      const spawnOptions = {
        cwd: workingDir,
        shell: true,
        env: {
          ...process.env,
          PATH: getSystemPath()
        }
      };

      const child = spawn(command, [], spawnOptions);
      let stdout = '';
      let stderr = '';

      const timeout = setTimeout(() => {
        child.kill();
        devLog(`[SkillManager] 技能下载超时 (10分钟)`);
        resolve(false);
      }, SKILL_DOWNLOAD_TIMEOUT);

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        devLog(`[SkillManager] spawn 错误: ${error.message}`);
        resolve(false);
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        devLog(`[SkillManager] 命令执行完成, exit code: ${code}`);

        const output = stdout + stderr;

        if (output.includes('Already installed') || output.includes('already installed')) {
          devLog(`[SkillManager] 技能 ${skillId} 已安装`);
          resolve(true);
          return;
        }

        if (output.includes('Rate limit') || output.includes('rate limit')) {
          const waitMatch = output.match(/retry in (\d+)s/i);
          const waitSeconds = waitMatch ? parseInt(waitMatch[1]) : 10;

          if (retriesLeft > 0) {
            devLog(`[SkillManager] 遇到速率限制，等待 ${waitSeconds} 秒后重试...`);
            setTimeout(() => {
              this.doDownloadSkill(skillId, retriesLeft - 1).then(resolve);
            }, waitSeconds * 1000);
          } else {
            devError(`[SkillManager] 技能下载失败: 速率限制，已达最大重试次数`);
            resolve(false);
          }
          return;
        }

        if (output.includes('Skill not found') || output.includes('skill not found') || output.includes('not found in')) {
          devError(`[SkillManager] 技能 ${skillId} 在 SkillHub 上不存在，尝试直接下载...`);
          this.downloadSkillDirect(skillId)
            .then(resolve)
            .catch((err) => {
              devError('[SkillManager] 直接下载失败:', err);
              resolve(false);
            });
          return;
        }

        if (code !== 0) {
          if (code === 127) {
            devLog('[SkillManager] npx/curl 不可用，尝试直接下载...');
            this.downloadSkillDirect(skillId)
              .then(resolve)
              .catch((err) => {
                devError('[SkillManager] 直接下载失败:', err);
                resolve(false);
              });
            return;
          }

          if (output.includes('ERR_') || output.includes('Error:')) {
            devError(`[SkillManager] npm/npx 错误: ${output.substring(0, 500)}`);
            resolve(false);
            return;
          }
          const newSkillPath = path.join(SKILLS_DIR, skillId);
          if (fs.existsSync(newSkillPath)) {
            devLog(`[SkillManager] 技能 ${skillId} 安装成功（目录存在）`);
            resolve(true);
            return;
          }
          devError(`[SkillManager] 技能下载失败, exit code: ${code}`);
          resolve(false);
          return;
        }

        const newSkillPath = path.join(SKILLS_DIR, skillId);
        if (fs.existsSync(newSkillPath)) {
          devLog(`[SkillManager] 技能 ${skillId} 安装成功`);
          resolve(true);
        } else {
          devLog(`[SkillManager] 技能目录不存在，可能安装失败: ${newSkillPath}`);
          resolve(false);
        }
      });
    });
  }

  /**
   * 直接通过 HTTP 下载技能
   */
  private async downloadSkillDirect(skillId: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      devLog(`[SkillManager] 直接下载技能: ${skillId}`);

      const downloadUrl = `https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com/skills/${skillId}.zip`;
      const tempZipPath = path.join(os.tmpdir(), `${skillId}.zip`);
      const extractDir = SKILLS_DIR;

      devLog(`[SkillManager] 下载 URL: ${downloadUrl}`);

      if (!fs.existsSync(extractDir)) {
        fs.mkdirSync(extractDir, { recursive: true });
      }

      const command = `curl -L -o "${tempZipPath}" "${downloadUrl}"`;
      devLog(`[SkillManager] 执行命令: ${command}`);

      const spawnOptions = {
        shell: true,
        env: {
          ...process.env,
          PATH: getSystemPath()
        }
      };

      const child = spawn(command, [], spawnOptions);
      let stdout = '';
      let stderr = '';

      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error('下载超时'));
      }, 300000);

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        devError(`[SkillManager] curl spawn 错误: ${error.message}`);
        reject(error);
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        devLog(`[SkillManager] curl 完成, exit code: ${code}`);

        if (code !== 0) {
          devError(`[SkillManager] curl 失败, stderr: ${stderr}`);
          reject(new Error(`curl 失败, exit code: ${code}`));
          return;
        }

        if (!fs.existsSync(tempZipPath)) {
          reject(new Error('下载的文件不存在'));
          return;
        }

        const stats = fs.statSync(tempZipPath);
        if (stats.size < 100) {
          const content = fs.readFileSync(tempZipPath, 'utf-8');
          devError(`[SkillManager] 下载的文件太小: ${stats.size} bytes, 内容: ${content.substring(0, 200)}`);
          reject(new Error('下载的文件太小，可能是 404'));
          return;
        }

        devLog(`[SkillManager] 下载成功, 文件大小: ${stats.size} bytes`);

        this.extractSkillZip(tempZipPath, extractDir, skillId)
          .then(() => {
            try {
              fs.unlinkSync(tempZipPath);
            } catch (e) {
              devLog(`[SkillManager] 清理临时文件失败: ${e}`);
            }
            resolve(true);
          })
          .catch(reject);
      });
    });
  }

  /**
   * 解压技能 zip 文件
   */
  private async extractSkillZip(zipPath: string, extractDir: string, skillId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      devLog(`[SkillManager] 解压文件: ${zipPath} 到 ${extractDir}`);

      try {
        const zip = new AdmZip(zipPath);
        const zipEntries = zip.getEntries();

        devLog(`[SkillManager] zip 包内文件列表 (前10个):`);
        zipEntries.slice(0, 10).forEach(entry => {
          devLog(`  - ${entry.entryName} (isDirectory: ${entry.isDirectory})`);
        });

        const tempExtractDir = path.join(extractDir, `.tmp-${skillId}-${Date.now()}`);
        devLog(`[SkillManager] 解压到临时目录: ${tempExtractDir}`);

        if (!fs.existsSync(tempExtractDir)) {
          fs.mkdirSync(tempExtractDir, { recursive: true });
        }

        zip.extractAllTo(tempExtractDir, true);
        devLog(`[SkillManager] adm-zip 解压完成`);

        const extractedItems = fs.readdirSync(tempExtractDir);
        devLog(`[SkillManager] 解压后的内容: ${extractedItems.join(', ')}`);

        const finalSkillPath = path.join(extractDir, skillId);

        const cleanup = () => {
          try {
            if (fs.existsSync(tempExtractDir)) {
              fs.rmSync(tempExtractDir, { recursive: true, force: true });
              devLog(`[SkillManager] 清理临时目录: ${tempExtractDir}`);
            }
          } catch (e) {
            devLog(`[SkillManager] 清理临时目录失败: ${e}`);
          }
        };

        const moveToFinal = (srcPath: string) => {
          if (fs.existsSync(finalSkillPath)) {
            devLog(`[SkillManager] 目标目录已存在，删除: ${finalSkillPath}`);
            fs.rmSync(finalSkillPath, { recursive: true, force: true });
          }

          const srcStat = fs.statSync(srcPath);
          if (srcStat.isDirectory()) {
            const srcItems = fs.readdirSync(srcPath);
            if (srcItems.length === 1 && srcItems[0] === skillId) {
              const nestedPath = path.join(srcPath, skillId);
              if (fs.existsSync(nestedPath) && fs.statSync(nestedPath).isDirectory()) {
                devLog(`[SkillManager] 检测到嵌套目录，提取内容: ${nestedPath}`);
                fs.renameSync(nestedPath, finalSkillPath);
                fs.rmSync(srcPath, { recursive: true, force: true });
                devLog(`[SkillManager] 移动到最终位置: ${finalSkillPath}`);
                return;
              }
            }
          }

          fs.renameSync(srcPath, finalSkillPath);
          devLog(`[SkillManager] 移动到最终位置: ${finalSkillPath}`);
        };

        const directSkillPath = path.join(tempExtractDir, skillId);
        if (fs.existsSync(directSkillPath)) {
          devLog(`[SkillManager] 找到直接匹配的目录: ${skillId}`);
          moveToFinal(directSkillPath);
          cleanup();
          resolve();
          return;
        }

        const firstEntry = zipEntries[0];
        if (firstEntry && firstEntry.isDirectory) {
          const rootDir = firstEntry.entryName.replace(/\/$/, '');
          const rootPath = path.join(tempExtractDir, rootDir);

          if (fs.existsSync(rootPath)) {
            devLog(`[SkillManager] 找到 zip 根目录: ${rootDir}`);
            moveToFinal(rootPath);
            cleanup();
            resolve();
            return;
          }
        }

        const subDirs = extractedItems.filter(item => {
          const itemPath = path.join(tempExtractDir, item);
          return fs.statSync(itemPath).isDirectory();
        });

        if (subDirs.length === 1) {
          const singleDir = subDirs[0];
          const singleDirPath = path.join(tempExtractDir, singleDir);
          devLog(`[SkillManager] 只有一个子目录: ${singleDir}`);
          moveToFinal(singleDirPath);
          cleanup();
          resolve();
          return;
        }

        if (extractedItems.includes('SKILL.md')) {
          devLog(`[SkillManager] zip 包内直接包含 SKILL.md，移动整个临时目录内容`);
          moveToFinal(tempExtractDir);
          resolve();
          return;
        }

        for (const item of subDirs) {
          const itemPath = path.join(tempExtractDir, item);
          const skillMdPath = path.join(itemPath, 'SKILL.md');
          if (fs.existsSync(skillMdPath)) {
            devLog(`[SkillManager] 找到包含 SKILL.md 的目录: ${item}`);
            moveToFinal(itemPath);
            cleanup();
            resolve();
            return;
          }
        }

        devError(`[SkillManager] 无法找到有效的技能目录`);
        cleanup();
        reject(new Error(`技能目录不存在: ${finalSkillPath}。解压后的内容: ${extractedItems.join(', ')}`));
      } catch (error) {
        devError(`[SkillManager] adm-zip 解压错误: ${error}`);
        reject(error);
      }
    });
  }

  /**
   * 修复嵌套的 skills 目录
   */
  private fixNestedSkillsDir(): void {
    if (!fs.existsSync(SKILLS_DIR)) return;

    try {
      const dirs = fs.readdirSync(SKILLS_DIR);

      for (const dir of dirs) {
        const dirPath = path.join(SKILLS_DIR, dir);
        const stat = fs.statSync(dirPath);

        if (stat.isDirectory()) {
          const nestedSkillsPath = path.join(dirPath, 'skills');
          if (fs.existsSync(nestedSkillsPath) && fs.statSync(nestedSkillsPath).isDirectory()) {
            devLog(`[SkillManager] 发现嵌套的 skills 目录: ${nestedSkillsPath}`);

            const nestedItems = fs.readdirSync(nestedSkillsPath);
            for (const item of nestedItems) {
              const srcPath = path.join(nestedSkillsPath, item);
              const destPath = path.join(dirPath, item);

              if (fs.existsSync(destPath)) {
                fs.rmSync(destPath, { recursive: true, force: true });
              }

              fs.renameSync(srcPath, destPath);
              devLog(`[SkillManager] 移动: ${srcPath} -> ${destPath}`);
            }

            fs.rmSync(nestedSkillsPath, { recursive: true, force: true });
            devLog(`[SkillManager] 已修复嵌套目录: ${dirPath}`);
          }
        }
      }
    } catch (error) {
      devError(`[SkillManager] 修复嵌套目录失败:`, error);
    }
  }

  /**
   * 获取本地技能列表
   */
  async getLocalSkills(): Promise<Skill[]> {
    this.fixNestedSkillsDir();

    if (!fs.existsSync(SKILLS_DIR)) {
      devLog(`[SkillManager] 创建 skills 目录: ${SKILLS_DIR}`);
      fs.mkdirSync(SKILLS_DIR, { recursive: true });
      return [];
    }

    const skills: Skill[] = [];
    const dirs = fs.readdirSync(SKILLS_DIR);

    for (const dir of dirs) {
      const skillPath = path.join(SKILLS_DIR, dir);
      const stat = fs.statSync(skillPath);

      if (stat.isDirectory()) {
        const skill = readSkillFromDir(skillPath, dir);
        if (skill) {
          skills.push(skill);
        }
      }
    }

    return skills;
  }

  /**
   * 删除本地技能
   */
  async deleteSkill(skillId: string): Promise<boolean> {
    if (!fs.existsSync(SKILLS_DIR)) {
      return false;
    }

    const skillPath = path.join(SKILLS_DIR, skillId);

    if (!fs.existsSync(skillPath)) {
      return false;
    }

    const success = safeRemoveDirectory(skillPath);
    if (!success) {
      devError(`[SkillManager] 删除技能失败: ${skillId}`);
    }
    return success;
  }

  /**
   * 执行技能
   */
  async executeSkill(skillId: string, query: string): Promise<SkillResult> {
    devLog(`[SkillManager] executeSkill called: skillId=${skillId}, query=${query}`);

    return new Promise((resolve) => {
      const skillPath = path.join(SKILLS_DIR, skillId);
      devLog(`[SkillManager] skillPath: ${skillPath}`);

      if (!fs.existsSync(skillPath)) {
        devLog(`[SkillManager] 技能目录不存在: ${skillPath}`);
        resolve({
          success: false,
          output: '',
          error: `技能 ${skillId} 不存在`
        });
        return;
      }

      const execCommand = resolveExecutableCommand(skillPath, query);

      if (!execCommand) {
        const skillMdPath = path.join(skillPath, 'SKILL.md');
        devLog(`[SkillManager] 没有可执行脚本，检查 SKILL.md: ${skillMdPath}`);

        if (fs.existsSync(skillMdPath)) {
          devLog(`[SkillManager] 找到 SKILL.md，尝试解析并执行...`);
          this.executeFromSkillDoc(skillPath, query)
            .then(resolve)
            .catch(err => resolve({ success: false, output: '', error: err.message }));
          return;
        }

        devLog(`[SkillManager] SKILL.md 不存在`);
        resolve({
          success: false,
          output: '',
          error: `技能 ${skillId} 没有可执行脚本 (run.sh/run.bat/index.js/run.py)`
        });
        return;
      }

      devLog(`[SkillManager] 找到可执行脚本: ${execCommand.command}`);

      const spawnOptions = {
        cwd: execCommand.cwd,
        shell: true,
        env: {
          ...process.env,
          PATH: getSystemPath()
        }
      };

      const timeout = setTimeout(() => {
        resolve({
          success: false,
          output: '',
          error: `技能执行超时 (60秒)`
        });
      }, 60000);

      const child = spawn(execCommand.command, [], spawnOptions);
      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        devLog(`[SkillManager] spawn 错误: ${error.message}`);

        resolve({
          success: false,
          output: stdout,
          error: error.message
        });
      });

      child.on('close', (code) => {
        clearTimeout(timeout);

        if (code !== 0) {
          const errorMsg = stderr || `exit code: ${code}`;
          resolve({
            success: false,
            output: stdout,
            error: errorMsg
          });
          return;
        }

        const sanitizedOutput = sanitizeOutput(stdout || stderr);
        resolve({
          success: true,
          output: sanitizedOutput
        });
      });
    });
  }

  /**
   * 从 SKILL.md 文档中提取并执行命令
   */
  private async executeFromSkillDoc(skillPath: string, query: string): Promise<SkillResult> {
    devLog(`[SkillManager] executeFromSkillDoc: skillPath=${skillPath}, query=${query}`);

    const skillMdPath = path.join(skillPath, 'SKILL.md');
    const content = fs.readFileSync(skillMdPath, 'utf-8');

    const queryParam = query.trim();
    devLog(`[SkillManager] 提取查询参数: ${queryParam}`);

    // 尝试查找 curl 命令
    const curlMatch = content.match(/curl\s+-s\s+"([^"]*(?:wttr\.in|open-meteo\.com)[^"]*)"/);
    if (curlMatch) {
      let url = curlMatch[1];
      devLog(`[SkillManager] 原始 URL: ${url}`);

      const city = queryParam || 'Beijing';
      const cityEncoded = city.replace(/ /g, '+');

      url = url.replace(/wttr\.in\/[a-zA-Z+]+/g, `wttr.in/${cityEncoded}`);
      url = url.replace(/(?:^|[?&])(?:q|city|location)=[a-zA-Z+]+/g, `${cityEncoded}`);

      devLog(`[SkillManager] 执行 URL: ${url}`);

      const curlPath = process.platform === 'win32' ? 'curl.exe' : 'curl';

      return new Promise((resolve) => {
        const execCmd = `${curlPath} -s --noproxy "*" "${url}"`;
        devLog(`[SkillManager] 执行命令: ${execCmd}`);

        const spawnOptions = {
          shell: true,
          env: {
            ...process.env,
            PATH: getSystemPath()
          }
        };

        const child = spawn(execCmd, [], spawnOptions);
        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('error', (error) => {
          devLog(`[SkillManager] spawn 错误: ${error.message}`);
          resolve({ success: false, output: '', error: error.message });
        });

        child.on('close', (code) => {
          if (code !== 0) {
            devLog(`[SkillManager] 执行错误, exit code: ${code}`);
            resolve({ success: false, output: '', error: stderr || `exit code: ${code}` });
            return;
          }
          devLog(`[SkillManager] 执行成功, stdout: ${stdout.substring(0, 100)}`);
          const sanitizedOutput = sanitizeOutput(stdout || stderr);
          resolve({ success: true, output: sanitizedOutput });
        });
      });
    }

    // 尝试查找 gh CLI 命令
    const ghMatch = content.match(/gh\s+\w+(?:\s+[^\n`]+)?/);
    if (ghMatch && queryParam) {
      const ghCommand = this.buildGhCommand(content, queryParam);
      if (ghCommand) {
        devLog(`[SkillManager] 执行 gh 命令: ${ghCommand}`);

        const spawnOptions = {
          shell: true,
          env: {
            ...process.env,
            PATH: getSystemPath()
          }
        };

        return new Promise((resolve) => {
          const child = spawn(ghCommand, [], spawnOptions);
          let stdout = '';
          let stderr = '';

          child.stdout?.on('data', (data) => {
            stdout += data.toString();
          });

          child.stderr?.on('data', (data) => {
            stderr += data.toString();
          });

          child.on('error', (error) => {
            if (error.message.includes('not found') || error.message.includes('not recognized')) {
              resolve({
                success: false,
                output: '',
                error: `GitHub CLI (gh) 未安装。请访问 https://cli.github.com 安装。`
              });
              return;
            }
            resolve({ success: false, output: stdout, error: error.message });
          });

          child.on('close', (code) => {
            if (code !== 0) {
              resolve({ success: false, output: stdout, error: stderr || `exit code: ${code}` });
              return;
            }
            const sanitizedOutput = sanitizeOutput(stdout || stderr);
            resolve({ success: true, output: sanitizedOutput });
          });
        });
      }
    }

    const helpText = extractHelpText(content);
    return {
      success: true,
      output: helpText || '此技能需要安装对应的 CLI 工具才能使用。\n\n请查看 SKILL.md 了解使用方法。',
      error: ''
    };
  }

  /**
   * 从 SKILL.md 构建 gh 命令
   */
  private buildGhCommand(content: string, query: string): string | null {
    const repoMatch = query.match(/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)/);

    if (repoMatch) {
      const owner = repoMatch[1];
      const repo = repoMatch[2];

      const lines = content.split('\n');
      for (const line of lines) {
        if (line.includes('gh ') && (line.includes('list') || line.includes('view'))) {
          const cmdMatch = line.match(/`gh\s+(\w+)([^`]+)`/);
          if (cmdMatch) {
            const subcmd = cmdMatch[1];
            const args = cmdMatch[2].replace(/owner\/repo/g, `${owner}/${repo}`).trim();
            return `gh ${subcmd} ${args}`;
          }
        }
      }
    }

    return null;
  }

  /**
   * 确保技能存在，如不存在则下载
   */
  async ensureSkill(skillId: string): Promise<boolean> {
    const exists = await this.checkSkill(skillId);
    if (exists) {
      return true;
    }
    return await this.downloadSkill(skillId);
  }
}

export const skillManager = new SkillManager();