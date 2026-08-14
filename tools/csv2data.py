#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
csv2data.py — CSV/Excel 模板 → power_tree.data.js
用法: python tools/csv2data.py input.csv output.data.js
"""
import csv
import json
import sys
import re
from pathlib import Path


def parse_value(v):
    """解析 CSV 单元格为合适类型"""
    if v is None or v == "":
        return None
    v = v.strip()
    if v == "":
        return None
    if v.lower() == "true":
        return True
    if v.lower() == "false":
        return False
    # 数字
    try:
        if "." in v:
            return float(v)
        return int(v)
    except ValueError:
        pass
    # 数组 [a,b]
    if v.startswith("[") and v.endswith("]"):
        inner = v[1:-1]
        parts = [p.strip() for p in inner.split(",")]
        return [parse_value(p) for p in parts]
    # 分号分隔 → array
    if ";" in v:
        return [p.strip() for p in v.split(";") if p.strip()]
    return v


def row_to_node(row):
    """把一行 CSV 转成一个节点"""
    n = {}
    # 必填
    if not row.get("id"):
        return None
    n["id"] = row["id"]
    n["type"] = row.get("type") or "virtual"
    if row.get("name"):
        n["name"] = row["name"]

    # 可选字段
    simple_fields = [
        "group", "part", "refdes", "sheet", "domain",
        "sense", "parallel_group", "iso_signal", "reset_signal", "note"
    ]
    for f in simple_fields:
        if row.get(f):
            n[f] = row[f]

    # 数值
    num_fields = [
        ("vout", "vout"), ("imax", "imax"), ("iq_ua", "iq_ua"),
        ("efficiency", "efficiency"), ("dropout_mv", "dropout_mv"),
        ("rds_on_mohm", "rds_on_mohm"), ("dcr_mohm", "dcr_mohm"),
        ("r_mohm", "r_mohm"), ("l_uh", "l_uh"), ("isat", "isat"),
        ("c_uf", "c_uf"), ("esr_mohm", "esr_mohm"),
        ("volt_rating", "volt_rating"), ("power_mw", "power_mw"),
        ("tol_pct", "tol_pct"), ("vf_mv", "vf_mv"),
        ("soft_start_ms", "soft_start_ms"), ("theta_ja", "theta_ja"),
        ("vout_tol_pct", "vout_tol_pct")
    ]
    for csv_key, json_key in num_fields:
        v = parse_value(row.get(csv_key))
        if v is not None:
            n[json_key] = v

    # 范围
    vin_min = parse_value(row.get("vin_min"))
    vin_max = parse_value(row.get("vin_max"))
    if vin_min is not None and vin_max is not None:
        n["vin_range"] = [vin_min, vin_max]
    vout_min = parse_value(row.get("vout_min"))
    vout_max = parse_value(row.get("vout_max"))
    if vout_min is not None and vout_max is not None:
        n["vout_range"] = [vout_min, vout_max]

    # eff_ref
    if row.get("eff_ref"):
        n["eff_ref"] = row["eff_ref"]

    # cascade
    if row.get("cascade_chain"):
        n["cascade"] = {
            "chain_id": row["cascade_chain"],
            "stage": parse_value(row.get("cascade_stage")) or 1
        }

    # enable
    if row.get("enable_src") or row.get("enable_order"):
        en = {}
        if row.get("enable_src"):
            en["src"] = row["enable_src"]
        if row.get("enable_signal"):
            en["signal"] = row["enable_signal"]
        order = parse_value(row.get("enable_order"))
        if order is not None:
            en["order"] = order
        delay = parse_value(row.get("enable_delay_ms"))
        if delay is not None:
            en["delay_ms"] = delay
        ramp = parse_value(row.get("enable_ramp_ms"))
        if ramp is not None:
            en["ramp_ms"] = ramp
        pg = parse_value(row.get("enable_pg"))
        if pg is not None:
            en["pg"] = pg
        n["enable"] = en

    # on_in_modes
    if row.get("on_in_modes"):
        v = row["on_in_modes"]
        if isinstance(v, str):
            n["on_in_modes"] = [p.strip() for p in re.split(r"[;,]", v) if p.strip()]

    # bool
    for f in ["always_on", "retention"]:
        v = parse_value(row.get(f))
        if v is not None:
            n[f] = v

    # current
    has_current = False
    current = {}
    for mode in ["active", "dvfs_lo", "idle", "suspend", "off"]:
        typ = parse_value(row.get(f"current_{mode}_typ"))
        mx = parse_value(row.get(f"current_{mode}_max"))
        if typ is not None or mx is not None:
            current[mode] = {}
            if typ is not None:
                current[mode]["typ"] = typ
            if mx is not None:
                current[mode]["max"] = mx
            has_current = True
    if has_current:
        n["current"] = current

    # tags
    if row.get("tags"):
        v = row["tags"]
        if isinstance(v, str):
            n["tags"] = [p.strip() for p in re.split(r"[;,]", v) if p.strip()]

    return n


def row_to_edge(row):
    """把一行 CSV 转成一条边"""
    # 简化: from 和 to 列
    if not row.get("id"):
        return None
    # 支持 "A->B" 格式
    m = re.match(r"^(.+?)->(.+)$", row["id"])
    if not m:
        return None
    e = {
        "from": m.group(1).strip(),
        "to": m.group(2).strip(),
        "type": row.get("type") or "power"
    }
    for f in ["sub", "net", "signal"]:
        if row.get(f):
            e[f] = row[f]
    trace = parse_value(row.get("trace_r_mohm"))
    if trace is not None:
        e["trace_r_mohm"] = trace
    return e


def convert(csv_path, out_path):
    nodes = []
    edges = []

    with open(csv_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            kind = (row.get("kind") or "").strip().lower()
            if kind == "node":
                n = row_to_node(row)
                if n:
                    nodes.append(n)
            elif kind == "edge":
                e = row_to_edge(row)
                if e:
                    edges.append(e)

    data = {
        "meta": {
            "schema_version": "1.0",
            "project": "Imported from CSV",
            "version": "v0.1",
            "date": "",
            "author": "",
            "commit": "",
            "changelog": f"由 {Path(csv_path).name} 生成"
        },
        "modes": [
            {"id": "active", "name_zh": "全速运行", "name_en": "Active", "default": True},
            {"id": "idle", "name_zh": "轻负载", "name_en": "Idle"},
            {"id": "suspend", "name_zh": "休眠", "name_en": "Suspend"},
            {"id": "off", "name_zh": "关机", "name_en": "Off"}
        ],
        "groups": [],
        "nodes": nodes,
        "edges": edges
    }

    body = json.dumps(data, ensure_ascii=False, indent=2)
    out = f"/* Auto-generated from {Path(csv_path).name} */\n" \
          f"PT.registerData(\"power_tree\", {body});\n"

    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    Path(out_path).write_text(out, encoding="utf-8")
    print(f"OK 转换完成: {out_path}")
    print(f"   节点 {len(nodes)} 个, 边 {len(edges)} 条")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("用法: python csv2data.py input.csv output.data.js")
        sys.exit(1)
    convert(sys.argv[1], sys.argv[2])
