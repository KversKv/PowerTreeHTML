/* config.data.js — 全局配置 */
PT.registerData("config", {
  "defaults": {
    "lang": "zh",
    "theme": "light",
    "view": "board",
    "mode": "active",
    "colorBy": "util",
    "focusHops": 2,
    "controlEdgeVisible": false,
    "showSwimlane": false
  },
  "thresholds": {
    "derating_warn": 0.8,
    "ldo_loss_warn_mw": 500,
    "vdrop_tol_pct_default": 5
  },
  "netNaming": {
    "vinLabel": true,
    "moduleTypes": ["buck", "boost", "buck_boost", "ldo", "load_switch", "efuse", "ideal_diode", "level_shifter"],
    "pattern": "{net}_{node}"
  },
  "watermark": {
    "enabled": true,
    "text": "CONFIDENTIAL · {project} · {version}"
  },
  "nda": {
    "force": false,
    "title": {
      "zh": "保密与免责声明",
      "en": "Confidentiality & Disclaimer"
    },
    "body": {
      "zh": "本工具及其数据仅供内部评估使用,不保证准确性,以最终原理图与器件规格书为准。\n\n数据涉及商业秘密,未经授权禁止复制、外传或用于任何第三方用途。\n\n继续即表示您已阅读并同意上述条款。",
      "en": "This tool and its data are for internal evaluation only. Accuracy is not guaranteed. Final schematics and datasheets prevail.\n\nThe data contains trade secrets. Do not copy, distribute, or share without authorization.\n\nBy continuing, you acknowledge and agree to these terms."
    }
  },
  "legal": {
    "footer": {
      "zh": "机密文件 · 未经授权禁止外传 · 本工具计算结果仅供参考,不构成设计依据",
      "en": "CONFIDENTIAL · Do not distribute · Results are for reference only"
    },
    "disclaimer": {
      "zh": "本工具按\"现状\"提供,不构成任何明示或暗示担保。计算结果基于理想化模型,实际设计请以原理图、PCB 与器件规格书为准。",
      "en": "This tool is provided \"as is\" without warranty of any kind. Results are based on idealized models; refer to final schematics, PCB and datasheets."
    },
    "contact": {
      "zh": "power-tree@example.com",
      "en": "power-tree@example.com"
    }
  },
  "features": {
    "editor": true,
    "tour": true,
    "dashboard": true,
    "sequence": true
  },
  "i18nOverride": {}
});
