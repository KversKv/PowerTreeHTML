/* ============================================================
 * i18n.js — 中英文案
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;

  var DICT = {
    zh: {
      view_board: "板级视图",
      view_soc: "SoC 域视图",
      view_table: "表格",
      view_sequence: "时序",
      view_dashboard: "看板",
      mode: "模式",
      stat_typ: "典型",
      stat_max: "最大",
      color_by: "配色",
      color_util: "利用率",
      color_voltage: "电压",
      color_domain: "电源域",
      color_type: "器件类型",
      color_issue: "问题等级",
      color_pmic: "PMIC",
      control_edges: "控制边",
      search_placeholder: "搜索 (/) 名称/id/net/型号/tag",
      issues: "问题清单",
      export: "导出",
      import: "导入",
      fit: "适应",
      expand_all: "展开全部",
      collapse_all: "折叠全部",
      tour: "使用引导",
      about: "关于",
      theme: "主题",
      lang: "语言",
      copy_link: "复制视图链接",
      nda_title: "保密声明",
      nda_agree: "我已阅读并同意",
      nda_body: "本工具及其数据仅供内部评估使用,不保证准确性,以最终原理图与器件规格书为准。未经授权禁止外传。",
      footer_legal: "机密文件 · 未经授权禁止外传 · 本工具计算结果仅供参考,不构成设计依据",
      shortcuts: "快捷键",
      panel_basic: "基本信息",
      panel_elec: "电气参数",
      panel_calc: "计算结果",
      panel_eff: "效率曲线",
      panel_modes: "各模式电流",
      panel_path: "供电链路",
      panel_seq: "时序信息",
      panel_issues: "相关问题",
      panel_json: "原始 JSON",
      restore_sample: "恢复内置样例"
    },
    en: {
      view_board: "Board",
      view_soc: "SoC Domains",
      view_table: "Table",
      view_sequence: "Sequence",
      view_dashboard: "Dashboard",
      mode: "Mode",
      stat_typ: "Typ",
      stat_max: "Max",
      color_by: "Color",
      color_util: "Utilization",
      color_voltage: "Voltage",
      color_domain: "Domain",
      color_type: "Type",
      color_issue: "Issue",
      color_pmic: "PMIC",
      control_edges: "Control",
      search_placeholder: "Search (/) name/id/net/part/tag",
      issues: "Issues",
      export: "Export",
      import: "Import",
      fit: "Fit",
      expand_all: "Expand All",
      collapse_all: "Collapse All",
      tour: "Tour",
      about: "About",
      theme: "Theme",
      lang: "Language",
      copy_link: "Copy Link",
      nda_title: "Confidentiality Notice",
      nda_agree: "I have read and agree",
      nda_body: "This tool and its data are for internal evaluation only. Accuracy is not guaranteed. Final schematics and datasheets prevail. Do not distribute without authorization.",
      footer_legal: "CONFIDENTIAL · Do not distribute · Results are for reference only",
      shortcuts: "Shortcuts",
      panel_basic: "Basic",
      panel_elec: "Electrical",
      panel_calc: "Calculation",
      panel_eff: "Efficiency",
      panel_modes: "Mode Currents",
      panel_path: "Power Path",
      panel_seq: "Sequence",
      panel_issues: "Issues",
      panel_json: "Raw JSON",
      restore_sample: "Restore Sample"
    }
  };

  function t(key) {
    var lang = PT.store.get("lang") || "zh";
    var cfg = (PT.store.config && PT.store.config.i18nOverride) || {};
    if (cfg[lang] && cfg[lang][key]) return cfg[lang][key];
    return (DICT[lang] && DICT[lang][key]) || DICT.zh[key] || key;
  }

  PT.i18n = { t: t, DICT: DICT };
})();
