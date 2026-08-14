/* ============================================================
 * export-csv.js — 导出 CSV (UTF-8 带 BOM, Excel 直开不乱码)
 * - rail 预算表
 * - 问题清单
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;

  var BOM = "﻿";

  function _csvEscape(v) {
    if (v == null) return "";
    var s = String(v);
    if (s.indexOf(",") >= 0 || s.indexOf('"') >= 0 || s.indexOf("\n") >= 0) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  /** rail 预算表 */
  function exportBudgetCsv() {
    var graph = PT.store.graph;
    if (!graph) return;
    var modeId = PT.store.get("mode");
    var header = ["Rail ID", "名称", "类型", "Vout(V)", "I_typ(mA)", "I_max(mA)", "imax(mA)", "利用率", "Vdrop(mV)", "损耗(mW)", "问题数"];
    var lines = [header.join(",")];

    graph.nodeList().forEach(function (n) {
      if (n.type === "passive_r" || n.type === "passive_l" || n.type === "passive_c") return;
      if (n.type === "seq_ctrl") return;
      var vout = PT.engine.nodeVout(n, modeId);
      var iTyp = 0, iMax = 0;
      graph.powerOutEdges(n.id).forEach(function (e) {
        var tn = graph.node(e.to);
        if (!tn) return;
        if (!PT.engine.isOnInMode(tn, modeId)) return;
        iTyp += PT.engine.loadCurrent(tn, modeId, "typ");
        iMax += PT.engine.loadCurrent(tn, modeId, "max");
      });
      if (n.type === "load" || n.type === "domain") {
        iTyp += PT.engine.loadCurrent(n, modeId, "typ");
        iMax += PT.engine.loadCurrent(n, modeId, "max");
      }
      var issues = PT.rules.issuesForNode(PT.store.issues, n.id);
      var row = [
        n.id,
        _csvEscape(n.name),
        n.type,
        vout != null ? PT.util.fmt(vout) : "",
        PT.util.fmt(iTyp),
        PT.util.fmt(iMax),
        n.imax != null ? n.imax : "",
        (n.__calc && n.__calc.utilization != null) ? PT.util.pct(n.__calc.utilization) : "",
        (n.__calc && n.__calc.end_voltage != null) ? PT.util.fmt(((PT.engine.nodeVout(n, modeId) || 0) - n.__calc.end_voltage) * 1000) : "",
        (n.__calc && n.__calc.loss_mw != null) ? PT.util.fmt(n.__calc.loss_mw) : "",
        issues.length
      ];
      lines.push(row.join(","));
    });

    PT.util.download("power_budget_" + modeId + ".csv", BOM + lines.join("\r\n"), "text/csv;charset=utf-8");
  }

  /** 问题清单 CSV */
  function exportIssuesCsv() {
    var issues = PT.store.issues || [];
    var header = ["级别", "规则", "节点", "问题描述", "修复建议"];
    var lines = [header.join(",")];
    issues.forEach(function (iss) {
      lines.push([
        iss.level,
        _csvEscape(iss.ruleId),
        _csvEscape(iss.nodeId || ""),
        _csvEscape(iss.message_zh),
        _csvEscape(iss.fix_zh)
      ].join(","));
    });
    PT.util.download("power_issues.csv", BOM + lines.join("\r\n"), "text/csv;charset=utf-8");
  }

  /** 问题清单 Markdown */
  function exportIssuesMd() {
    var issues = PT.store.issues || [];
    var meta = (PT.store.rawData && PT.store.rawData.meta) || {};
    var counts = PT.rules.countByLevel(issues);
    var lines = [];
    lines.push("# 电源树校核报告");
    lines.push("");
    lines.push("- 项目: " + (meta.project || "—"));
    lines.push("- 版本: " + (meta.version || "—"));
    lines.push("- 日期: " + (meta.date || "—"));
    lines.push("- 模式: " + PT.store.get("mode"));
    lines.push("");
    lines.push("## 概览");
    lines.push("");
    lines.push("| 级别 | 数量 |");
    lines.push("|---|---|");
    lines.push("| E (错误) | " + counts.E + " |");
    lines.push("| W (警告) | " + counts.W + " |");
    lines.push("| I (提示) | " + counts.I + " |");
    lines.push("");
    lines.push("## 明细");
    lines.push("");
    lines.push("| 级别 | 规则 | 节点 | 描述 | 建议 |");
    lines.push("|---|---|---|---|---|");
    issues.forEach(function (iss) {
      lines.push("| " + iss.level + " | " + iss.ruleId + " | " + (iss.nodeId || "—") + " | " +
        (iss.message_zh || "").replace(/\|/g, "\\|") + " | " +
        (iss.fix_zh || "").replace(/\|/g, "\\|") + " |");
    });
    lines.push("");
    lines.push("---");
    lines.push("*" + PT.i18n.t("footer_legal") + "*");
    PT.util.download("power_issues.md", lines.join("\n"), "text/markdown;charset=utf-8");
  }

  PT.exportCsv = {
    budget: exportBudgetCsv,
    issues: exportIssuesCsv,
    issuesMd: exportIssuesMd
  };
})();
