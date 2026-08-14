/* ============================================================
 * rules.js — 规则执行器
 * 数据加载后 / 任意编辑后自动增量重跑
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;

  var _extraRules = [];

  /** 注册额外规则 (用户扩展) */
  function registerRule(rule) {
    if (rule && rule.id && typeof rule.check === "function") {
      _extraRules.push(rule);
    }
  }

  /**
   * 执行全部规则
   * @param {PT.Graph} graph
   * @param {string} modeId
   * @param {object} config
   * @returns {Array} issues
   */
  function runAll(graph, modeId, config) {
    var issues = [];
    var rules = (PT.ruleDefs || []).concat(_extraRules);
    rules.forEach(function (rule) {
      try {
        var out = rule.check(graph, modeId, config || {}) || [];
        issues = issues.concat(out);
      } catch (e) {
        console.error("[PT rules]", rule.id, e);
      }
    });
    PT.store.issues = issues;
    PT.emit("rules:done", { issues: issues });
    return issues;
  }

  /** 统计 E/W/I 数量 */
  function countByLevel(issues) {
    var c = { E: 0, W: 0, I: 0 };
    (issues || []).forEach(function (i) {
      if (c[i.level] != null) c[i.level]++;
    });
    return c;
  }

  /** 取某节点相关问题 */
  function issuesForNode(issues, nodeId) {
    return (issues || []).filter(function (i) { return i.nodeId === nodeId; });
  }

  PT.rules = {
    registerRule: registerRule,
    runAll: runAll,
    countByLevel: countByLevel,
    issuesForNode: issuesForNode
  };
})();
