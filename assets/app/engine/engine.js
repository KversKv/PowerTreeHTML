/* ============================================================
 * engine.js — 计算引擎
 * 一期实现:
 *   1) 单级直连求和: Iout_sum / 利用率
 *   2) Vdrop 与末端电压
 *   3) LDO 热耗 / 温升 / dropout
 * 预留接口: PT.engine.registerCalculator({ id, enabled, run })
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;

  var _calculators = [];
  var _byId = {};

  /**
   * 注册计算器
   * @param {{id:string, enabled:boolean, run:function(graph, modeId, opts)}} c
   */
  function registerCalculator(c) {
    if (!c || !c.id) return;
    if (_byId[c.id]) {
      // 覆盖
      var idx = _calculators.indexOf(_byId[c.id]);
      if (idx >= 0) _calculators.splice(idx, 1);
    }
    _byId[c.id] = c;
    _calculators.push(c);
  }

  /**
   * 取负载在某模式下的电流
   */
  function _loadCurrent(node, modeId, statKey) {
    if (!node.current) return 0;
    var cur = node.current[modeId];
    if (cur == null) return 0;
    if (typeof cur === "number") return cur;
    if (PT.util.isObj(cur)) return cur[statKey] != null ? cur[statKey] : (cur.typ || 0);
    return 0;
  }

  /**
   * 节点在当前模式下的"输出电压" (考虑 DVFS)
   */
  function nodeVout(node, modeId) {
    if (node.dvfs && node.dvfs[modeId] != null) return node.dvfs[modeId];
    if (node.vout != null) return node.vout;
    if (node.voltage != null) return node.voltage;
    return null;
  }

  /**
   * 节点在当前模式下的"输出电压范围" (考虑 DVFS 可能改变 range)
   */
  function nodeVoutRange(node, modeId) {
    if (Array.isArray(node.vout_range) && node.vout_range.length >= 2) return node.vout_range;
    var v = nodeVout(node, modeId);
    if (v != null) {
      var tol = (node.vout_tol_pct || 3) / 100;
      return [v * (1 - tol), v * (1 + tol)];
    }
    return null;
  }

  /**
   * 判断节点在某模式下是否"上电"
   */
  function isOnInMode(node, modeId) {
    if (node.always_on) return true;
    if (node.type === "source") return true;
    if (Array.isArray(node.on_in_modes) && node.on_in_modes.length) {
      return node.on_in_modes.indexOf(modeId) >= 0;
    }
    return true;   // 缺省视为上电
  }

  /* ---------------- 内置计算器: 单级直连求和 ---------------- */
  registerCalculator({
    id: "direct-sum",
    enabled: true,
    run: function (graph, modeId, opts) {
      var statKey = (opts && opts.statKey) || "typ";

      // 第一步: 负载电流写到 __calc.i_load_ma
      graph.nodeList().forEach(function (n) {
        n.__calc = n.__calc || {};
        if (n.type === "load" || n.type === "domain") {
          n.__calc.i_load_ma = _loadCurrent(n, modeId, statKey);
        } else {
          n.__calc.i_load_ma = 0;
        }
      });

      // 第二步: 反向拓扑求和 —— 每个电源节点的 Iout_sum = 直连下游的 (i_load + 下游电源自身的 i_in)
      // 采用 DFS 递归, 带环路保护
      var visiting = {};
      var visited = {};

      function computeIin(nodeId) {
        if (visited[nodeId]) return graph.node(nodeId).__calc.i_in_ma || 0;
        if (visiting[nodeId]) return 0;  // 环路断点
        visiting[nodeId] = true;
        var n = graph.node(nodeId);
        if (!n) { visiting[nodeId] = false; return 0; }

        var ownLoad = n.__calc.i_load_ma || 0;
        // 下游贡献
        var downstreamSum = 0;
        var outs = graph.powerOutEdges(nodeId);
        outs.forEach(function (e) {
          var toNode = graph.node(e.to);
          if (!toNode) return;
          if (!isOnInMode(toNode, modeId)) return;
          downstreamSum += computeIin(e.to);
        });

        var total = ownLoad + downstreamSum;
        n.__calc.i_in_ma = total;
        n.__calc.i_out_sum_ma = downstreamSum + ownLoad;

        // 写入每条出边的电流
        outs.forEach(function (e) {
          var toNode = graph.node(e.to);
          if (!toNode) { e.__calc = { i_ma: 0 }; return; }
          if (!isOnInMode(toNode, modeId)) { e.__calc = { i_ma: 0 }; return; }
          e.__calc = e.__calc || {};
          e.__calc.i_ma = toNode.__calc.i_in_ma || 0;
        });

        visiting[nodeId] = false;
        visited[nodeId] = true;
        return total;
      }

      graph.nodeList().forEach(function (n) { computeIin(n.id); });

      // 第三步: 利用率
      graph.nodeList().forEach(function (n) {
        var imax = n.imax;
        var iUse = n.__calc.i_out_sum_ma || 0;
        if (imax != null && imax > 0) {
          n.__calc.utilization = iUse / imax;
        } else {
          n.__calc.utilization = null;
        }
      });
    }
  });

  /* ---------------- 内置计算器: Vdrop ---------------- */
  registerCalculator({
    id: "vdrop",
    enabled: true,
    run: function (graph, modeId, opts) {
      // 上游电压传播: source 的 vout → 下游节点 vin ≈ 上游 vout - vdrop
      var visited = {};
      function upstreamVoltage(nodeId) {
        if (visited[nodeId] != null) return visited[nodeId];
        var n = graph.node(nodeId);
        if (!n) return null;
        var vout = nodeVout(n, modeId);
        visited[nodeId] = vout;
        return vout;
      }

      graph.edges.forEach(function (e) {
        if (e.type !== "power") return;
        var fromNode = graph.node(e.from);
        var toNode = graph.node(e.to);
        if (!fromNode || !toNode) return;
        var iMa = (e.__calc && e.__calc.i_ma) || 0;
        var dropInfo = PT.vdrop.edgeDrop(e, fromNode, iMa);
        e.__calc = e.__calc || {};
        e.__calc.vdrop_v = dropInfo.vdrop_v;
        e.__calc.r_mohm = dropInfo.r_mohm;

        // 末端电压: 上游 vout - vdrop
        var vinUp = nodeVout(fromNode, modeId);
        if (vinUp != null) {
          var endV = vinUp - dropInfo.vdrop_v;
          toNode.__calc.end_voltage = endV;
          // 相对容差
          var tol = (toNode.vtol_pct || 5) / 100;
          var nominal = nodeVout(toNode, modeId) != null ? nodeVout(toNode, modeId) : vinUp;
          if (nominal > 0) {
            toNode.__calc.end_dev_pct = Math.abs(endV - nominal) / nominal;
            toNode.__calc.end_ok = toNode.__calc.end_dev_pct <= tol;
          }
        }
      });

      // 累计压降 (cascade 链)
      graph.nodeList().forEach(function (n) {
        if (n.cascade && n.cascade.chain_id) {
          n.__calc.cascade_drop_v = PT.vdrop.cascadeTotalDrop(graph, n.id, modeId, (opts && opts.statKey) || "typ");
        }
      });
    }
  });

  /* ---------------- 内置计算器: LDO 热耗 ---------------- */
  registerCalculator({
    id: "ldo-thermal",
    enabled: true,
    run: function (graph, modeId, opts) {
      graph.nodeList().forEach(function (n) {
        if (n.type !== "ldo") return;
        var vin = null;
        var ups = graph.upstreamPowerIds(n.id);
        if (ups.length) {
          var upNode = graph.node(ups[0]);
          if (upNode) vin = nodeVout(upNode, modeId);
        }
        var vout = nodeVout(n, modeId);
        var iout = n.__calc.i_out_sum_ma || 0;
        n.__calc.loss_mw = PT.thermal.ldoLossMw(vin, vout, iout);
        n.__calc.delta_t = PT.thermal.deltaT(n.__calc.loss_mw, n.theta_ja);

        // dropout 判定
        var vinRange = null;
        if (ups.length) {
          var upNode2 = graph.node(ups[0]);
          if (upNode2) vinRange = nodeVoutRange(upNode2, modeId);
        }
        var vinMin = vinRange ? vinRange[0] : vin;
        n.__calc.dropout_ok = PT.thermal.dropoutOk(vinMin, vout, n.dropout_mv);
      });
    }
  });

  /* ---------------- 预留: 跨级功率汇总 (二期) ---------------- */
  registerCalculator({
    id: "cascade-rollup",
    enabled: false,          // 一期关闭
    run: function (graph, modeId, opts) {
      /* 自底向上跨级电流/功率汇总、系统总功耗、续航估算 —— 二期实现 */
    }
  });

  /* ---------------- 主入口 ---------------- */
  function runAll(graph, modeId, opts) {
    _calculators.forEach(function (c) {
      if (!c.enabled) return;
      try {
        c.run(graph, modeId, opts || {});
      } catch (e) {
        console.error("[PT engine]", c.id, e);
      }
    });
    PT.store.calcVersion++;
    PT.emit("engine:done", { modeId: modeId });
  }

  PT.engine = {
    registerCalculator: registerCalculator,
    runAll: runAll,
    nodeVout: nodeVout,
    nodeVoutRange: nodeVoutRange,
    isOnInMode: isOnInMode,
    loadCurrent: _loadCurrent
  };
})();
