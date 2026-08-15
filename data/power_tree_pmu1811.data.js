/* power_tree_pmu1811.data.js — BES1811 PMIC 真实连接关系
 * 严格按 pmu_1811_power_map.md §3/§4/§5/§6 建模
 * 31 行 _LAYOUT_ROWS: 6 BUCK + 15 LDO + 2 VMIC + 7 SW + VSYS + loads
 * (子母线 vdd_l14_15/vdd_l5 不建虚拟节点, 直接作下游 LDO 的 Vin 网络名)
 */
PT.registerData("power_tree", {
  "meta": {
    "schema_version": "1.0",
    "project": "BES1811 PMU 电源树",
    "version": "v1811.1",
    "date": "2026-08-14",
    "author": "PowerTeam",
    "commit": "1811",
    "changelog": "严格按 pmu_1811_power_map.md 建模: 4 组对偶 / 2 子母线 / 7 SW / 2 VMIC; 修正: 对偶不建功率边(改 note 标注), 对偶轨下挂统一挂 LDO 侧(芯片默认 LDO 工作), BUCK_01/03 与 SoC 负载电压对齐轨道, 级联标注 CH_BUCK03_SUB"
  },

  "modes": [
    { "id": "active",  "name_zh": "Normal",     "name_en": "Normal",     "default": true },
    { "id": "dsleep",  "name_zh": "Deep Sleep", "name_en": "Deep Sleep" },
    { "id": "rc",      "name_zh": "RC 模式",     "name_en": "RC" },
    { "id": "lp",      "name_zh": "低功耗",      "name_en": "LP" },
    { "id": "off",     "name_zh": "关断",        "name_en": "Off" }
  ],

  "groups": [
    { "id": "board",       "name_zh": "板级",         "kind": "board",  "parent": null,   "side": "left" },
    { "id": "pmic1811",    "name_zh": "BES1811 PMIC",  "kind": "pmic",   "parent": "board", "side": "left" },
    { "id": "soc_dig",     "name_zh": "SoC 数字域",    "kind": "chip",   "parent": null,   "side": "right" },
    { "id": "pd_core",     "name_zh": "PD_CORE",       "kind": "domain", "parent": "soc_dig" },
    { "id": "pd_peri",     "name_zh": "PD_PERI",       "kind": "domain", "parent": "soc_dig" },
    { "id": "pd_mic",      "name_zh": "PD_MIC",        "kind": "domain", "parent": "soc_dig" },
    { "id": "pd_usb",      "name_zh": "PD_USB",        "kind": "domain", "parent": "soc_dig" }
  ],

  /* 对偶外框 (§5): BUCK/LDO 输出短接的并联对偶组, 渲染浅外框, 布局视为整体 */
  "pair_groups": [
    { "id": "PAIR_01", "label": "对偶组1 BUCK_01+LDO_01", "members": ["BUCK_01", "LDO_01"] },
    { "id": "PAIR_02", "label": "对偶组2 BUCK_02+LDO_02", "members": ["BUCK_02", "LDO_02"] },
    { "id": "PAIR_03", "label": "对偶组3 BUCK_03+LDO_03", "members": ["BUCK_03", "LDO_03"] },
    { "id": "PAIR_06", "label": "跨列对偶 BUCK_06+LDO_06", "members": ["BUCK_06", "LDO_06"] }
  ],

  "nodes": [
    /* ===== 源 ===== */
    { "id": "VSYS", "type": "source", "name": "VSYS 系统电源",
      "vout": 3.8, "vout_range": [3.0, 4.35], "imax": 5000,
      "side": "left", "tags": ["主输入"] },

    /* ===== BUCK (6 个, §9) ===== */
    /* 对偶组 1: BUCK_01 ↔ LDO_01 */
    { "id": "BUCK_01", "type": "buck", "name": "BUCK_01",
      "group": "pmic1811", "refdes": "0x015",
      "vin_range": [2.7, 5.5], "vout": 0.8, "vout_range": [0.313, 1.234], "vout_tol_pct": 3,
      "dvfs": { "active": 0.8, "dsleep": 0.7, "rc": 0.65 },
      "imax": 1500, "iq_ua": 30, "efficiency": 0.88,
      "enable": { "src": "PMU_SEQ", "signal": "EN_BUCK01", "order": 2, "delay_ms": 1, "ramp_ms": 0.5, "pg": true },
      "on_in_modes": ["active", "dsleep", "rc", "lp"],
      "note": "与 LDO_01 输出短接成对偶轨 LDO_01&BUCK_01 (§5 互斥使能); 芯片默认 pu=0, 由 LDO_01 侧工作; vout 取 §9 寄存器默认 0x86≈0.795V",
      "tags": ["对偶1", "BUCK"] },

    { "id": "LDO_01", "type": "ldo", "name": "LDO_01 (对偶 BUCK_01)",
      "group": "pmic1811", "refdes": "0x00D",
      "vin_range": [1.5, 5.5], "vout": 0.79, "vout_range": [0.303, 1.886], "vout_tol_pct": 3,
      "dropout_mv": 150, "imax": 400, "iq_ua": 15,
      "enable": { "src": "PMU_SEQ", "signal": "EN_LDO01", "order": 3, "delay_ms": 1 },
      "on_in_modes": ["active", "dsleep", "rc", "lp"],
      "note": "与 BUCK_01 输出短接成对偶轨 LDO_01&BUCK_01 (§5 互斥使能); 芯片默认 pu=1 本侧工作, SW1/SW7 挂本轨",
      "tags": ["对偶1", "LDO"] },

    /* 对偶组 2: BUCK_02 ↔ LDO_02 */
    { "id": "BUCK_02", "type": "buck", "name": "BUCK_02",
      "group": "pmic1811", "refdes": "0x145",
      "vin_range": [2.7, 5.5], "vout": 1.2, "vout_range": [0.605, 2.5], "vout_tol_pct": 3,
      "dvfs": { "active": 1.2, "dsleep": 1.0, "rc": 0.9 },
      "imax": 2000, "iq_ua": 30, "efficiency": 0.9,
      "enable": { "src": "PMU_SEQ", "signal": "EN_BUCK02", "order": 4, "delay_ms": 1, "ramp_ms": 0.5, "pg": true },
      "on_in_modes": ["active", "dsleep", "rc", "lp"],
      "note": "与 LDO_02 输出短接成对偶轨 LDO_02&BUCK_02 (§5 互斥使能); 芯片默认 pu=0, 由 LDO_02 侧工作; vout 1.2≈§9 寄存器默认 0x50→1.19V",
      "tags": ["对偶2", "BUCK"] },

    { "id": "LDO_02", "type": "ldo", "name": "LDO_02 (对偶 BUCK_02)",
      "group": "pmic1811", "refdes": "0x003",
      "vin_range": [1.5, 5.5], "vout": 1.04, "vout_range": [0.820, 1.805], "vout_tol_pct": 3,
      "dropout_mv": 150, "imax": 300, "iq_ua": 12,
      "enable": { "src": "PMU_SEQ", "signal": "EN_LDO02", "order": 5, "delay_ms": 1 },
      "on_in_modes": ["active", "dsleep", "rc", "lp"],
      "note": "与 BUCK_02 输出短接成对偶轨 LDO_02&BUCK_02 (§5 互斥使能); 芯片默认 pu=1 本侧工作, LDO_12/SW2/LDO_06 挂本轨",
      "tags": ["对偶2", "LDO"] },

    /* 对偶组 3: BUCK_03 ↔ LDO_03 */
    { "id": "BUCK_03", "type": "buck", "name": "BUCK_03",
      "group": "pmic1811", "refdes": "0x1E5",
      "vin_range": [2.7, 5.5], "vout": 1.5, "vout_range": [0.6, 2.5], "vout_tol_pct": 3,
      "dvfs": { "active": 1.5, "dsleep": 1.2, "rc": 1.0 },
      "imax": 2500, "iq_ua": 30, "efficiency": 0.9,
      "enable": { "src": "PMU_SEQ", "signal": "EN_BUCK03", "order": 6, "delay_ms": 1, "ramp_ms": 0.5, "pg": true },
      "on_in_modes": ["active", "dsleep", "rc", "lp"],
      "cascade": { "chain_id": "CH_BUCK03_SUB", "stage": 1 },
      "note": "与 LDO_03 输出短接成对偶轨 LDO_03&BUCK_03 (§5 互斥使能); 同时是 LDO_07~11 级联子树源 (§4.3), vout 1.5V 满足子树最高 1.2V+压差",
      "tags": ["对偶3", "BUCK", "级联源"] },

    { "id": "LDO_03", "type": "ldo", "name": "LDO_03 (对偶 BUCK_03)",
      "group": "pmic1811", "refdes": "0x00A",
      "vin_range": [1.5, 5.5], "vout": 1.46, "vout_range": [1.198, 2.193], "vout_tol_pct": 3,
      "dropout_mv": 150, "imax": 350, "iq_ua": 12,
      "enable": { "src": "PMU_SEQ", "signal": "EN_LDO03", "order": 7, "delay_ms": 1 },
      "on_in_modes": ["active", "dsleep", "rc", "lp"],
      "note": "与 BUCK_03 输出短接成对偶轨 LDO_03&BUCK_03 (§5 互斥使能); 芯片默认 pu=1 本侧工作, SW3/SW4 挂本轨",
      "tags": ["对偶3", "LDO"] },

    /* 独立 BUCK: BUCK_04 */
    { "id": "BUCK_04", "type": "buck", "name": "BUCK_04 (独立)",
      "group": "pmic1811", "refdes": "0x155",
      "vin_range": [2.7, 5.5], "vout": 1.0, "vout_range": [0.6, 1.3], "vout_tol_pct": 3,
      "imax": 1800, "iq_ua": 28, "efficiency": 0.9,
      "enable": { "src": "PMU_SEQ", "signal": "EN_BUCK04", "order": 8, "delay_ms": 1 },
      "on_in_modes": ["active", "dsleep"],
      "tags": ["独立", "BUCK"] },

    /* 独立 BUCK: BUCK_05 */
    { "id": "BUCK_05", "type": "buck", "name": "BUCK_05 (独立)",
      "group": "pmic1811", "refdes": "0x1D5",
      "vin_range": [2.7, 5.5], "vout": 1.0, "vout_range": [0.6, 1.3], "vout_tol_pct": 3,
      "imax": 1800, "iq_ua": 28, "efficiency": 0.9,
      "enable": { "src": "PMU_SEQ", "signal": "EN_BUCK05", "order": 9, "delay_ms": 1 },
      "on_in_modes": ["active", "dsleep"],
      "tags": ["独立", "BUCK"] },

    /* 跨列对偶: BUCK_06 (L1) ↔ LDO_06 (L2) */
    { "id": "BUCK_06", "type": "buck", "name": "BUCK_06 (跨列对偶 LDO_06)",
      "group": "pmic1811", "refdes": "0x35F",
      "vin_range": [2.7, 5.5], "vout": 1.0, "vout_range": [0.6, 1.3], "vout_tol_pct": 3,
      "imax": 1500, "iq_ua": 30, "efficiency": 0.88,
      "enable": { "src": "PMU_SEQ", "signal": "EN_BUCK06", "order": 10, "delay_ms": 1 },
      "on_in_modes": ["active", "dsleep", "lp"],
      "note": "与 LDO_06 跨列对偶 (§5 互斥使能, 输出短接); 芯片默认 pu=0, 由 LDO_06 侧工作",
      "tags": ["跨列对偶", "BUCK"] },

    /* ===== 挂在对偶短接轨上的 L2 节点 ===== */
    /* LDO_12 取 BUCK_02 半 id */
    { "id": "LDO_12", "type": "ldo", "name": "LDO_12",
      "group": "pmic1811", "refdes": "0x210",
      "vin_range": [1.5, 5.5], "vout": 0.9, "vout_range": [0.6, 1.3],
      "dropout_mv": 150, "imax": 200, "iq_ua": 10,
      "enable": { "src": "PMU_SEQ", "signal": "EN_LDO12", "order": 11, "delay_ms": 0.5 },
      "on_in_modes": ["active"],
      "tags": ["L2", "BUCK_02子树"] },

    /* LDO_06 (跨列对偶 BUCK_06) — 由 LDO_02&BUCK_02 供电 */
    { "id": "LDO_06", "type": "ldo", "name": "LDO_06 (跨列对偶 BUCK_06)",
      "group": "pmic1811", "refdes": "0x009",
      "vin_range": [1.5, 5.5], "vout": 0.74, "vout_range": [0.599, 1.219],
      "dropout_mv": 50, "imax": 300, "iq_ua": 12,
      "enable": { "src": "PMU_SEQ", "signal": "EN_LDO06", "order": 12, "delay_ms": 0.5 },
      "on_in_modes": ["active", "dsleep", "lp"],
      "note": "VIN 来自对偶轨 LDO_02&BUCK_02 (§3); 与 BUCK_06 跨列对偶 (§5 互斥使能); 芯片默认 pu=1 本侧工作",
      "tags": ["跨列对偶", "LDO"] },

    /* BUCK_03 级联子树 (5 个 LDO) */
    { "id": "LDO_07", "type": "ldo", "name": "LDO_07",
      "group": "pmic1811", "refdes": "0x24E",
      "vin_range": [1.5, 5.5], "vout": 0.85, "vout_range": [0.596, 1.499],
      "dropout_mv": 150, "imax": 250, "iq_ua": 8,
      "enable": { "src": "PMU_SEQ", "signal": "EN_LDO07", "order": 13, "delay_ms": 0.5 },
      "on_in_modes": ["active"],
      "tags": ["L2", "BUCK_03子树"] },

    { "id": "LDO_08", "type": "ldo", "name": "LDO_08",
      "group": "pmic1811", "refdes": "0x11D",
      "vin_range": [1.5, 5.5], "vout": 0.85, "vout_range": [0.598, 1.500],
      "dropout_mv": 150, "imax": 250, "iq_ua": 8,
      "enable": { "src": "PMU_SEQ", "signal": "EN_LDO08", "order": 14, "delay_ms": 0.5 },
      "on_in_modes": ["active"],
      "tags": ["L2", "BUCK_03子树"] },

    { "id": "LDO_09", "type": "ldo", "name": "LDO_09",
      "group": "pmic1811", "refdes": "0x067",
      "vin_range": [1.5, 5.5], "vout": 1.20, "vout_range": [0.899, 2.091],
      "dropout_mv": 150, "imax": 300, "iq_ua": 8,
      "enable": { "src": "PMU_SEQ", "signal": "EN_LDO09", "order": 15, "delay_ms": 0.5 },
      "on_in_modes": ["active"],
      "tags": ["L2", "BUCK_03子树"] },

    { "id": "LDO_10", "type": "ldo", "name": "LDO_10",
      "group": "pmic1811", "refdes": "0x247",
      "vin_range": [1.5, 5.5], "vout": 1.18, "vout_range": [0.901, 2.119],
      "dropout_mv": 150, "imax": 300, "iq_ua": 8,
      "enable": { "src": "PMU_SEQ", "signal": "EN_LDO10", "order": 16, "delay_ms": 0.5 },
      "on_in_modes": ["active"],
      "tags": ["L2", "BUCK_03子树"] },

    { "id": "LDO_11", "type": "ldo", "name": "LDO_11",
      "group": "pmic1811", "refdes": "0x066",
      "vin_range": [1.5, 5.5], "vout": 1.18, "vout_range": [0.901, 1.5],
      "dropout_mv": 150, "imax": 300, "iq_ua": 8,
      "enable": { "src": "PMU_SEQ", "signal": "EN_LDO11", "order": 17, "delay_ms": 0.5 },
      "on_in_modes": ["active"],
      "tags": ["L2", "BUCK_03子树"] },

    /* ===== 子母线 vdd_l14_15 下挂 ===== */
    { "id": "LDO_14", "type": "ldo", "name": "LDO_14",
      "group": "pmic1811", "refdes": "0x202",
      "vin_range": [1.5, 5.5], "vout": 1.8, "vout_range": [1.0, 3.3],
      "dropout_mv": 200, "imax": 200, "iq_ua": 10,
      "enable": { "src": "PMU_SEQ", "signal": "EN_LDO14", "order": 18, "delay_ms": 0.5 },
      "on_in_modes": ["active", "lp"],
      "vin_net": "vdd_l14_15",
      "tags": ["L2", "vdd_l14_15"] },

    { "id": "LDO_15", "type": "ldo", "name": "LDO_15",
      "group": "pmic1811", "refdes": "0x20A",
      "vin_range": [1.5, 5.5], "vout": 1.8, "vout_range": [1.0, 3.3],
      "dropout_mv": 200, "imax": 200, "iq_ua": 10,
      "enable": { "src": "PMU_SEQ", "signal": "EN_LDO15", "order": 19, "delay_ms": 0.5 },
      "on_in_modes": ["active", "lp"],
      "vin_net": "vdd_l14_15",
      "tags": ["L2", "vdd_l14_15"] },

    /* ===== VMIC (麦克风偏置 LDO, §11) ===== */
    { "id": "LDO_VMIC1", "type": "ldo", "name": "LDO_VMIC1 (麦克风 A)",
      "group": "pmic1811", "refdes": "0x039",
      "vin_range": [1.5, 5.5], "vout": 2.0, "vout_range": [1.072, 3.314],
      "dropout_mv": 250, "imax": 5, "iq_ua": 3,
      "enable": { "src": "PMU_SEQ", "signal": "EN_VMIC1", "order": 20, "delay_ms": 0.2 },
      "on_in_modes": ["active"],
      "vin_net": "vdd_l14_15",
      "tags": ["VMIC", "vdd_l14_15"] },

    { "id": "LDO_VMIC2", "type": "ldo", "name": "LDO_VMIC2 (麦克风 B)",
      "group": "pmic1811", "refdes": "0x039",
      "vin_range": [1.5, 5.5], "vout": 2.0, "vout_range": [1.071, 3.224],
      "dropout_mv": 250, "imax": 5, "iq_ua": 3,
      "enable": { "src": "PMU_SEQ", "signal": "EN_VMIC2", "order": 21, "delay_ms": 0.2 },
      "on_in_modes": ["active"],
      "vin_net": "vdd_l14_15",
      "tags": ["VMIC", "vdd_l14_15"] },

    /* ===== 子母线 vdd_l5 下挂 ===== */
    { "id": "LDO_05", "type": "ldo", "name": "LDO_05",
      "group": "pmic1811", "refdes": "0x008",
      "vin_range": [1.5, 5.5], "vout": 1.97, "vout_range": [1.207, 3.712],
      "dropout_mv": 150, "imax": 300, "iq_ua": 10,
      "enable": { "src": "PMU_SEQ", "signal": "EN_LDO05", "order": 22, "delay_ms": 0.5 },
      "on_in_modes": ["active", "lp"],
      "vin_net": "vdd_l5",
      "tags": ["L2", "vdd_l5"] },

    /* ===== LDO_13 (单模块源, VSYS 直供) ===== */
    { "id": "LDO_13", "type": "ldo", "name": "LDO_13 (SW5/6 源)",
      "group": "pmic1811", "refdes": "0x00C",
      "vin_range": [1.5, 5.5], "vout": 3.3, "vout_range": [1.0, 3.3],
      "dropout_mv": 150, "imax": 400, "iq_ua": 15,
      "enable": { "src": "PMU_SEQ", "signal": "EN_LDO13", "order": 23, "delay_ms": 0.5 },
      "on_in_modes": ["active"],
      "note": "SW5/SW6 单模块源 (§4.3); 下游为 vusb33 域 (§6), 故 vout 取 3.3V (寄存器默认 0x15≈1.78V)",
      "tags": ["L1", "SW5/6源"] },

    /* ===== SW (7 个, §6) ===== */
    { "id": "SW1", "type": "load_switch", "name": "LDO_01 SW1 (默认闭合)",
      "group": "pmic1811", "refdes": "0x063[15:14]",
      "vin_range": [1.5, 5.5], "rds_on_mohm": 1994.55, "imax": 200,
      "enable": { "src": "PMU_SEQ", "signal": "EN_SW1", "order": 24, "delay_ms": 0.1 },
      "on_in_modes": ["active", "dsleep"],
      "always_on": true,
      "tags": ["SW", "1p8域", "默认闭"] },

    { "id": "SW2", "type": "load_switch", "name": "LDO_02 SW2",
      "group": "pmic1811", "refdes": "0x063[13:12]",
      "vin_range": [1.5, 5.5], "rds_on_mohm": 506.71, "imax": 300,
      "enable": { "src": "PMU_SEQ", "signal": "EN_SW2", "order": 25, "delay_ms": 0.1 },
      "on_in_modes": ["active"],
      "tags": ["SW", "1p8域"] },

    { "id": "SW3", "type": "load_switch", "name": "LDO_03 SW3 (默认闭合)",
      "group": "pmic1811", "refdes": "0x063[11:10]",
      "vin_range": [1.5, 5.5], "rds_on_mohm": 412.54, "imax": 300,
      "enable": { "src": "PMU_SEQ", "signal": "EN_SW3", "order": 26, "delay_ms": 0.1 },
      "on_in_modes": ["active", "dsleep"],
      "always_on": true,
      "tags": ["SW", "1p8域", "默认闭"] },

    { "id": "SW4", "type": "load_switch", "name": "LDO_03 SW4",
      "group": "pmic1811", "refdes": "0x063[9:8]",
      "vin_range": [1.5, 5.5], "rds_on_mohm": 823.59, "imax": 200,
      "enable": { "src": "PMU_SEQ", "signal": "EN_SW4", "order": 27, "delay_ms": 0.1 },
      "on_in_modes": ["active"],
      "tags": ["SW", "1p8域"] },

    { "id": "SW5", "type": "load_switch", "name": "3p3 SW5 (默认闭合)",
      "group": "pmic1811", "refdes": "0x06B[1:0]",
      "vin_range": [1.5, 5.5], "rds_on_mohm": 861.15, "imax": 250,
      "enable": { "src": "PMU_SEQ", "signal": "EN_SW5", "order": 28, "delay_ms": 0.1 },
      "on_in_modes": ["active"],
      "always_on": true,
      "tags": ["SW", "vusb33域", "默认闭"] },

    { "id": "SW6", "type": "load_switch", "name": "3p3 SW6 (默认闭合)",
      "group": "pmic1811", "refdes": "0x06B[9:8]",
      "vin_range": [1.5, 5.5], "rds_on_mohm": 1427.90, "imax": 150,
      "enable": { "src": "PMU_SEQ", "signal": "EN_SW6", "order": 29, "delay_ms": 0.1 },
      "on_in_modes": ["active"],
      "always_on": true,
      "tags": ["SW", "vusb33域", "默认闭"] },

    { "id": "SW7", "type": "load_switch", "name": "LDO_01 SW7",
      "group": "pmic1811", "refdes": "0x06C[3:2]",
      "vin_range": [1.5, 5.5], "rds_on_mohm": 1504.33, "imax": 100,
      "enable": { "src": "PMU_SEQ", "signal": "EN_SW7", "order": 30, "delay_ms": 0.1 },
      "on_in_modes": ["active"],
      "tags": ["SW", "1p8域"] },

    /* ===== 时序控制器 ===== */
    { "id": "PMU_SEQ", "type": "seq_ctrl", "name": "PMU 时序控制器",
      "side": "left" },

    /* ===== 下游负载 (SoC 侧) ===== */
    { "id": "SOC_CORE", "type": "load", "name": "SoC 核心域",
      "group": "pd_core", "domain": "PD_CORE", "voltage": 0.8,
      "current": {
        "active":  { "typ": 800,  "max": 1200 },
        "dsleep":  { "typ": 50,   "max": 80 },
        "rc":      { "typ": 20,   "max": 30 },
        "lp":      { "typ": 30,   "max": 50 },
        "off":     { "typ": 0,    "max": 0 }
      },
      "iso_signal": "ISO_CORE", "reset_signal": "RST_CORE" },

    { "id": "SOC_PERI", "type": "load", "name": "SoC 外设域",
      "group": "pd_peri", "domain": "PD_PERI", "voltage": 1.0,
      "current": {
        "active":  { "typ": 300, "max": 500 },
        "dsleep":  { "typ": 20,  "max": 30 },
        "rc":      { "typ": 10,  "max": 15 },
        "lp":      { "typ": 15,  "max": 25 },
        "off":     { "typ": 0,   "max": 0 }
      },
      "iso_signal": "ISO_PERI", "reset_signal": "RST_PERI" },

    { "id": "MIC_A", "type": "load", "name": "麦克风 A",
      "group": "pd_mic", "domain": "PD_MIC", "voltage": 2.01,
      "current": {
        "active":  { "typ": 2, "max": 4 },
        "dsleep":  { "typ": 0, "max": 0 },
        "rc":      { "typ": 0, "max": 0 },
        "lp":      { "typ": 0, "max": 0 },
        "off":     { "typ": 0, "max": 0 }
      } },

    { "id": "MIC_B", "type": "load", "name": "麦克风 B",
      "group": "pd_mic", "domain": "PD_MIC", "voltage": 2.01,
      "current": {
        "active":  { "typ": 2, "max": 4 },
        "dsleep":  { "typ": 0, "max": 0 },
        "rc":      { "typ": 0, "max": 0 },
        "lp":      { "typ": 0, "max": 0 },
        "off":     { "typ": 0, "max": 0 }
      } },

    { "id": "USB_3V3", "type": "load", "name": "USB 3.3V 外设",
      "group": "pd_usb", "domain": "PD_USB", "voltage": 3.3,
      "current": {
        "active":  { "typ": 200, "max": 400 },
        "dsleep":  { "typ": 0,   "max": 0 },
        "rc":      { "typ": 0,   "max": 0 },
        "lp":      { "typ": 0,   "max": 0 },
        "off":     { "typ": 0,   "max": 0 }
      } },

    { "id": "SENSOR_1V8", "type": "load", "name": "0.8V 传感器 (SW1 轨)",
      "group": "pd_peri", "domain": "PD_PERI", "voltage": 0.79,
      "current": {
        "active":  { "typ": 50, "max": 100 },
        "dsleep":  { "typ": 5,  "max": 10 },
        "rc":      { "typ": 2,  "max": 5 },
        "lp":      { "typ": 5,  "max": 10 },
        "off":     { "typ": 0,  "max": 0 }
      } }
  ],

  "edges": [
    /* ===== VSYS 直供 (§4.1) ===== */
    { "from": "VSYS", "to": "BUCK_01", "type": "power", "net": "VSYS", "trace_r_mohm": 3 },
    { "from": "VSYS", "to": "LDO_01",  "type": "power", "net": "VSYS", "trace_r_mohm": 3 },
    { "from": "VSYS", "to": "BUCK_02", "type": "power", "net": "VSYS", "trace_r_mohm": 3 },
    { "from": "VSYS", "to": "LDO_02",  "type": "power", "net": "VSYS", "trace_r_mohm": 3 },
    { "from": "VSYS", "to": "BUCK_03", "type": "power", "net": "VSYS", "trace_r_mohm": 3 },
    { "from": "VSYS", "to": "LDO_03",  "type": "power", "net": "VSYS", "trace_r_mohm": 3 },
    { "from": "VSYS", "to": "BUCK_04", "type": "power", "net": "VSYS", "trace_r_mohm": 3 },
    { "from": "VSYS", "to": "BUCK_05", "type": "power", "net": "VSYS", "trace_r_mohm": 3 },
    { "from": "VSYS", "to": "BUCK_06", "type": "power", "net": "VSYS", "trace_r_mohm": 3 },
    { "from": "VSYS", "to": "LDO_13",  "type": "power", "net": "VSYS", "trace_r_mohm": 3 },

    /* ===== 子母线网络 (§4.1): 不建虚拟节点, 直接作下游 LDO 的 Vin 网络名 ===== */
    { "from": "VSYS", "to": "LDO_14",    "type": "power", "net": "vdd_l14_15", "trace_r_mohm": 1 },
    { "from": "VSYS", "to": "LDO_15",    "type": "power", "net": "vdd_l14_15", "trace_r_mohm": 1 },
    { "from": "VSYS", "to": "LDO_VMIC1", "type": "power", "net": "vdd_l14_15", "trace_r_mohm": 1 },
    { "from": "VSYS", "to": "LDO_VMIC2", "type": "power", "net": "vdd_l14_15", "trace_r_mohm": 1 },
    { "from": "VSYS", "to": "LDO_05",    "type": "power", "net": "vdd_l5",     "trace_r_mohm": 1 },

    /* ===== 对偶短接轨 (§4.2) =====
     * 对偶 = BUCK/LDO 输出对输出短接, 非功率流边, 不建边 (避免多父/环路);
     * 短接关系写在节点 note; 下挂统一挂 LDO 侧 (芯片默认 LDO pu=1 / BUCK pu=0) */
    /* LDO_01&BUCK_01 短接轨 → SW1, SW7 */
    { "from": "LDO_01", "to": "SW1", "type": "power", "net": "LDO_01&BUCK_01", "trace_r_mohm": 1 },
    { "from": "LDO_01", "to": "SW7", "type": "power", "net": "LDO_01&BUCK_01", "trace_r_mohm": 1 },

    /* LDO_02&BUCK_02 短接轨 → LDO_12, SW2, LDO_06 */
    { "from": "LDO_02", "to": "LDO_12", "type": "power", "net": "LDO_02&BUCK_02", "trace_r_mohm": 1 },
    { "from": "LDO_02", "to": "SW2",    "type": "power", "net": "LDO_02&BUCK_02", "trace_r_mohm": 1 },
    { "from": "LDO_02", "to": "LDO_06", "type": "power", "net": "LDO_02&BUCK_02", "trace_r_mohm": 1 },

    /* LDO_03&BUCK_03 短接轨 → SW3, SW4 */
    { "from": "LDO_03", "to": "SW3",    "type": "power", "net": "LDO_03&BUCK_03", "trace_r_mohm": 1 },
    { "from": "LDO_03", "to": "SW4",    "type": "power", "net": "LDO_03&BUCK_03", "trace_r_mohm": 1 },

    /* LDO_06&BUCK_06 跨列短接 (无下挂, §4.2) — 不建边 */

    /* ===== BUCK_03 级联子树 (§4.3) ===== */
    { "from": "BUCK_03", "to": "LDO_07", "type": "power", "net": "VDD_BUCK03_SUB", "trace_r_mohm": 2 },
    { "from": "BUCK_03", "to": "LDO_08", "type": "power", "net": "VDD_BUCK03_SUB", "trace_r_mohm": 2 },
    { "from": "BUCK_03", "to": "LDO_09", "type": "power", "net": "VDD_BUCK03_SUB", "trace_r_mohm": 2 },
    { "from": "BUCK_03", "to": "LDO_10", "type": "power", "net": "VDD_BUCK03_SUB", "trace_r_mohm": 2 },
    { "from": "BUCK_03", "to": "LDO_11", "type": "power", "net": "VDD_BUCK03_SUB", "trace_r_mohm": 2 },

    /* ===== LDO_13 单模块源 → SW5, SW6 (§4.3) ===== */
    { "from": "LDO_13", "to": "SW5", "type": "power", "net": "VDD_3V3", "trace_r_mohm": 1 },
    { "from": "LDO_13", "to": "SW6", "type": "power", "net": "VDD_3V3", "trace_r_mohm": 1 },

    /* ===== 下游负载连接 ===== */
    { "from": "BUCK_01", "to": "SOC_CORE", "type": "power", "net": "VDD_CORE", "trace_r_mohm": 5 },
    { "from": "BUCK_04", "to": "SOC_CORE", "type": "power", "net": "VDD_CORE_AUX", "trace_r_mohm": 5 },
    { "from": "BUCK_05", "to": "SOC_PERI", "type": "power", "net": "VDD_PERI_1V0", "trace_r_mohm": 5 },
    { "from": "LDO_14", "to": "SOC_PERI", "type": "power", "net": "VDD_PERI_1V8", "trace_r_mohm": 3 },
    { "from": "LDO_VMIC1", "to": "MIC_A", "type": "power", "net": "VMIC_A", "trace_r_mohm": 1 },
    { "from": "LDO_VMIC2", "to": "MIC_B", "type": "power", "net": "VMIC_B", "trace_r_mohm": 1 },
    { "from": "SW5", "to": "USB_3V3", "type": "power", "net": "VDD_USB33", "trace_r_mohm": 1 },
    { "from": "SW1", "to": "SENSOR_1V8", "type": "power", "net": "VDD_1V8_SW", "trace_r_mohm": 1 },

    /* ===== 控制边 ===== */
    { "from": "PMU_SEQ", "to": "BUCK_01", "type": "control", "sub": "EN", "signal": "EN_BUCK01" },
    { "from": "PMU_SEQ", "to": "BUCK_02", "type": "control", "sub": "EN", "signal": "EN_BUCK02" },
    { "from": "PMU_SEQ", "to": "BUCK_03", "type": "control", "sub": "EN", "signal": "EN_BUCK03" },
    { "from": "PMU_SEQ", "to": "BUCK_04", "type": "control", "sub": "EN", "signal": "EN_BUCK04" },
    { "from": "PMU_SEQ", "to": "BUCK_05", "type": "control", "sub": "EN", "signal": "EN_BUCK05" },
    { "from": "PMU_SEQ", "to": "BUCK_06", "type": "control", "sub": "EN", "signal": "EN_BUCK06" },
    { "from": "PMU_SEQ", "to": "LDO_01", "type": "control", "sub": "EN", "signal": "EN_LDO01" },
    { "from": "PMU_SEQ", "to": "LDO_02", "type": "control", "sub": "EN", "signal": "EN_LDO02" },
    { "from": "PMU_SEQ", "to": "LDO_03", "type": "control", "sub": "EN", "signal": "EN_LDO03" },
    { "from": "PMU_SEQ", "to": "LDO_05", "type": "control", "sub": "EN", "signal": "EN_LDO05" },
    { "from": "PMU_SEQ", "to": "LDO_06", "type": "control", "sub": "EN", "signal": "EN_LDO06" },
    { "from": "PMU_SEQ", "to": "LDO_07", "type": "control", "sub": "EN", "signal": "EN_LDO07" },
    { "from": "PMU_SEQ", "to": "LDO_08", "type": "control", "sub": "EN", "signal": "EN_LDO08" },
    { "from": "PMU_SEQ", "to": "LDO_09", "type": "control", "sub": "EN", "signal": "EN_LDO09" },
    { "from": "PMU_SEQ", "to": "LDO_10", "type": "control", "sub": "EN", "signal": "EN_LDO10" },
    { "from": "PMU_SEQ", "to": "LDO_11", "type": "control", "sub": "EN", "signal": "EN_LDO11" },
    { "from": "PMU_SEQ", "to": "LDO_12", "type": "control", "sub": "EN", "signal": "EN_LDO12" },
    { "from": "PMU_SEQ", "to": "LDO_13", "type": "control", "sub": "EN", "signal": "EN_LDO13" },
    { "from": "PMU_SEQ", "to": "LDO_14", "type": "control", "sub": "EN", "signal": "EN_LDO14" },
    { "from": "PMU_SEQ", "to": "LDO_15", "type": "control", "sub": "EN", "signal": "EN_LDO15" },
    { "from": "PMU_SEQ", "to": "LDO_VMIC1", "type": "control", "sub": "EN", "signal": "EN_VMIC1" },
    { "from": "PMU_SEQ", "to": "LDO_VMIC2", "type": "control", "sub": "EN", "signal": "EN_VMIC2" },
    { "from": "PMU_SEQ", "to": "SW1", "type": "control", "sub": "EN", "signal": "EN_SW1" },
    { "from": "PMU_SEQ", "to": "SW2", "type": "control", "sub": "EN", "signal": "EN_SW2" },
    { "from": "PMU_SEQ", "to": "SW3", "type": "control", "sub": "EN", "signal": "EN_SW3" },
    { "from": "PMU_SEQ", "to": "SW4", "type": "control", "sub": "EN", "signal": "EN_SW4" },
    { "from": "PMU_SEQ", "to": "SW5", "type": "control", "sub": "EN", "signal": "EN_SW5" },
    { "from": "PMU_SEQ", "to": "SW6", "type": "control", "sub": "EN", "signal": "EN_SW6" },
    { "from": "PMU_SEQ", "to": "SW7", "type": "control", "sub": "EN", "signal": "EN_SW7" },

    /* PG 反馈 */
    { "from": "BUCK_01", "to": "PMU_SEQ", "type": "control", "sub": "PG", "signal": "PG_BUCK01" },
    { "from": "BUCK_02", "to": "PMU_SEQ", "type": "control", "sub": "PG", "signal": "PG_BUCK02" },
    { "from": "BUCK_03", "to": "PMU_SEQ", "type": "control", "sub": "PG", "signal": "PG_BUCK03" }
  ]
});
