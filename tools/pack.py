#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pack.py — 把整个文件夹打包为单文件 HTML
产出: dist/power_tree_release.html
所有 JS/CSS/数据内联, 二进制资源 base64
"""
import os
import re
import sys
import base64
from pathlib import Path

ROOT = Path(__file__).parent.parent.resolve()
DIST = ROOT / "dist"
OUT = DIST / "power_tree_release.html"

# 需要内联的资源 (按 index.html 引用顺序)
SCRIPTS = [
    "assets/vendor/elkjs/elk.bundled.js",
    "assets/app/core/ns.js",
    "assets/app/core/schema.js",
    "assets/app/core/graph.js",
    "assets/app/core/store.js",
    "assets/app/core/url-state.js",
    "assets/app/engine/eff-table.js",
    "assets/app/engine/vdrop.js",
    "assets/app/engine/thermal.js",
    "assets/app/engine/sequence.js",
    "assets/app/engine/engine.js",
    "assets/app/rules/rule-defs.js",
    "assets/app/rules/rules.js",
    "assets/app/layout/layout-opts.js",
    "assets/app/layout/grouping.js",
    "assets/app/layout/swimlane.js",
    "assets/app/layout/elk-adapter.js",
    "assets/app/render/node-shapes.js",
    "assets/app/render/edge-router.js",
    "assets/app/render/minimap.js",
    "assets/app/render/svg-renderer.js",
    "assets/app/views/view-board.js",
    "assets/app/views/view-soc.js",
    "assets/app/views/view-table.js",
    "assets/app/views/view-sequence.js",
    "assets/app/views/view-dashboard.js",
    "assets/app/ui/i18n.js",
    "assets/app/ui/legal.js",
    "assets/app/ui/search.js",
    "assets/app/ui/issues.js",
    "assets/app/ui/panel-detail.js",
    "assets/app/ui/tour.js",
    "assets/app/ui/toolbar.js",
    "assets/app/io/export-svg.js",
    "assets/app/io/export-png.js",
    "assets/app/io/export-csv.js",
    "assets/app/io/export-json.js",
    "assets/app/io/import.js",
    "assets/app/io/export.js",
    "data/config.data.js",
    "data/parts/parts-lib.data.js",
    "data/eff/BES1811_BUCK1.data.js",
    "data/eff/TPS62840_BUCK.data.js",
    "data/power_tree.data.js",
    "assets/app/boot.js",
]

CSS = [
    "assets/css/app.css",
    "assets/css/theme-light.css",
    "assets/css/theme-dark.css",
    "assets/css/print.css",
]


def read_file(path: Path) -> str:
    if not path.exists():
        print(f"警告: 文件不存在 {path}", file=sys.stderr)
        return ""
    return path.read_text(encoding="utf-8")


def pack():
    DIST.mkdir(parents=True, exist_ok=True)

    # 读 index.html 作为模板
    index_path = ROOT / "index.html"
    if not index_path.exists():
        print("错误: 找不到 index.html", file=sys.stderr)
        sys.exit(1)

    template = index_path.read_text(encoding="utf-8")

    # 内联 CSS
    css_block = "\n".join(f"/* ===== {p} ===== */\n{read_file(ROOT / p)}" for p in CSS)
    css_tag = f"<style>\n{css_block}\n</style>"

    # 替换 css 链接
    template = re.sub(
        r'<link rel="stylesheet" href="assets/css/[^"]+">\s*',
        "",
        template
    )
    # 在 </head> 前插入 css
    template = template.replace("</head>", css_tag + "\n</head>")

    # 内联 JS
    js_parts = []
    for p in SCRIPTS:
        content = read_file(ROOT / p)
        js_parts.append(f"/* ===== {p} ===== */\n{content}")
    js_block = "\n".join(js_parts)

    # 替换 script src 引用
    template = re.sub(
        r'<script src="[^"]+"></script>\s*',
        "",
        template
    )

    # 在 </body> 前插入 js
    js_tag = f"<script>\n{js_block}\n</script>"
    # 把启动 script 也内联
    boot_call = '<script>\n  // Viewer 模式 (只读)\n  PT.start({ rootId: "pt-app", editorMode: false });\n</script>'
    replacement = js_tag + "\n" + boot_call
    template = re.sub(
        r'<script>\s*// Viewer 模式.*?</script>',
        lambda m: replacement,
        template,
        flags=re.DOTALL
    )

    # 写文件
    OUT.write_text(template, encoding="utf-8")
    size_kb = OUT.stat().st_size / 1024
    print(f"OK 打包完成: {OUT}")
    print(f"   大小: {size_kb:.1f} KB")


if __name__ == "__main__":
    pack()
