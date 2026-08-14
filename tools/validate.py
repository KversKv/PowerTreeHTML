#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
validate.py — CI 数据校验
用法: python tools/validate.py data/power_tree.data.js
退出码: 0=通过, 1=有 E 级错误, 2=解析失败
"""
import json
import re
import sys
from pathlib import Path


def parse_data_js(path):
    """从 .data.js 提取 JSON (支持行注释)"""
    text = Path(path).read_text(encoding="utf-8")
    # 去掉块注释 /* ... */
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)
    # 去掉行注释 //
    text = re.sub(r'//[^\n]*', '', text)
    # 匹配 PT.registerData("power_tree", ...)
    m = re.search(r'PT\.registerData\(\s*"power_tree"\s*,\s*(\{.*\})\s*\)\s*;?\s*$',
                  text, re.DOTALL)
    if not m:
        return None, "未找到 PT.registerData(\"power_tree\", {...})"
    body = m.group(1)
    try:
        return json.loads(body), None
    except json.JSONDecodeError as e:
        return None, f"JSON 解析失败: {e}"


def validate(data):
    """校验数据, 返回 (errors, warnings)"""
    errors = []
    warnings = []

    # meta
    if "meta" not in data:
        errors.append({"id": "(root)", "field": "meta", "message": "缺少 meta"})
    else:
        meta = data["meta"]
        if meta.get("schema_version") != "1.0":
            warnings.append({"id": "meta", "field": "schema_version",
                             "message": f"schema_version={meta.get('schema_version')} 与 1.0 不一致"})

    # modes
    modes = data.get("modes", [])
    if not modes:
        warnings.append({"id": "modes", "field": "modes", "message": "modes 为空"})
    mode_ids = {m.get("id") for m in modes}
    default_count = sum(1 for m in modes if m.get("default"))
    if default_count != 1:
        warnings.append({"id": "modes", "field": "default",
                         "message": f"默认模式数量为 {default_count}, 期望 1"})

    # groups
    groups = data.get("groups", [])
    group_ids = set()
    for g in groups:
        gid = g.get("id")
        if not gid:
            errors.append({"id": "(group)", "field": "id", "message": "分组缺 id"})
            continue
        if gid in group_ids:
            errors.append({"id": gid, "field": "id", "message": f"分组 id 重复: {gid}"})
        group_ids.add(gid)
        parent = g.get("parent")
        if parent and parent not in group_ids and parent != gid:
            # parent 必须在已出现或后续出现
            pass

    # nodes
    nodes = data.get("nodes", [])
    node_ids = set()
    for idx, n in enumerate(nodes):
        nid = n.get("id")
        if not nid:
            errors.append({"id": f"nodes[{idx}]", "field": "id", "message": "节点缺 id"})
            continue
        if nid in node_ids:
            errors.append({"id": nid, "field": "id", "message": f"节点 id 重复: {nid}"})
        node_ids.add(nid)

        if not n.get("type"):
            errors.append({"id": nid, "field": "type", "message": "缺 type"})

        # group 引用
        if n.get("group") and n["group"] not in group_ids:
            warnings.append({"id": nid, "field": "group",
                             "message": f"引用不存在的分组: {n['group']}"})

        # on_in_modes 引用
        if n.get("on_in_modes"):
            for mid in n["on_in_modes"]:
                if mid not in mode_ids:
                    warnings.append({"id": nid, "field": "on_in_modes",
                                     "message": f"引用不存在的模式: {mid}"})

    # edges
    edges = data.get("edges", [])
    for idx, e in enumerate(edges):
        if not e.get("from"):
            errors.append({"id": f"edges[{idx}]", "field": "from", "message": "缺 from"})
        elif e["from"] not in node_ids:
            warnings.append({"id": f"edges[{idx}]", "field": "from",
                             "message": f"from 引用不存在节点: {e['from']}"})
        if not e.get("to"):
            errors.append({"id": f"edges[{idx}]", "field": "to", "message": "缺 to"})
        elif e["to"] not in node_ids and e["to"] not in group_ids:
            warnings.append({"id": f"edges[{idx}]", "field": "to",
                             "message": f"to 引用不存在节点/分组: {e['to']}"})
        if not e.get("type"):
            errors.append({"id": f"edges[{idx}]", "field": "type", "message": "缺 type"})

    # 环路检测 (简单 DFS)
    adj = {}
    for e in edges:
        if e.get("type") == "power":
            adj.setdefault(e.get("from"), []).append(e.get("to"))
    WHITE, GRAY, BLACK = 0, 1, 2
    color = {}
    cycles = []

    def dfs(u, stack):
        color[u] = GRAY
        stack.append(u)
        for v in adj.get(u, []):
            if color.get(v) == GRAY:
                idx = stack.index(v)
                if idx >= 0:
                    cycles.append(stack[idx:] + [v])
            elif color.get(v) is None:
                dfs(v, stack)
        stack.pop()
        color[u] = BLACK

    for nid in node_ids:
        if color.get(nid) is None:
            dfs(nid, [])

    for cyc in cycles:
        errors.append({"id": cyc[0], "field": "(cycle)",
                       "message": f"环路: {' -> '.join(cyc)}"})

    return errors, warnings


def main():
    if len(sys.argv) < 2:
        print("用法: python validate.py <power_tree.data.js | .json>")
        sys.exit(2)

    path = sys.argv[1]
    if not Path(path).exists():
        print(f"错误: 文件不存在 {path}")
        sys.exit(2)

    # 解析
    if path.endswith(".json"):
        try:
            data = json.loads(Path(path).read_text(encoding="utf-8"))
            err = None
        except Exception as e:
            data, err = None, str(e)
    else:
        data, err = parse_data_js(path)

    if err:
        print(f"✗ 解析失败: {err}")
        sys.exit(2)

    errors, warnings = validate(data)

    # 输出
    print(f"校验: {path}")
    print(f"  节点: {len(data.get('nodes', []))} 个")
    print(f"  边:   {len(data.get('edges', []))} 条")
    print(f"  分组: {len(data.get('groups', []))} 个")
    print(f"  模式: {len(data.get('modes', []))} 个")
    print()

    if warnings:
        print(f"⚠ {len(warnings)} 个警告:")
        for w in warnings:
            print(f"  [{w['id']}.{w['field']}] {w['message']}")
        print()

    if errors:
        print(f"✗ {len(errors)} 个错误:")
        for e in errors:
            print(f"  [{e['id']}.{e['field']}] {e['message']}")
        sys.exit(1)

    print("✓ 校验通过")
    sys.exit(0)


if __name__ == "__main__":
    main()
