#!/usr/bin/env python3
"""修复 dsh-autogate 历史会话日志（zstd frame 结构 + safe-auto/decision 事件标记）。

背景：
- 旧版 dsh-autogate 插件写入自定义事件 safe-auto/decision 时未标 ignorable:true，
  导致官方读路径 assertEventsSupported 抛 SessionFormatUnsupportedError。
- 更早的修复脚本 scripts/rewrite-safe-auto-events.mjs 用 zstd -c 把整份日志压成
  单个 zstd frame，破坏了官方格式（官方要求第一个 frame 恰好是 header 那一行），
  导致读路径报 "corrupt Zstandard session log: first frame is not exactly one header line"，
  表现为会话列表整体加载失败。

本脚本正确做法：
1. 流式解压读回全部 JSONL 行（字节级）。
2. 对 type 为 safe-auto/decision 且缺 ignorable 的行，在行尾 } 前插入 ,"ignorable":true
   （字符串级最小改动，其余行逐字节保留）。
3. 用官方同构格式重新压缩：header 行单独一个 zstd frame（checksum=1），
   其余事件行作为 body 单独一个 frame（checksum=1），二者拼接。
   —— 与官方 encodeMaterialization（headerFrame + eventFrame）一致。

用法：python3 scripts/fix-session-zstd.py <session.jsonl.zstd> [--dry-run]
"""
import sys, os, json, shutil, time
import zstandard


def decompress(path):
    with open(path, 'rb') as f:
        dctx = zstandard.ZstdDecompressor()
        reader = dctx.stream_reader(f)
        return reader.read()


def fix(data):
    """返回 (修复后的字节, 加ignorable的行数, header字节数, body行数)。"""
    idx = data.find(b"\n")
    if idx == -1:
        raise ValueError("日志无换行符，非 JSONL 格式")
    header = data[:idx + 1]          # 含换行的 header 行
    body = data[idx + 1:]            # 其余事件行

    lines = body.split(b"\n")
    out = []
    changed = 0
    for line in lines:
        if not line:
            out.append(line)
            continue
        if b'"safe-auto/decision"' not in line:
            out.append(line)
            continue
        try:
            obj = json.loads(line.decode('utf-8'))
        except Exception:
            out.append(line)         # 解析失败原样保留
            continue
        if obj.get('type') != 'safe-auto/decision':
            out.append(line)
            continue
        if obj.get('ignorable') is True:
            out.append(line)
            continue
        stripped = line.rstrip()
        if not stripped.endswith(b'}'):
            out.append(line)         # 非常规行，原样保留
            continue
        out.append(stripped[:-1] + b',"ignorable":true}')
        changed += 1

    new_body = b"\n".join(out)

    cctx = zstandard.ZstdCompressor(
        write_checksum=True, write_content_size=True, level=3,
    )
    header_frame = cctx.compress(header)
    body_frame = cctx.compress(new_body)
    return header_frame + body_frame, changed, len(header), len(lines) - 1


def main():
    argv = sys.argv[1:]
    dry = '--dry-run' in argv
    targets = [a for a in argv if not a.startswith('--')]
    if not targets:
        print('用法: python3 scripts/fix-session-zstd.py <session.jsonl.zstd> [--dry-run]')
        sys.exit(1)
    target = targets[0]
    if not os.path.exists(target):
        print('文件不存在:', target)
        sys.exit(1)

    data = decompress(target)
    fixed, changed, header_len, body_lines = fix(data)
    print('目标:', target)
    print('解压字节:', len(data), ' header字节:', header_len, ' 事件行数:', body_lines)
    print('加 ignorable 的事件数:', changed)
    print('修复后压缩字节:', len(fixed), ' (原压缩字节:', os.path.getsize(target), ')')

    if dry:
        print('[dry-run] 未写盘')
        return

    bak = target + '.bak-fix-' + str(int(time.time() * 1000))
    shutil.copy2(target, bak)
    with open(target, 'wb') as f:
        f.write(fixed)
    print('已写回，原文件备份为:', bak)


if __name__ == '__main__':
    main()
