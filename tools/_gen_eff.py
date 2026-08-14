#!/usr/bin/env python3
"""生成示例效率表 data/eff/*.data.js (1mA step, 多工况)"""
import json
import os

def gen_eff(i_max, peak_eff, peak_at_ratio=0.5):
    arr = []
    peak_at = i_max * peak_at_ratio
    for i in range(1, i_max + 1):
        if i <= peak_at:
            e = peak_eff * (0.3 + 0.7 * (i / peak_at) ** 0.6)
        else:
            e = peak_eff * (1.0 - 0.15 * ((i - peak_at) / (i_max - peak_at)) ** 1.5)
        arr.append(round(min(e, 0.97), 4))
    return arr

def write_eff(path, part_id, conditions):
    data = {"unit": {"i": "mA", "eff": "ratio"}, "conditions": conditions}
    body = json.dumps(data, separators=(",", ":"))
    out = "/* %s 效率表 (1mA step, %d 工况) */\nPT.registerEff(\"%s\", %s);\n" % (
        part_id, len(conditions), part_id, body)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(out)
    print("OK", path, len(out), "bytes")

if __name__ == "__main__":
    base = os.path.join(os.path.dirname(__file__), "..", "data", "eff")

    write_eff(os.path.join(base, "BES1811_BUCK1.data.js"), "BES1811_BUCK1", [
        {"vin": 3.8, "vout": 0.9,  "i_start": 1, "i_step": 1, "eff": gen_eff(200, 0.92, 0.6)},
        {"vin": 3.8, "vout": 0.75, "i_start": 1, "i_step": 1, "eff": gen_eff(200, 0.89, 0.6)},
        {"vin": 4.35, "vout": 0.9, "i_start": 1, "i_step": 1, "eff": gen_eff(200, 0.90, 0.6)},
        {"vin": 3.0, "vout": 0.9,  "i_start": 1, "i_step": 1, "eff": gen_eff(200, 0.93, 0.6)}
    ])

    write_eff(os.path.join(base, "TPS62840_BUCK.data.js"), "TPS62840_BUCK", [
        {"vin": 3.8, "vout": 3.3, "i_start": 1, "i_step": 1, "eff": gen_eff(200, 0.95, 0.5)},
        {"vin": 4.35, "vout": 3.3, "i_start": 1, "i_step": 1, "eff": gen_eff(200, 0.94, 0.5)},
        {"vin": 3.0, "vout": 3.3, "i_start": 1, "i_step": 1, "eff": gen_eff(200, 0.96, 0.5)}
    ])
