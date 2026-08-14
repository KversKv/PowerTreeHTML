/* ============================================================
 * grouping.js — 分组嵌套 / 折叠聚合 / 侧向约束
 * 左 PMIC / 右 Power Domain 利用 groups[].side + ELK partition
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;

  /**
   * 根据 side 把节点划分到左侧 / 中间 / 右侧
   *  - left: 板级 + PMIC
   *  - right: chip + domain
   *  - middle: 其他
   */
  function sideOfNode(graph, node) {
    // 节点自身 side 优先
    if (node.side === "left" || node.side === "right") return node.side;
    // 沿分组链查
    if (node.group) {
      var chain = graph.groupChain(node.group);
      for (var i = chain.length - 1; i >= 0; i--) {
        var g = graph.groups[chain[i]];
        if (!g) continue;
        if (g.side === "left" || g.side === "right") return g.side;
        if (g.kind === "chip" || g.kind === "domain") return "right";
        if (g.kind === "pmic" || g.kind === "board") return "left";
      }
    }
    // 类型推断
    if (node.type === "domain") return "right";
    if (node.type === "load" && node.domain) return "right";
    return "middle";
  }

  /**
   * 折叠分组时, 把组内节点聚合为一个"汇总节点"
   * @param {PT.Graph} graph
   * @param {string} groupId
   * @returns {object} 聚合节点描述
   */
  function collapseGroupSummary(graph, groupId) {
    var members = [];
    var g = graph.groups[groupId];
    // 包含所有子分组的节点
    var allGroupIds = [groupId];
    var queue = [groupId];
    while (queue.length) {
      var cur = queue.shift();
      Object.keys(graph.groups).forEach(function (gid) {
        if (graph.groups[gid].parent === cur) {
          allGroupIds.push(gid);
          queue.push(gid);
        }
      });
    }
    graph.nodeList().forEach(function (n) {
      if (allGroupIds.indexOf(n.group) >= 0) members.push(n);
    });

    var totalIMa = 0;
    var maxUtil = 0;
    var hasIssue = { E: 0, W: 0, I: 0 };
    members.forEach(function (m) {
      totalIMa += (m.__calc && m.__calc.i_in_ma) || 0;
      var u = m.__calc && m.__calc.utilization;
      if (u != null && u > maxUtil) maxUtil = u;
      // 问题统计由外部填入
    });

    // 统计问题
    (PT.store.issues || []).forEach(function (iss) {
      if (members.some(function (m) { return m.id === iss.nodeId; })) {
        if (hasIssue[iss.level] != null) hasIssue[iss.level]++;
      }
    });

    return {
      id: "__collapsed_" + groupId,
      isCollapsedGroup: true,
      groupId: groupId,
      name: (g && (g.name_zh || g.name_en)) || groupId,
      type: "virtual",
      memberCount: members.length,
      totalIMa: totalIMa,
      maxUtil: maxUtil,
      issueCount: hasIssue
    };
  }

  /**
   * 展开所有分组
   */
  function expandAll(store) {
    store.set({ collapsedGroups: {} });
  }

  /** 折叠所有顶层分组 */
  function collapseAll(store) {
    var g = store.graph;
    if (!g) return;
    var collapsed = {};
    Object.keys(g.groups).forEach(function (gid) {
      // 只折叠叶子分组 (组内有节点)
      var hasNodes = g.nodesInGroup(gid).length > 0;
      if (hasNodes) collapsed[gid] = true;
    });
    store.set({ collapsedGroups: collapsed });
  }

  PT.grouping = {
    sideOfNode: sideOfNode,
    collapseGroupSummary: collapseGroupSummary,
    expandAll: expandAll,
    collapseAll: collapseAll
  };
})();
