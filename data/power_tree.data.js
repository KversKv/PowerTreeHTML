/* power_tree.data.js — 主数据 (示例: BES1811 SoC EVB 简化电源树)
 * ≥45 节点, 覆盖全部类型, 含 5 模式 / 级联链 / 并联组 / 跨接 / 控制边
 * 故意埋 6 个可被检出的问题:
 *   [P1] Vin 越界: LDO_CAM_IN (vin_range 上限 3.3, 上游 BUCK_CAM 输出 3.3~3.5)
 *   [P2] 过流: BUCK_DDR 利用率 > 100%
 *   [P3] LDO 压差不足: LDO_PLL (Vin_min - Vout < dropout_mv)
 *   [P4] 时序违例: LDO_GPU order 早于上游 BUCK_GPU
 *   [P5] 孤立节点: LDO_SPARE (无任何边)
 *   [P6] net 重名: "VDD_1V8" 在 LDO_PERI (1.8V) 与 LDO_CODEC (3.3V) 上
 */
PT.registerData("power_tree", {
  "meta": {
    "schema_version": "1.0",
    "project": "BES1811 SoC EVB",
    "version": "v0.3",
    "date": "2026-08-14",
    "author": "PowerTeam",
    "commit": "a1b2c3d",
    "changelog": "首版: 核心域 DVFS 拆分 + 5 模式 + 级联/并联/跨接"
  },

  "modes": [
    { "id": "active",  "name_zh": "全速运行", "name_en": "Active",  "default": true },
    { "id": "dvfs_lo", "name_zh": "低频档",   "name_en": "DVFS Low" },
    { "id": "idle",    "name_zh": "轻负载",   "name_en": "Idle" },
    { "id": "suspend", "name_zh": "休眠",     "name_en": "Suspend" },
    { "id": "off",     "name_zh": "关机",     "name_en": "Off" }
  ],

  "groups": [
    { "id": "board",     "name_zh": "板级",              "kind": "board",  "parent": null,      "side": "left" },
    { "id": "pmic0",     "name_zh": "SoC 内置 PMIC",      "kind": "pmic",   "parent": "board",   "side": "left" },
    { "id": "pmic_ext",  "name_zh": "板载 PMIC",          "kind": "pmic",   "parent": "board",   "side": "left" },
    { "id": "soc_dig",   "name_zh": "数字 Power Domain",  "kind": "chip",   "parent": null,      "side": "right" },
    { "id": "pd_cpu",    "name_zh": "PD_CPU",             "kind": "domain", "parent": "soc_dig" },
    { "id": "pd_gpu",    "name_zh": "PD_GPU",             "kind": "domain", "parent": "soc_dig" },
    { "id": "pd_ddr",    "name_zh": "PD_DDR",             "kind": "domain", "parent": "soc_dig" },
    { "id": "pd_peri",   "name_zh": "PD_PERI",            "kind": "domain", "parent": "soc_dig" },
    { "id": "pd_aon",    "name_zh": "PD_AON",             "kind": "domain", "parent": "soc_dig" },
    { "id": "pd_audio",  "name_zh": "PD_AUDIO",           "kind": "domain", "parent": "soc_dig" },
    { "id": "pd_cam",    "name_zh": "PD_CAM",             "kind": "domain", "parent": "soc_dig" }
  ],

  "nodes": [
    /* ============ 源 ============ */
    { "id": "VBAT", "type": "source", "name": "单节锂电",
      "vout": 3.8, "vout_range": [3.0, 4.35], "imax": 8000,
      "side": "left", "tags": ["电池"] },

    { "id": "VBUS_5V", "type": "source", "name": "USB 5V",
      "vout": 5.0, "vout_range": [4.75, 5.25], "imax": 3000,
      "side": "left", "tags": ["USB"] },

    { "id": "VIN_12V", "type": "source", "name": "DC 12V 输入",
      "vout": 12.0, "vout_range": [11.4, 12.6], "imax": 2000,
      "side": "left" },

    /* ============ 板级: ORing / eFuse / 控制 ============ */
    { "id": "PMIC_SEQ", "type": "seq_ctrl", "name": "PMIC 时序控制器",
      "side": "left" },

    { "id": "SOC_I2C", "type": "seq_ctrl", "name": "SoC I2C 主控",
      "side": "right" },

    { "id": "ORING_1", "type": "ideal_diode", "name": "主 ORing",
      "part": "LM5050_ORING", "refdes": "U50",
      "vin_range": [1, 75], "vf_mv": 22, "rds_on_mohm": 8, "imax": 5000,
      "side": "left" },

    { "id": "EFUSE_5V", "type": "efuse", "name": "5V eFuse",
      "vin_range": [2.7, 5.5], "rds_on_mohm": 35, "imax": 2500,
      "soft_start_ms": 1.2, "refdes": "F1",
      "side": "left" },

    /* ============ 板载 BUCK ============ */
    { "id": "BUCK_5V_TO_3V3", "type": "buck", "name": "DCDC 5V→3.3V",
      "part": "AP63200_BUCK", "refdes": "U10", "sheet": "SCH-P3",
      "group": "pmic_ext",
      "vin_range": [3.8, 32], "vout": 3.3, "vout_range": [3.2, 3.4],
      "imax": 2000, "iq_ua": 22, "efficiency": 0.92,
      "enable": { "src": "PMIC_SEQ", "signal": "EN_3V3", "order": 1, "delay_ms": 0.5, "ramp_ms": 1, "pg": true },
      "on_in_modes": ["active", "dvfs_lo", "idle", "suspend"],
      "tags": ["板载"] },

    { "id": "BUCK_VSYS", "type": "buck", "name": "DCDC VBAT→VSYS",
      "part": "TPS62840_BUCK", "refdes": "U20", "sheet": "SCH-P4",
      "group": "pmic_ext",
      "vin_range": [1.8, 6.5], "vout": 3.3, "vout_range": [3.2, 3.4],
      "imax": 4000, "iq_ua": 1,
      "eff_ref": "TPS62840_BUCK",
      "enable": { "src": "PMIC_SEQ", "signal": "EN_VSYS", "order": 2, "delay_ms": 1, "ramp_ms": 1, "pg": true },
      "on_in_modes": ["active", "dvfs_lo", "idle", "suspend"],
      "tags": ["板载"] },

    /* ============ SoC 内置 PMIC (BES1811) ============ */
    { "id": "BUCK_CPU", "type": "buck", "name": "BUCK1 → VDD_CPU",
      "part": "BES1811_BUCK1", "refdes": "U100", "sheet": "SCH-P12",
      "group": "pmic0",
      "vin_range": [2.7, 5.5], "vout": 0.9, "vout_range": [0.6, 1.1], "vout_tol_pct": 3,
      "dvfs": { "active": 0.9, "dvfs_lo": 0.75, "idle": 0.7, "suspend": 0.6 },
      "imax": 6000, "iq_ua": 30,
      "eff_ref": "BES1811_BUCK1",
      "enable": { "src": "PMIC_SEQ", "signal": "EN1", "order": 3, "delay_ms": 2, "ramp_ms": 1, "pg": true },
      "on_in_modes": ["active", "dvfs_lo", "idle", "suspend"],
      "sense": "remote",
      "cascade": { "chain_id": "CH_CPU", "stage": 1 },
      "tags": ["核心域"], "note": "远端反馈,注意 Kelvin 走线" },

    { "id": "BUCK_GPU", "type": "buck", "name": "BUCK2 → VDD_GPU",
      "part": "BES1811_BUCK1", "refdes": "U101", "sheet": "SCH-P12",
      "group": "pmic0",
      "vin_range": [2.7, 5.5], "vout": 0.85, "vout_range": [0.6, 1.0], "vout_tol_pct": 3,
      "dvfs": { "active": 0.85, "dvfs_lo": 0.7, "idle": 0.65 },
      "imax": 5000, "iq_ua": 28,
      "efficiency": 0.88,
      "enable": { "src": "PMIC_SEQ", "signal": "EN2", "order": 5, "delay_ms": 1, "ramp_ms": 1, "pg": true },
      "on_in_modes": ["active", "dvfs_lo"],
      "sense": "remote",
      "tags": ["GPU"] },

    { "id": "BUCK_DDR", "type": "buck", "name": "BUCK3 → VDD_DDR",
      "part": "BES1811_BUCK1", "refdes": "U102", "sheet": "SCH-P12",
      "group": "pmic0",
      "vin_range": [2.7, 5.5], "vout": 1.1, "vout_range": [1.0, 1.2],
      "imax": 3000, "iq_ua": 30,
      "efficiency": 0.9,
      "enable": { "src": "PMIC_SEQ", "signal": "EN3", "order": 4, "delay_ms": 1, "ramp_ms": 1, "pg": true },
      "on_in_modes": ["active", "dvfs_lo", "idle", "suspend"],
      "tags": ["DDR"] },

    { "id": "BUCK_CAM", "type": "buck", "name": "BUCK4 → VDD_CAM",
      "part": "BES1811_BUCK1", "refdes": "U103", "sheet": "SCH-P12",
      "group": "pmic0",
      "vin_range": [2.7, 5.5], "vout": 3.3, "vout_range": [3.3, 3.5],
      "imax": 1500, "iq_ua": 25,
      "efficiency": 0.9,
      "enable": { "src": "SOC_GPIO12", "signal": "CAM_EN", "order": 8, "delay_ms": 1, "ramp_ms": 0.5 },
      "on_in_modes": ["active"],
      "tags": ["Camera"] },

    { "id": "BUCK_PERI", "type": "buck", "name": "BUCK5 → VDD_PERI",
      "part": "BES1811_BUCK1", "refdes": "U104", "sheet": "SCH-P12",
      "group": "pmic0",
      "vin_range": [2.7, 5.5], "vout": 1.8, "vout_range": [1.7, 1.9],
      "imax": 2500, "iq_ua": 28,
      "efficiency": 0.9,
      "enable": { "src": "PMIC_SEQ", "signal": "EN5", "order": 6, "delay_ms": 1, "ramp_ms": 1 },
      "on_in_modes": ["active", "dvfs_lo", "idle"],
      "parallel_group": "PG_PERI",
      "tags": ["外设"] },

    { "id": "BUCK_PERI_B", "type": "buck", "name": "BUCK6 → VDD_PERI (并联 B)",
      "part": "BES1811_BUCK1", "refdes": "U105", "sheet": "SCH-P12",
      "group": "pmic0",
      "vin_range": [2.7, 5.5], "vout": 1.8, "vout_range": [1.7, 1.9],
      "imax": 2500, "iq_ua": 28,
      "efficiency": 0.9,
      "enable": { "src": "PMIC_SEQ", "signal": "EN6", "order": 6, "delay_ms": 1, "ramp_ms": 1 },
      "on_in_modes": ["active", "dvfs_lo", "idle"],
      "parallel_group": "PG_PERI",
      "tags": ["外设", "并联"] },

    /* ============ SoC 内置 LDO ============ */
    { "id": "LDO_PLL", "type": "ldo", "name": "LDO1 → VDD_PLL",
      "part": "BES1811_LDO1", "refdes": "U110", "sheet": "SCH-P13",
      "group": "pmic0",
      "vin_range": [1.5, 5.5], "vout": 0.85,
      "dropout_mv": 150, "imax": 300, "iq_ua": 15,
      "cascade": { "chain_id": "CH_CPU", "stage": 2 },
      "enable": { "src": "SOC_GPIO7", "signal": "PLL_EN", "order": 7, "delay_ms": 1 },
      "on_in_modes": ["active", "dvfs_lo"],
      "tags": ["PLL"] },

    { "id": "LDO_AUDIO", "type": "ldo", "name": "LDO2 → VDD_AUDIO",
      "part": "BES1811_LDO1", "refdes": "U111", "sheet": "SCH-P13",
      "group": "pmic0",
      "vin_range": [1.5, 5.5], "vout": 1.8,
      "dropout_mv": 150, "imax": 250, "iq_ua": 12,
      "enable": { "src": "PMIC_SEQ", "signal": "EN_LDO_AUD", "order": 9, "delay_ms": 1 },
      "on_in_modes": ["active", "dvfs_lo", "idle"],
      "tags": ["音频"] },

    { "id": "LDO_PERI", "type": "ldo", "name": "LDO3 → VDD_1V8_PERI",
      "part": "BES1811_LDO1", "refdes": "U112", "sheet": "SCH-P13",
      "group": "pmic0",
      "vin_range": [1.5, 5.5], "vout": 1.8,
      "dropout_mv": 150, "imax": 400, "iq_ua": 15,
      "enable": { "src": "PMIC_SEQ", "signal": "EN_LDO_PERI", "order": 10, "delay_ms": 1 },
      "on_in_modes": ["active", "dvfs_lo", "idle"],
      "tags": ["外设"] },

    { "id": "LDO_CODEC", "type": "ldo", "name": "LDO4 → VDD_CODEC (3.3V)",
      "part": "BES1811_LDO1", "refdes": "U113", "sheet": "SCH-P13",
      "group": "pmic0",
      "vin_range": [3.0, 5.5], "vout": 3.3,
      "dropout_mv": 200, "imax": 200, "iq_ua": 18,
      "enable": { "src": "PMIC_SEQ", "signal": "EN_LDO_CODEC", "order": 11, "delay_ms": 1 },
      "on_in_modes": ["active", "dvfs_lo"],
      "tags": ["音频", "CODEC"] },

    { "id": "LDO_CAM_IN", "type": "ldo", "name": "LDO5 → VDD_CAM_LDO",
      "part": "BES1811_LDO1", "refdes": "U114", "sheet": "SCH-P13",
      "group": "pmic0",
      "vin_range": [1.5, 3.3], "vout": 2.8,
      "dropout_mv": 150, "imax": 300, "iq_ua": 12,
      "enable": { "src": "SOC_GPIO12", "signal": "CAM_LDO_EN", "order": 12, "delay_ms": 0.5 },
      "on_in_modes": ["active"],
      "tags": ["Camera"] },

    { "id": "LDO_AON", "type": "ldo", "name": "LDO_AON → VDD_AON",
      "part": "BES1811_LDO1", "refdes": "U115", "sheet": "SCH-P13",
      "group": "pmic0",
      "vin_range": [1.5, 5.5], "vout": 1.0,
      "dropout_mv": 150, "imax": 100, "iq_ua": 5,
      "always_on": true,
      "on_in_modes": ["active", "dvfs_lo", "idle", "suspend"],
      "tags": ["AON"] },

    /* P4: 时序违例 — LDO_GPU order=4 早于上游 BUCK_GPU order=5 */
    { "id": "LDO_GPU", "type": "ldo", "name": "LDO_GPU → VDD_GPU_ANA",
      "part": "BES1811_LDO1", "refdes": "U116", "sheet": "SCH-P13",
      "group": "pmic0",
      "vin_range": [1.5, 5.5], "vout": 0.8,
      "dropout_mv": 150, "imax": 150, "iq_ua": 10,
      "enable": { "src": "SOC_GPIO8", "signal": "GPU_ANA_EN", "order": 4, "delay_ms": 0.5 },
      "on_in_modes": ["active", "dvfs_lo"],
      "tags": ["GPU"] },

    /* P5: 孤立节点 */
    { "id": "LDO_SPARE", "type": "ldo", "name": "LDO_SPARE (备用)",
      "part": "BES1811_LDO1", "refdes": "U117",
      "vin_range": [1.5, 5.5], "vout": 1.2,
      "imax": 100 },

    /* ============ 负载开关 ============ */
    { "id": "LS_CAM", "type": "load_switch", "name": "Camera 负载开关",
      "part": "TPS22946_LSW", "refdes": "U30",
      "vin_range": [1.7, 5.5], "rds_on_mohm": 45, "imax": 2000,
      "soft_start_ms": 0.8,
      "enable": { "src": "SOC_GPIO12", "signal": "CAM_EN", "order": 8 },
      "on_in_modes": ["active"] },

    { "id": "LS_WIFI", "type": "load_switch", "name": "WiFi 负载开关",
      "part": "TPS22946_LSW", "refdes": "U31",
      "vin_range": [1.7, 5.5], "rds_on_mohm": 50, "imax": 1500,
      "soft_start_ms": 0.6,
      "enable": { "src": "SOC_GPIO15", "signal": "WIFI_EN", "order": 13 },
      "on_in_modes": ["active", "dvfs_lo", "idle"] },

    { "id": "LS_SD", "type": "load_switch", "name": "SD 卡负载开关",
      "part": "TPS22946_LSW", "refdes": "U32",
      "vin_range": [1.7, 5.5], "rds_on_mohm": 55, "imax": 800,
      "soft_start_ms": 0.5,
      "enable": { "src": "SOC_GPIO16", "signal": "SD_EN", "order": 14 },
      "on_in_modes": ["active", "dvfs_lo", "idle"] },

    { "id": "LS_USB_OTG", "type": "load_switch", "name": "USB OTG 供电开关",
      "part": "TPS22946_LSW", "refdes": "U33",
      "vin_range": [4.75, 5.5], "rds_on_mohm": 60, "imax": 1000,
      "soft_start_ms": 1.0,
      "enable": { "src": "SOC_GPIO17", "signal": "OTG_EN", "order": 15 },
      "on_in_modes": ["active"] },

    /* ============ 升降压 ============ */
    { "id": "BUCKBOOST_1V8", "type": "buck_boost", "name": "升降压 → 1.8V 常开",
      "refdes": "U40", "sheet": "SCH-P5",
      "vin_range": [2.5, 5.5], "vout": 1.8, "vout_range": [1.75, 1.85],
      "imax": 800, "iq_ua": 10, "efficiency": 0.85,
      "enable": { "src": "PMIC_SEQ", "signal": "EN_BB", "order": 2, "delay_ms": 1 },
      "on_in_modes": ["active", "dvfs_lo", "idle", "suspend"],
      "tags": ["常开"] },

    { "id": "BOOST_LCD", "type": "boost", "name": "BOOST → LCD 背光",
      "refdes": "U41", "sheet": "SCH-P6",
      "vin_range": [2.7, 4.5], "vout": 12.0, "vout_range": [11.5, 12.5],
      "imax": 600, "iq_ua": 30, "efficiency": 0.85,
      "enable": { "src": "SOC_GPIO20", "signal": "LCD_EN", "order": 16 },
      "on_in_modes": ["active"],
      "tags": ["显示"] },

    /* ============ 无源 / 其他 ============ */
    { "id": "R_SNS_CPU", "type": "passive_r", "name": "CPU 采样电阻",
      "r_mohm": 10, "power_mw": 500, "tol_pct": 1 },

    { "id": "R_SNS_DDR", "type": "passive_r", "name": "DDR 采样电阻",
      "r_mohm": 15, "power_mw": 500, "tol_pct": 1 },

    { "id": "L_FIL_CPU", "type": "passive_l", "name": "CPU 磁珠",
      "l_uh": 2.2, "dcr_mohm": 40, "isat": 5000 },

    { "id": "L_FIL_AUDIO", "type": "passive_l", "name": "AUDIO 磁珠",
      "l_uh": 1.0, "dcr_mohm": 30, "isat": 800 },

    { "id": "C_BULK_VBAT", "type": "passive_c", "name": "VBAT 大电容",
      "c_uf": 100, "esr_mohm": 8, "volt_rating": 6.3 },

    { "id": "C_BULK_VSYS", "type": "passive_c", "name": "VSYS 大电容",
      "c_uf": 47, "esr_mohm": 10, "volt_rating": 6.3 },

    { "id": "C_DEC_CPU", "type": "passive_c", "name": "CPU 去耦",
      "c_uf": 22, "esr_mohm": 5, "volt_rating": 4.0 },

    { "id": "C_DEC_DDR", "type": "passive_c", "name": "DDR 去耦",
      "c_uf": 22, "esr_mohm": 5, "volt_rating": 4.0 },

    /* 分压 / 电平转换 */
    { "id": "DIVIDER_BAT_MON", "type": "divider", "name": "电池电压分压监测",
      "ratio": 0.5, "ratio_str": "1:1",
      "tags": ["监测"] },

    { "id": "LS_I2C_LEVEL", "type": "level_shifter", "name": "I2C 电平转换",
      "vin_range": [1.65, 5.5],
      "tags": ["I2C"] },

    /* 虚拟节点 */
    { "id": "VDD_3V3_NET", "type": "virtual", "name": "3.3V 网络" },

    /* ============ 负载 (Power Domain) ============ */
    { "id": "VDD_CPU", "type": "load", "name": "CPU 域",
      "group": "pd_cpu", "domain": "PD_CPU", "voltage": 0.9,
      "always_on": false, "retention": true,
      "current": {
        "active":  { "typ": 3200, "max": 4500 },
        "dvfs_lo": { "typ": 1200, "max": 1800 },
        "idle":    { "typ": 600,  "max": 900 },
        "suspend": { "typ": 3,    "max": 8 },
        "off":     { "typ": 0,    "max": 0 }
      },
      "vtol_pct": 5,
      "iso_signal": "ISO_CPU", "reset_signal": "RST_CPU",
      "tags": ["核心"] },

    { "id": "VDD_CPU_PLL", "type": "load", "name": "CPU PLL 域",
      "group": "pd_cpu", "domain": "PD_CPU", "voltage": 0.85,
      "retention": true,
      "current": {
        "active":  { "typ": 80,  "max": 120 },
        "dvfs_lo": { "typ": 60,  "max": 90 },
        "idle":    { "typ": 30,  "max": 50 },
        "suspend": { "typ": 1,   "max": 2 },
        "off":     { "typ": 0,   "max": 0 }
      },
      "iso_signal": "ISO_CPU", "reset_signal": "RST_CPU" },

    { "id": "VDD_GPU", "type": "load", "name": "GPU 域",
      "group": "pd_gpu", "domain": "PD_GPU", "voltage": 0.85,
      "retention": false,
      "current": {
        "active":  { "typ": 2800, "max": 4200 },
        "dvfs_lo": { "typ": 1000, "max": 1500 },
        "idle":    { "typ": 0,    "max": 0 },
        "suspend": { "typ": 0,    "max": 0 },
        "off":     { "typ": 0,    "max": 0 }
      },
      "iso_signal": "ISO_GPU", "reset_signal": "RST_GPU" },

    { "id": "VDD_GPU_ANA", "type": "load", "name": "GPU 模拟域",
      "group": "pd_gpu", "domain": "PD_GPU", "voltage": 0.8,
      "current": {
        "active":  { "typ": 60, "max": 90 },
        "dvfs_lo": { "typ": 40, "max": 60 },
        "idle":    { "typ": 0,  "max": 0 },
        "suspend": { "typ": 0,  "max": 0 },
        "off":     { "typ": 0,  "max": 0 }
      } },

    { "id": "VDD_DDR", "type": "load", "name": "DDR 控制器 + PHY",
      "group": "pd_ddr", "domain": "PD_DDR", "voltage": 1.1,
      "retention": true,
      "current": {
        "active":  { "typ": 1800, "max": 2600 },
        "dvfs_lo": { "typ": 900,  "max": 1300 },
        "idle":    { "typ": 400,  "max": 600 },
        "suspend": { "typ": 60,   "max": 100 },
        "off":     { "typ": 0,    "max": 0 }
      },
      "vtol_pct": 3,
      "iso_signal": "ISO_DDR", "reset_signal": "RST_DDR" },

    { "id": "VDD_DDR_MEM", "type": "load", "name": "DDR 颗粒",
      "group": "pd_ddr", "domain": "PD_DDR", "voltage": 1.1,
      "current": {
        "active":  { "typ": 1500, "max": 2200 },
        "dvfs_lo": { "typ": 700,  "max": 1000 },
        "idle":    { "typ": 300,  "max": 500 },
        "suspend": { "typ": 50,   "max": 80 },
        "off":     { "typ": 0,    "max": 0 }
      } },

    { "id": "VDD_PERI", "type": "load", "name": "外设域 (UART/SPI/I2C)",
      "group": "pd_peri", "domain": "PD_PERI", "voltage": 1.8,
      "retention": false,
      "current": {
        "active":  { "typ": 400, "max": 600 },
        "dvfs_lo": { "typ": 300, "max": 450 },
        "idle":    { "typ": 200, "max": 300 },
        "suspend": { "typ": 0,   "max": 0 },
        "off":     { "typ": 0,   "max": 0 }
      },
      "iso_signal": "ISO_PERI", "reset_signal": "RST_PERI" },

    { "id": "VDD_PERI_1V8", "type": "load", "name": "外设 1.8V 子域",
      "group": "pd_peri", "domain": "PD_PERI", "voltage": 1.8,
      "current": {
        "active":  { "typ": 200, "max": 300 },
        "dvfs_lo": { "typ": 150, "max": 220 },
        "idle":    { "typ": 100, "max": 150 },
        "suspend": { "typ": 0,   "max": 0 },
        "off":     { "typ": 0,   "max": 0 }
      } },

    { "id": "VDD_AON", "type": "load", "name": "常开域 (RTC/PMU)",
      "group": "pd_aon", "domain": "PD_AON", "voltage": 1.0,
      "always_on": true, "retention": true,
      "current": {
        "active":  { "typ": 5,  "max": 10 },
        "dvfs_lo": { "typ": 5,  "max": 10 },
        "idle":    { "typ": 4,  "max": 8 },
        "suspend": { "typ": 3,  "max": 6 },
        "off":     { "typ": 0,  "max": 0 }
      } },

    { "id": "VDD_AUDIO", "type": "load", "name": "音频域 (I2S/Audio PLL)",
      "group": "pd_audio", "domain": "PD_AUDIO", "voltage": 1.8,
      "retention": false,
      "current": {
        "active":  { "typ": 120, "max": 180 },
        "dvfs_lo": { "typ": 100, "max": 150 },
        "idle":    { "typ": 50,  "max": 80 },
        "suspend": { "typ": 0,   "max": 0 },
        "off":     { "typ": 0,   "max": 0 }
      },
      "iso_signal": "ISO_AUD", "reset_signal": "RST_AUD" },

    { "id": "VDD_CODEC", "type": "load", "name": "CODEC 芯片",
      "group": "pd_audio", "domain": "PD_AUDIO", "voltage": 3.3,
      "current": {
        "active":  { "typ": 100, "max": 150 },
        "dvfs_lo": { "typ": 80,  "max": 120 },
        "idle":    { "typ": 0,   "max": 0 },
        "suspend": { "typ": 0,   "max": 0 },
        "off":     { "typ": 0,   "max": 0 }
      } },

    { "id": "VDD_CAM", "type": "load", "name": "Camera 模组",
      "group": "pd_cam", "domain": "PD_CAM", "voltage": 3.3,
      "current": {
        "active":  { "typ": 500, "max": 800 },
        "dvfs_lo": { "typ": 0,   "max": 0 },
        "idle":    { "typ": 0,   "max": 0 },
        "suspend": { "typ": 0,   "max": 0 },
        "off":     { "typ": 0,   "max": 0 }
      },
      "iso_signal": "ISO_CAM", "reset_signal": "RST_CAM" },

    { "id": "VDD_CAM_ANA", "type": "load", "name": "Camera 模拟部分",
      "group": "pd_cam", "domain": "PD_CAM", "voltage": 2.8,
      "current": {
        "active":  { "typ": 120, "max": 200 },
        "dvfs_lo": { "typ": 0,   "max": 0 },
        "idle":    { "typ": 0,   "max": 0 },
        "suspend": { "typ": 0,   "max": 0 },
        "off":     { "typ": 0,   "max": 0 }
      } },

    { "id": "VDD_WIFI", "type": "load", "name": "WiFi/BT 模组",
      "group": "pd_peri", "domain": "PD_PERI", "voltage": 3.3,
      "current": {
        "active":  { "typ": 600, "max": 900 },
        "dvfs_lo": { "typ": 400, "max": 600 },
        "idle":    { "typ": 200, "max": 300 },
        "suspend": { "typ": 10,  "max": 20 },
        "off":     { "typ": 0,   "max": 0 }
      } },

    { "id": "VDD_SD", "type": "load", "name": "SD 卡",
      "group": "pd_peri", "domain": "PD_PERI", "voltage": 3.3,
      "current": {
        "active":  { "typ": 150, "max": 300 },
        "dvfs_lo": { "typ": 100, "max": 200 },
        "idle":    { "typ": 50,  "max": 100 },
        "suspend": { "typ": 0,   "max": 0 },
        "off":     { "typ": 0,   "max": 0 }
      } },

    { "id": "VDD_USB_OTG", "type": "load", "name": "USB OTG 外设",
      "group": "pd_peri", "domain": "PD_PERI", "voltage": 5.0,
      "current": {
        "active":  { "typ": 500, "max": 800 },
        "dvfs_lo": { "typ": 0,   "max": 0 },
        "idle":    { "typ": 0,   "max": 0 },
        "suspend": { "typ": 0,   "max": 0 },
        "off":     { "typ": 0,   "max": 0 }
      } },

    { "id": "VDD_LCD", "type": "load", "name": "LCD 背光",
      "group": "pd_peri", "voltage": 12.0,
      "current": {
        "active":  { "typ": 400, "max": 550 },
        "dvfs_lo": { "typ": 0,   "max": 0 },
        "idle":    { "typ": 0,   "max": 0 },
        "suspend": { "typ": 0,   "max": 0 },
        "off":     { "typ": 0,   "max": 0 }
      } }
  ],

  "edges": [
    /* ============ 电源边 ============ */
    /* 电池 → ORing → VBAT 主干 */
    { "from": "VBAT", "to": "ORING_1", "type": "power", "net": "VBAT",
      "trace_r_mohm": 4 },

    /* USB 5V 也通过 ORing 合路 */
    { "from": "VBUS_5V", "to": "ORING_1", "type": "power", "net": "VBUS_5V",
      "trace_r_mohm": 3 },

    /* ORing → eFuse (5V 路径) */
    { "from": "ORING_1", "to": "EFUSE_5V", "type": "power", "net": "VSYS_PRE",
      "trace_r_mohm": 2 },

    /* eFuse → 板载 BUCK */
    { "from": "EFUSE_5V", "to": "BUCK_5V_TO_3V3", "type": "power", "net": "VSYS",
      "trace_r_mohm": 3 },

    /* ORing → VSYS BUCK */
    { "from": "ORING_1", "to": "BUCK_VSYS", "type": "power", "net": "VSYS_RAW",
      "trace_r_mohm": 3,
      "inline": [ { "type": "passive_r", "r_mohm": 10, "name": "串阻" } ] },

    /* VSYS → SoC 内置 PMIC (所有 BUCK/LDO 的 vin) */
    { "from": "BUCK_VSYS", "to": "BUCK_CPU", "type": "power", "net": "VSYS",
      "trace_r_mohm": 5 },
    { "from": "BUCK_VSYS", "to": "BUCK_GPU", "type": "power", "net": "VSYS",
      "trace_r_mohm": 5 },
    { "from": "BUCK_VSYS", "to": "BUCK_DDR", "type": "power", "net": "VSYS",
      "trace_r_mohm": 5 },
    { "from": "BUCK_VSYS", "to": "BUCK_CAM", "type": "power", "net": "VSYS",
      "trace_r_mohm": 5 },
    { "from": "BUCK_VSYS", "to": "BUCK_PERI", "type": "power", "net": "VSYS",
      "trace_r_mohm": 5 },
    { "from": "BUCK_VSYS", "to": "BUCK_PERI_B", "type": "power", "net": "VSYS",
      "trace_r_mohm": 5 },
    { "from": "BUCK_VSYS", "to": "LDO_AUDIO", "type": "power", "net": "VSYS",
      "trace_r_mohm": 5 },
    { "from": "BUCK_VSYS", "to": "LDO_PERI", "type": "power", "net": "VSYS",
      "trace_r_mohm": 5 },
    { "from": "BUCK_VSYS", "to": "LDO_CODEC", "type": "power", "net": "VSYS",
      "trace_r_mohm": 5 },
    { "from": "BUCK_VSYS", "to": "LDO_AON", "type": "power", "net": "VSYS",
      "trace_r_mohm": 5 },

    /* 级联: BUCK_CPU → LDO_PLL → VDD_CPU_PLL */
    { "from": "BUCK_CPU", "to": "LDO_PLL", "type": "power", "net": "VDD_CPU_PRE",
      "trace_r_mohm": 2 },
    { "from": "LDO_PLL", "to": "VDD_CPU_PLL", "type": "power", "net": "VDD_CPU_PLL",
      "trace_r_mohm": 1 },

    /* BUCK_CPU → CPU 域 */
    { "from": "BUCK_CPU", "to": "VDD_CPU", "type": "power", "net": "VDD_CPU",
      "trace_r_mohm": 6 },

    /* BUCK_GPU → GPU 域 + GPU LDO */
    { "from": "BUCK_GPU", "to": "VDD_GPU", "type": "power", "net": "VDD_GPU",
      "trace_r_mohm": 5 },
    { "from": "BUCK_GPU", "to": "LDO_GPU", "type": "power", "net": "VDD_GPU_PRE",
      "trace_r_mohm": 2 },
    { "from": "LDO_GPU", "to": "VDD_GPU_ANA", "type": "power", "net": "VDD_GPU_ANA",
      "trace_r_mohm": 1 },

    /* BUCK_DDR → DDR 域 + 颗粒 */
    { "from": "BUCK_DDR", "to": "VDD_DDR", "type": "power", "net": "VDD_DDR",
      "trace_r_mohm": 4 },
    { "from": "BUCK_DDR", "to": "VDD_DDR_MEM", "type": "power", "net": "VDD_DDR_MEM",
      "trace_r_mohm": 3 },

    /* BUCK_CAM → LDO_CAM_IN + LS_CAM → CAM */
    { "from": "BUCK_CAM", "to": "LDO_CAM_IN", "type": "power", "net": "VDD_CAM_PRE",
      "trace_r_mohm": 2 },
    { "from": "BUCK_CAM", "to": "LS_CAM", "type": "power", "net": "VDD_CAM_RAW",
      "trace_r_mohm": 2 },
    { "from": "LDO_CAM_IN", "to": "VDD_CAM_ANA", "type": "power", "net": "VDD_CAM_ANA",
      "trace_r_mohm": 1 },
    { "from": "LS_CAM", "to": "VDD_CAM", "type": "power", "net": "VDD_CAM",
      "trace_r_mohm": 2 },

    /* 并联: BUCK_PERI + BUCK_PERI_B 共同供 VDD_PERI */
    { "from": "BUCK_PERI", "to": "VDD_PERI", "type": "power", "net": "VDD_PERI",
      "trace_r_mohm": 4 },
    { "from": "BUCK_PERI_B", "to": "VDD_PERI", "type": "power", "net": "VDD_PERI",
      "trace_r_mohm": 4 },

    /* LDO_PERI → VDD_PERI_1V8 (跨接到 1V8 子域) — 这就是 P6 的冲突之一 */
    { "from": "LDO_PERI", "to": "VDD_PERI_1V8", "type": "power", "net": "VDD_1V8",
      "trace_r_mohm": 3 },

    /* LDO_CODEC → VDD_CODEC — P6 另一半: 同名 net 但电压 3.3V */
    { "from": "LDO_CODEC", "to": "VDD_CODEC", "type": "power", "net": "VDD_1V8",
      "trace_r_mohm": 3 },

    /* LDO_AUDIO → VDD_AUDIO */
    { "from": "LDO_AUDIO", "to": "VDD_AUDIO", "type": "power", "net": "VDD_AUDIO",
      "trace_r_mohm": 2,
      "inline": [ { "type": "passive_l", "dcr_mohm": 30, "l_uh": 1.0, "name": "磁珠" } ] },

    /* LDO_AON → VDD_AON */
    { "from": "LDO_AON", "to": "VDD_AON", "type": "power", "net": "VDD_AON",
      "trace_r_mohm": 1 },

    /* BUCKBOOST_1V8 → VDD_AON (跨接, 作为备份) */
    { "from": "BUCKBOOST_1V8", "to": "VDD_AON", "type": "power", "net": "VDD_AON_BAK",
      "trace_r_mohm": 3 },

    /* BUCKBOOST_1V8 由 VBAT 直供 */
    { "from": "VBAT", "to": "BUCKBOOST_1V8", "type": "power", "net": "VBAT_RAW",
      "trace_r_mohm": 3 },

    /* BOOST_LCD 由 VBAT 直供 */
    { "from": "VBAT", "to": "BOOST_LCD", "type": "power", "net": "VBAT_RAW",
      "trace_r_mohm": 4 },
    { "from": "BOOST_LCD", "to": "VDD_LCD", "type": "power", "net": "VDD_LCD",
      "trace_r_mohm": 5 },

    /* 5V → LS_USB_OTG → VDD_USB_OTG */
    { "from": "EFUSE_5V", "to": "LS_USB_OTG", "type": "power", "net": "VSYS_5V",
      "trace_r_mohm": 3 },
    { "from": "LS_USB_OTG", "to": "VDD_USB_OTG", "type": "power", "net": "VDD_USB_OTG",
      "trace_r_mohm": 2 },

    /* 3.3V → LS_WIFI / LS_SD */
    { "from": "BUCK_5V_TO_3V3", "to": "LS_WIFI", "type": "power", "net": "VDD_3V3",
      "trace_r_mohm": 3 },
    { "from": "BUCK_5V_TO_3V3", "to": "LS_SD", "type": "power", "net": "VDD_3V3",
      "trace_r_mohm": 3 },
    { "from": "LS_WIFI", "to": "VDD_WIFI", "type": "power", "net": "VDD_WIFI",
      "trace_r_mohm": 2 },
    { "from": "LS_SD", "to": "VDD_SD", "type": "power", "net": "VDD_SD",
      "trace_r_mohm": 2 },

    /* 12V → BOOST_LCD (另一路) — 实际上不接, 这里只示意 VIN_12V 独立 */
    /* (VIN_12V 暂无下游, 会触发孤立节点 W 级提示 — 但严格来说也是孤立的, 可保留作为示例) */

    /* 无源 */
    { "from": "BUCK_CPU", "to": "R_SNS_CPU", "type": "power", "net": "VDD_CPU_SNS",
      "trace_r_mohm": 1 },
    { "from": "BUCK_DDR", "to": "R_SNS_DDR", "type": "power", "net": "VDD_DDR_SNS",
      "trace_r_mohm": 1 },
    { "from": "BUCK_CPU", "to": "L_FIL_CPU", "type": "power", "net": "VDD_CPU_FIL",
      "trace_r_mohm": 1 },
    { "from": "LDO_AUDIO", "to": "L_FIL_AUDIO", "type": "power", "net": "VDD_AUD_FIL",
      "trace_r_mohm": 1 },
    { "from": "VBAT", "to": "C_BULK_VBAT", "type": "power", "net": "VBAT",
      "trace_r_mohm": 2 },
    { "from": "BUCK_VSYS", "to": "C_BULK_VSYS", "type": "power", "net": "VSYS",
      "trace_r_mohm": 2 },
    { "from": "BUCK_CPU", "to": "C_DEC_CPU", "type": "power", "net": "VDD_CPU",
      "trace_r_mohm": 1 },
    { "from": "BUCK_DDR", "to": "C_DEC_DDR", "type": "power", "net": "VDD_DDR",
      "trace_r_mohm": 1 },
    { "from": "VBAT", "to": "DIVIDER_BAT_MON", "type": "power", "net": "VBAT_MON",
      "trace_r_mohm": 5 },
    { "from": "BUCK_VSYS", "to": "VDD_3V3_NET", "type": "power", "net": "VDD_3V3",
      "trace_r_mohm": 1 },

    /* ============ 控制边 ============ */
    /* PMIC_SEQ 输出 EN */
    { "from": "PMIC_SEQ", "to": "BUCK_5V_TO_3V3", "type": "control", "sub": "EN", "signal": "EN_3V3" },
    { "from": "PMIC_SEQ", "to": "BUCK_VSYS", "type": "control", "sub": "EN", "signal": "EN_VSYS" },
    { "from": "PMIC_SEQ", "to": "BUCK_CPU", "type": "control", "sub": "EN", "signal": "EN1" },
    { "from": "PMIC_SEQ", "to": "BUCK_GPU", "type": "control", "sub": "EN", "signal": "EN2" },
    { "from": "PMIC_SEQ", "to": "BUCK_DDR", "type": "control", "sub": "EN", "signal": "EN3" },
    { "from": "PMIC_SEQ", "to": "BUCK_PERI", "type": "control", "sub": "EN", "signal": "EN5" },
    { "from": "PMIC_SEQ", "to": "BUCK_PERI_B", "type": "control", "sub": "EN", "signal": "EN6" },
    { "from": "PMIC_SEQ", "to": "LDO_AUDIO", "type": "control", "sub": "EN", "signal": "EN_LDO_AUD" },
    { "from": "PMIC_SEQ", "to": "LDO_PERI", "type": "control", "sub": "EN", "signal": "EN_LDO_PERI" },
    { "from": "PMIC_SEQ", "to": "LDO_CODEC", "type": "control", "sub": "EN", "signal": "EN_LDO_CODEC" },
    { "from": "PMIC_SEQ", "to": "BUCKBOOST_1V8", "type": "control", "sub": "EN", "signal": "EN_BB" },

    /* PG 反馈 */
    { "from": "BUCK_CPU", "to": "PMIC_SEQ", "type": "control", "sub": "PG", "signal": "PG1" },
    { "from": "BUCK_GPU", "to": "PMIC_SEQ", "type": "control", "sub": "PG", "signal": "PG2" },
    { "from": "BUCK_DDR", "to": "PMIC_SEQ", "type": "control", "sub": "PG", "signal": "PG3" },
    { "from": "BUCK_VSYS", "to": "PMIC_SEQ", "type": "control", "sub": "PG", "signal": "PG_VSYS" },

    /* SoC GPIO 控制 */
    { "from": "SOC_I2C", "to": "pmic0", "type": "control", "sub": "I2C", "signal": "I2C0" },

    /* ISO / RESET 控制 */
    { "from": "PMIC_SEQ", "to": "VDD_CPU", "type": "control", "sub": "ISO", "signal": "ISO_CPU" },
    { "from": "PMIC_SEQ", "to": "VDD_CPU", "type": "control", "sub": "RESET", "signal": "RST_CPU" },
    { "from": "PMIC_SEQ", "to": "VDD_GPU", "type": "control", "sub": "ISO", "signal": "ISO_GPU" },
    { "from": "PMIC_SEQ", "to": "VDD_GPU", "type": "control", "sub": "RESET", "signal": "RST_GPU" },
    { "from": "PMIC_SEQ", "to": "VDD_DDR", "type": "control", "sub": "ISO", "signal": "ISO_DDR" },
    { "from": "PMIC_SEQ", "to": "VDD_PERI", "type": "control", "sub": "ISO", "signal": "ISO_PERI" },
    { "from": "PMIC_SEQ", "to": "VDD_AUDIO", "type": "control", "sub": "ISO", "signal": "ISO_AUD" },
    { "from": "PMIC_SEQ", "to": "VDD_CAM", "type": "control", "sub": "ISO", "signal": "ISO_CAM" },

    /* SENSE */
    { "from": "VDD_CPU", "to": "BUCK_CPU", "type": "control", "sub": "SENSE", "signal": "CPU_FB" },
    { "from": "VDD_DDR", "to": "BUCK_DDR", "type": "control", "sub": "SENSE", "signal": "DDR_FB" }
  ]
});
