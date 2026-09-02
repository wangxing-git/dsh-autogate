#!/usr/bin/env python3
"""迁移历史会话的 agentPreset：rc 时代的 "code" → alpha.3 的 "ptc"。

背景：
- dsh CLI 升 0.1.2-alpha.3 后，agent-presets 内置预设变为 standard/ptc/minimal/cordis，
  rc 时代的默认预设 "code" 被移除且无迁移逻辑。
- 历史会话 header 里存有 "agentPreset":"code"，resume 时报
  agent-presets: preset "code" not found，会话无法继续。
- 迁移目标选用 ptc 预设（用户指定）。

本脚本做法（与官方 encodeMaterialization 同构）：
1. 流式解压读回全部字节，header 行为第一个 frame、其余为 body frame。
2. 仅对 header 行做字符串级替换 "agentPreset":"code" → "agentPreset":"ptc"，
   其余字节逐字节保留。
3. 重新压缩：header 行单独一个 zstd frame（checksum=1），body 单独一个 frame，
   二者拼接。

用法：python3 scripts/migrate-agent-preset.py [--dry-run] [--limit N]
"""
import sys, os, json, shutil, time, glob
import zstandard

SESSIONS_ROOT = os.path.expanduser('~/.dsh/sessions')
OLD = b'"agentPreset":"code"'
NEW = b'"agentPreset":"ptc"'
TS = str(int(time.time() * 1000))


def decompress(path):
    with open(path, 'rb') as f:
        return zstandard.ZstdDecompressor().stream_reader(f).read()


def recompress(header_line, body):
    cctx = zstandard.ZstdCompressor(
        write_checksum=True, write_content_size=True, level=3,
    )
    return cctx.compress(header_line) + cctx.compress(body)


def scan(targets):
    """返回 [(path, header, body, 是否需迁移, body 中 agent-preset/selected 值集合)]"""
    results = []
    for path in targets:
        try:
            data = decompress(path)
        except Exception as e:
            print('  解压失败，跳过:', path, e)
            continue
        idx = data.find(b'\n')
        if idx == -1:
            print('  无换行符，跳过:', path)
            continue
        header_line = data[:idx + 1]
        body = data[idx + 1:]
        needs = OLD in header_line
        selected = set()
        if needs:
            for line in body.split(b'\n'):
                if b'"agent-preset/selected"' not in line:
                    continue
                try:
                    obj = json.loads(line)
                except Exception:
                    continue
                p = (obj.get('data') or {}).get('agentPreset')
                if p:
                    selected.add(p)
        results.append((path, header_line, body, needs, selected))
    return results


def main():
    argv = sys.argv[1:]
    dry = '--dry-run' in argv
    limit = None
    if '--limit' in argv:
        limit = int(argv[argv.index('--limit') + 1])

    targets = sorted(glob.glob(SESSIONS_ROOT + '/*/session-*/session.jsonl.zstd'))
    if limit:
        targets = targets[:limit]
    print('扫描会话数:', len(targets))

    results = scan(targets)
    need = [r for r in results if r[3]]
    print('需迁移（agentPreset=code）:', len(need))
    # body 中的 selected 事件值分布，用于排查迁移后仍 resolve 失败的会话
    body_selected = {}
    for _, _, _, _, selected in need:
        for s in selected:
            body_selected[s] = body_selected.get(s, 0) + 1
    if body_selected:
        print('body 中 agent-preset/selected 值分布:', body_selected)

    if dry:
        print('[dry-run] 未写盘')
        return

    changed = 0
    for path, header_line, body, _, _ in need:
        bak = path + '.bak-code-migrate-' + TS
        shutil.copy2(path, bak)
        new_header = header_line.replace(OLD, NEW)
        with open(path, 'wb') as f:
            f.write(recompress(new_header, body))
        changed += 1
    print('已迁移会话数:', changed, ' 备份后缀: .bak-code-migrate-' + TS)


if __name__ == '__main__':
    main()
