import { describe, expect, it } from 'vitest'
import { hardDestructiveTargetReason, isCriticalPath, isFilesystemRoot, isProtectedProjectPath, isSensitiveConfigFile, isWithin, normalizePath, resolveRoots } from '../src/paths.js'

describe('normalizePath', () => {
  it('展开 ~ 为家目录', () => {
    expect(normalizePath('~/foo', '/ws', '/home/user')).toBe('/home/user/foo')
  })
  it('相对路径基于 cwd 解析', () => {
    expect(normalizePath('foo/bar', '/ws')).toBe('/ws/foo/bar')
  })
  it('绝对路径规范化', () => {
    expect(normalizePath('/a/../b', '/ws')).toBe('/b')
  })
})

describe('isWithin', () => {
  it('子路径返回 true', () => {
    expect(isWithin('/ws', '/ws/sub/file')).toBe(true)
  })
  it('根路径自身返回 true', () => {
    expect(isWithin('/ws', '/ws')).toBe(true)
  })
  it('越界返回 false', () => {
    expect(isWithin('/ws', '/ws2/file')).toBe(false)
    expect(isWithin('/ws', '/other')).toBe(false)
  })
})

describe('hardDestructiveTargetReason', () => {
  const roots = resolveRoots('/ws', { home: '/home/u', dshHome: '/home/u/.dsh' })
  it('拒绝文件系统根', () => {
    expect(hardDestructiveTargetReason('/', roots)).toContain('filesystem root')
  })
  it('拒绝家目录', () => {
    expect(hardDestructiveTargetReason('~', roots)).toContain('user home root')
  })
  it('拒绝凭据目录', () => {
    expect(hardDestructiveTargetReason('~/.ssh/id_rsa', roots)).toContain('credential')
  })
  it('拒绝 DSH_HOME', () => {
    expect(hardDestructiveTargetReason('/home/u/.dsh/settings.yaml', roots)).toContain('DSH_HOME')
  })
  it('放行工作区路径', () => {
    expect(hardDestructiveTargetReason('/ws/build', roots)).toBeUndefined()
  })
})

describe('isSensitiveConfigFile', () => {
  const roots = resolveRoots('/ws', { home: '/home/u', dshHome: '/home/u/.dsh' })
  it('工作区外的敏感 shell 配置命中', () => {
    expect(isSensitiveConfigFile('/home/u/.zshrc', roots)).toBe(true)
    expect(isSensitiveConfigFile('/home/u/.bashrc', roots)).toBe(true)
    expect(isSensitiveConfigFile('/home/u/.gitconfig', roots)).toBe(true)
  })
  it('工作区外的敏感凭据配置命中', () => {
    expect(isSensitiveConfigFile('/home/u/.env', roots)).toBe(true)
  })
  it('工作区内的敏感配置同样命中', () => {
    expect(isSensitiveConfigFile('/ws/.env', roots)).toBe(true)
  })
  it('普通文件不命中', () => {
    expect(isSensitiveConfigFile('/home/u/notes.txt', roots)).toBe(false)
    expect(isSensitiveConfigFile('/ws/src/index.ts', roots)).toBe(false)
  })
  it('大小写不敏感命中', () => {
    expect(isSensitiveConfigFile('/home/u/.ZSHRC', roots)).toBe(true)
  })
})

describe('isProtectedProjectPath', () => {
  const roots = resolveRoots('/ws', { home: '/home/u', dshHome: '/home/u/.dsh' })
  it('工作区内敏感配置命中', () => {
    expect(isProtectedProjectPath('/ws/.env', roots)).toBe(true)
  })
  it('工作区外路径不命中（交由 isSensitiveConfigFile 单独判定）', () => {
    expect(isProtectedProjectPath('/home/u/.zshrc', roots)).toBe(false)
  })
  it('工作区内普通文件不命中', () => {
    expect(isProtectedProjectPath('/ws/src/a.ts', roots)).toBe(false)
  })
})

describe('isFilesystemRoot', () => {
  it('识别 posix 文件系统根', () => {
    expect(isFilesystemRoot('/')).toBe(true)
    expect(isFilesystemRoot('/ws')).toBe(false)
  })
  it('识别 win32 盘符根', () => {
    expect(isFilesystemRoot('C:\\')).toBe(true)
    expect(isFilesystemRoot('C:\\Windows')).toBe(false)
  })
})

describe('isCriticalPath', () => {
  const roots = resolveRoots('/ws', { home: '/home/u', dshHome: '/home/u/.dsh' })
  it('命中系统目录', () => {
    expect(isCriticalPath('/etc/passwd', roots)).toBe(true)
    expect(isCriticalPath('/usr/bin/node', roots)).toBe(true)
  })
  it('命中凭据目录', () => {
    expect(isCriticalPath('/home/u/.ssh/config', roots)).toBe(true)
    expect(isCriticalPath('/home/u/.aws/credentials', roots)).toBe(true)
  })
  it('命中 win32 关键目录', () => {
    expect(isCriticalPath('C:\\Windows\\System32\\cmd.exe', roots)).toBe(true)
    expect(isCriticalPath('C:\\Program Files\\x', roots)).toBe(true)
  })
  it('普通用户目录不命中', () => {
    expect(isCriticalPath('/home/u/Documents/notes.txt', roots)).toBe(false)
  })
})

describe('normalizePath win32 与 isWithin 风格', () => {
  it('win32 绝对路径规范化为小写', () => {
    expect(normalizePath('C:\\Users\\Alice', '/ws', '/home/u')).toBe('c:\\users\\alice')
  })
  it('跨风格 isWithin 返回 false', () => {
    expect(isWithin('/ws', 'c:\\ws\\x')).toBe(false)
  })
  it('win32 同风格 isWithin 返回 true', () => {
    expect(isWithin('c:\\ws', 'c:\\ws\\sub')).toBe(true)
  })
})
