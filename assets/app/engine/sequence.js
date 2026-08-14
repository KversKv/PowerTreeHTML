/* ============================================================
 * sequence.js — 上电/下电时序分析
 * 依据 enable.order / delay_ms / ramp_ms / pg 生成时序事件
 * 检查: 顺序倒置 / 依赖未满足 / order 重复 / 下电顺序未定义
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;

  /**
   * 提取全部带 enable.order 的节点, 生成上电序列
   * @param {PT.Graph} graph
   * @param {string} modeId
   * @returns {Array} [{ nodeId, order, delay_ms, ramp_ms, start_ms, end_ms, pg, src, signal }]
   */
  function buildPowerUpSequence(graph, modeId) {
    var items = [];
    graph.nodeList().forEach(function (n) {
      if (!n.enable || n.enable.order == null) return;
      // 该模式下不上电的节点跳过
      if (Array.isArray(n.on_in_modes) && n.on_in_modes.length &&
          n.on_in_modes.indexOf(modeId) < 0) return;
      items.push({
        nodeId: n.id,
        name: n.name || n.id,
        order: n.enable.order,
        delay_ms: n.enable.delay_ms || 0,
        ramp_ms: n.enable.ramp_ms || 0,
        pg: !!n.enable.pg,
        src: n.enable.src || "",
        signal: n.enable.signal || ""
      });
    });
    items.sort(function (a, b) { return a.order - b.order; });

    // 推演时间轴: 每个 rail start = max(前序 end, 上游 pg end) + delay
    var t = 0;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      it.start_ms = t + it.delay_ms;
      it.end_ms = it.start_ms + Math.max(it.ramp_ms, 0.1);
      t = it.end_ms;
    }
    return items;
  }

  /**
   * 下电序列: 默认上电的逆序; 若节点显式提供 enable.off_order 则使用
   */
  function buildPowerDownSequence(graph, modeId) {
    var up = buildPowerUpSequence(graph, modeId);
    var down = up.slice().reverse().map(function (it) {
      var n = graph.node(it.nodeId);
      var offOrder = (n && n.enable && n.enable.off_order != null) ? n.enable.off_order : null;
      return {
        nodeId: it.nodeId,
        name: it.name,
        order: offOrder != null ? offOrder : it.order,
        offOrderDefined: offOrder != null,
        delay_ms: it.delay_ms,
        ramp_ms: it.ramp_ms,
        pg: it.pg,
        src: it.src,
        signal: it.signal
      };
    });
    // 重新推演
    var t = 0;
    for (var i = 0; i < down.length; i++) {
      var it = down[i];
      it.start_ms = t + it.delay_ms;
      it.end_ms = it.start_ms + Math.max(it.ramp_ms, 0.1);
      t = it.end_ms;
    }
    return down;
  }

  /**
   * 时序违例检查
   *  - 下游 rail order 早于其上游
   *  - EN 源在该模式下未上电
   *  - order 重复冲突
   *  - 下电顺序未定义
   * @returns {Array} issues [{ nodeId, kind, message }]
   */
  function checkSequence(graph, modeId) {
    var issues = [];
    var seq = buildPowerUpSequence(graph, modeId);
    var orderMap = {};      // order -> [nodeId]
    var nodeOrder = {};     // nodeId -> order

    seq.forEach(function (it) {
      (orderMap[it.order] = orderMap[it.order] || []).push(it.nodeId);
      nodeOrder[it.nodeId] = it.order;
    });

    // order 重复
    Object.keys(orderMap).forEach(function (ord) {
      if (orderMap[ord].length > 1) {
        issues.push({
          nodeId: orderMap[ord][0],
          kind: "order_duplicate",
          message: "order=" + ord + " 被多个 rail 使用: " + orderMap[ord].join(", ")
        });
      }
    });

    // 下游早于上游
    graph.nodeList().forEach(function (n) {
      if (n.enable && n.enable.order != null) {
        var ups = graph.upstreamPowerIds(n.id);
        ups.forEach(function (upId) {
          var upNode = graph.node(upId);
          if (upNode && upNode.enable && upNode.enable.order != null) {
            if (n.enable.order <= upNode.enable.order) {
              issues.push({
                nodeId: n.id,
                kind: "order_before_upstream",
                message: n.id + " (order=" + n.enable.order + ") 不应早于上游 " + upId + " (order=" + upNode.enable.order + ")"
              });
            }
          }
        });
      }
    });

    // EN 源在该模式下未上电
    graph.nodeList().forEach(function (n) {
      if (!n.enable || !n.enable.src) return;
      var srcNode = graph.node(n.enable.src);
      if (!srcNode) return; // 外部信号源
      if (Array.isArray(srcNode.on_in_modes) && srcNode.on_in_modes.length &&
          srcNode.on_in_modes.indexOf(modeId) < 0) {
        issues.push({
          nodeId: n.id,
          kind: "en_src_off",
          message: n.id + " 的 EN 源 " + n.enable.src + " 在模式 " + modeId + " 下未上电"
        });
      }
    });

    // 下电顺序未定义
    graph.nodeList().forEach(function (n) {
      if (n.enable && n.enable.order != null && n.enable.off_order == null) {
        issues.push({
          nodeId: n.id,
          kind: "off_order_undefined",
          message: n.id + " 未定义下电顺序 (off_order), 默认按上电逆序"
        });
      }
    });

    return issues;
  }

  PT.sequence = {
    buildPowerUpSequence: buildPowerUpSequence,
    buildPowerDownSequence: buildPowerDownSequence,
    checkSequence: checkSequence
  };
})();
