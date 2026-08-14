/* ============================================================
 * vdrop.js — 压降计算
 * Vdrop = I × (trace_r_mohm + rds_on_mohm + inline 无源 R + dcr_mohm) / 1000
 * 输出: 每条 power 边的 __calc.vdrop_v, 每个 load 的 __calc.end_voltage
 *       沿 cascade 链给出累计压降
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;

  /**
   * 单条边的等效串联电阻 (mΩ)
   * @param {object} edge 边
   * @param {object} fromNode 上游节点 (可提供 rds_on_mohm / dcr_mohm)
   */
  function edgeSeriesResistance(edge, fromNode) {
    var r = 0;
    if (edge.trace_r_mohm) r += edge.trace_r_mohm;
    if (fromNode) {
      if (fromNode.rds_on_mohm) r += fromNode.rds_on_mohm;
      if (fromNode.dcr_mohm) r += fromNode.dcr_mohm;
      if (fromNode.r_mohm) r += fromNode.r_mohm;
    }
    // inline 无源
    if (Array.isArray(edge.inline)) {
      edge.inline.forEach(function (p) {
        if (!p) return;
        if (p.r_mohm) r += p.r_mohm;
        if (p.dcr_mohm) r += p.dcr_mohm;
        if (p.rds_on_mohm) r += p.rds_on_mohm;
        if (p.esr_mohm) r += p.esr_mohm;
      });
    }
    return r;
  }

  /**
   * 计算某条 power 边在当前电流下的压降
   * @param {object} edge
   * @param {object} fromNode
   * @param {number} currentMa
   * @returns {{ vdrop_v:number, r_mohm:number }}
   */
  function edgeDrop(edge, fromNode, currentMa) {
    var r = edgeSeriesResistance(edge, fromNode);
    var v = (currentMa * r) / 1000;   // mA * mΩ = µV → /1000 → mV → 再 /1000 = V? 
    // 注意单位: mA × mΩ = 1e-3 A × 1e-3 Ω = 1e-6 V = µV
    // 所以 v (V) = currentMa × r / 1e6
    v = (currentMa * r) / 1e6;
    return { vdrop_v: v, r_mohm: r };
  }

  /**
   * 沿级联链累计压降
   * @param {PT.Graph} graph
   * @param {string} nodeId 链上某节点
   * @param {string} modeId
   * @param {string} statKey typ|max
   * @returns {number} 累计压降 (V)
   */
  function cascadeTotalDrop(graph, nodeId, modeId, statKey) {
    var node = graph.node(nodeId);
    if (!node || !node.cascade || !node.cascade.chain_id) return 0;
    var chain = graph.cascadeChain(node.cascade.chain_id);
    var total = 0;
    for (var i = 0; i < chain.length; i++) {
      var n = chain[i];
      if ((n.cascade.stage || 0) > (node.cascade.stage || 0)) break;
      // 找 n 的上游边
      var ups = graph.powerInEdges(n.id);
      if (!ups.length) continue;
      var e = ups[0];
      var fromNode = graph.node(e.from);
      var cur = (n.__calc && n.__calc.i_in_ma) || 0;
      total += edgeDrop(e, fromNode, cur).vdrop_v;
    }
    return total;
  }

  PT.vdrop = {
    edgeSeriesResistance: edgeSeriesResistance,
    edgeDrop: edgeDrop,
    cascadeTotalDrop: cascadeTotalDrop
  };
})();
