#!/usr/bin/env python3
"""迁移 dsh 投影缓存 session_projcache 从 v4 到 v5（适配 CLI 0.1.2-alpha.4）。

背景：
- alpha.4 的 session_projcache domain version 从 4 升到 5，per-record 布局下
  "stamped version 不匹配即静默丢弃"，且 checkpointIdentity 新增必填字段
  isSeeded / inheritedEventCount（zod required）。alpha.3 时代写的 v4 缓存文件
  因此对 alpha.4 全部不可见——会话列表的 projections.values.title 全 null，
  UI 回退显示工作区名。
- 对照磁盘样例确认：v4 与 v5 的 rows（各行 ver/seq/val）结构完全一致，
  唯一差异是文件顶层 version 数字与 identity 的两个新增字段。
- 普通会话 header 不带 isSeeded/inheritedEventCount（默认 false/0），
  故迁移时统一补 false/0；fork 会话若 header 携带真实值会与缓存 identity
  不匹配而被忽略（fail-soft，可重放，无数据损坏）。

用法：python3 scripts/migrate-projcache-v4-v5.py [--dry-run]
"""
import sys, os, json, glob, shutil, time

PROJCACHE_DIR = os.path.expanduser('~/.dsh/storages/session_projcache/sessions')
TS = str(int(time.time() * 1000))


def migrate_one(path, dry):
    with open(path, 'r', encoding='utf-8') as f:
        doc = json.load(f)
    if doc.get('version') != 4:
        return 'skip'
    rec = doc.get('record')
    if not isinstance(rec, dict) or not isinstance(rec.get('identity'), dict):
        return 'malformed'
    ident = rec['identity']
    ident['isSeeded'] = False
    ident['inheritedEventCount'] = 0
    doc['version'] = 5
    if dry:
        return 'would-migrate'
    bak = f'{path}.bak-v4-v5-{TS}'
    shutil.copy2(path, bak)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write('\n')
    return 'migrated'


def main():
    argv = sys.argv[1:]
    dry = '--dry-run' in argv
    files = sorted(glob.glob(os.path.join(PROJCACHE_DIR, '*.json')))
    stats = {}
    for path in files:
        try:
            result = migrate_one(path, dry)
        except Exception as e:
            result = f'error: {e}'
        stats[result] = stats.get(result, 0) + 1
    print('缓存目录:', PROJCACHE_DIR)
    print('文件总数:', len(files))
    for k, v in sorted(stats.items()):
        print(f'  {k}: {v}')
    if dry:
        print('[dry-run] 未写盘')
    else:
        print(f'迁移完成，备份后缀: .bak-v4-v5-{TS}')


if __name__ == '__main__':
    main()
