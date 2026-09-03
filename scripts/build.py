#!/usr/bin/env python3
"""
唯一的拼装脚本：把 core/ + adapters/ 里共享的代码，拼成每个平台真正能跑的文件。
不用 npm/node，纯文本拼接——原因见 core/game-core.js 顶部注释和 README。

用法：
    python3 scripts/build.py          # 生成全部平台
    python3 scripts/build.py web      # 只生成 Web 版 index.html
    python3 scripts/build.py wechat   # 只生成微信小游戏的 game.js
    python3 scripts/build.py douyin   # 只生成抖音小游戏的 game.js
    python3 scripts/build.py taptap   # 只生成 TapTap H5 小游戏的 dist/index.html

改完 core/ 或某个 adapters/*.js 之后必须重新跑这个脚本，index.html 和
platforms/*/game.js 都是生成产物，不要手改（手改了下次跑这个脚本会被覆盖）。
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def read(*parts):
    return (ROOT / Path(*parts)).read_text(encoding='utf-8')


def write(path, content):
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding='utf-8')
    print(f'  写入 {path}  ({content.count(chr(10))} 行)')


def assemble_web_page():
    """Web 版和 TapTap H5 小游戏用的是同一份配方（template.html + core + web.js）——
    TapTap 的"H5 小游戏"官方文档确认过就是一个跑在真实网页环境里的普通页面，
    不是微信/抖音那种无 DOM 的沙盒 VM，直接原样复用 Web 版产物即可，
    没必要为它单独写一份 adapters/taptap.js。"""
    template = read('platforms', 'web', 'template.html')
    core = read('core', 'game-core.js')
    web = read('adapters', 'web.js')
    script = '\n' + core + '\n\n' + web + '\n'
    marker = '<script><!--BUILD:GAME_SCRIPT--></script>'
    assert marker in template, 'template.html 里的占位标记不见了，先检查有没有被手改过'
    return template.replace(marker, f'<script>{script}</script>')


def build_web():
    print('构建 Web 版 -> index.html')
    write('index.html', assemble_web_page())


def build_wechat():
    print('构建微信小游戏 -> platforms/wechat-minigame/game.js')
    core = read('core', 'game-core.js')
    ui = read('core', 'ui-canvas.js')
    wechat = read('adapters', 'wechat.js')
    out = '\n'.join([
        '/* 本文件由 scripts/build.py 生成，不要手改——改 core/ 或 adapters/wechat.js 再重新跑脚本。 */',
        core, '', ui, '', wechat, '',
    ])
    write(Path('platforms', 'wechat-minigame', 'game.js'), out)


def build_douyin():
    print('构建抖音小游戏 -> platforms/douyin-minigame/game.js')
    core = read('core', 'game-core.js')
    ui = read('core', 'ui-canvas.js')
    douyin = read('adapters', 'douyin.js')
    out = '\n'.join([
        '/* 本文件由 scripts/build.py 生成，不要手改——改 core/ 或 adapters/douyin.js 再重新跑脚本。 */',
        core, '', ui, '', douyin, '',
    ])
    write(Path('platforms', 'douyin-minigame', 'game.js'), out)


def build_taptap():
    print('构建 TapTap H5 小游戏 -> platforms/taptap-minigame/build/index.html')
    # 目录名故意不叫 dist——仓库根目录的 .gitignore 有一条通用的 `dist/` 规则，
    # 会把这份产物整个吞掉不进 Git。TapTap MCP 的 prepare_h5_upload/upload_h5_game
    # 工具本身也认 "build" 这个目录名（官方示例里列的可选值之一）。
    write(Path('platforms', 'taptap-minigame', 'build', 'index.html'), assemble_web_page())


TARGETS = {'web': build_web, 'wechat': build_wechat, 'douyin': build_douyin, 'taptap': build_taptap}

if __name__ == '__main__':
    args = sys.argv[1:] or list(TARGETS.keys())
    unknown = [a for a in args if a not in TARGETS]
    if unknown:
        sys.exit(f'不认识的目标: {unknown}，可选: {list(TARGETS.keys())}')
    for name in args:
        TARGETS[name]()
    print('完成。')
