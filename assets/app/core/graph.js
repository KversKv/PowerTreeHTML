/* ============================================================
 * graph.js — 图数据结构与遍历工具
 * 支持: 多父节点 / 并联 / 跨接 / 级联链 / 环路检测
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;

  /**
   * Graph 对象
   * @param {object} data 经过 schema 校验的 power_tree 数据
   */
  function Graph(data) {
    this.data = data;
    this.nodes = {};          // id -> node (附加 __in/__out/__calc)
    this.edges = [];          // 全部边 (附加 __fromNode/__toNode)
    this.groups = {};         // id -> group
    this.modes = data.modes || [];
    this._buildInternal();
  }

  Graph.prototype._buildInternal = function () {
    var self = this;

    // 分组
    (this.data.groups || []).forEach(function (g) {
      self.groups[g.id] = g;
    });

    // 节点
    (this.data.nodes || []).forEach(function (n) {
      n.__in = [];    // 入边
      n.__out = [];   // 出边
      n.__calc = {};  // 计算结果命名空间 (与原始数据严格分离)
      self.nodes[n.id] = n;
    });

    // 边
    this.edges = (this.data.edges || []).map(function (e) {
      var edge = PT.util.deepClone(e);
      edge.__fromNode = self.nodes[e.from] || null;
      edge.__toNode = self.nodes[e.to] || null;
      if (edge.__fromNode) edge.__fromNode.__out.push(edge);
      if (edge.__toNode) edge.__toNode.__in.push(edge);
      return edge;
    });
  };

  /** 取节点 */
  Graph.prototype.node = function (id) { return this.nodes[id] || null; };

  /** 全部节点数组 */
  Graph.prototype.nodeList = function () {
    var arr = [];
    for (var k in this.nodes) arr.push(this.nodes[k]);
    return arr;
  };

  /** 电源入边 (type=power 且 from 指向本节点) */
  Graph.prototype.powerInEdges = function (id) {
    var n = this.node(id);
    if (!n) return [];
    return n.__in.filter(function (e) { return e.type === "power"; });
  };

  /** 电源出边 */
  Graph.prototype.powerOutEdges = function (id) {
    var n = this.node(id);
    if (!n) return [];
    return n.__out.filter(function (e) { return e.type === "power"; });
  };

  /** 控制入边 */
  Graph.prototype.controlInEdges = function (id, sub) {
    var n = this.node(id);
    if (!n) return [];
    return n.__in.filter(function (e) {
      return e.type === "control" && (!sub || e.sub === sub);
    });
  };

  /** 控制出边 */
  Graph.prototype.controlOutEdges = function (id, sub) {
    var n = this.node(id);
    if (!n) return [];
    return n.__out.filter(function (e) {
      return e.type === "control" && (!sub || e.sub === sub);
    });
  };

  /** 上游电源节点 id 列表 (通过 power 边) */
  Graph.prototype.upstreamPowerIds = function (id) {
    return this.powerInEdges(id).map(function (e) { return e.from; });
  };

  /** 下游电源节点 id 列表 */
  Graph.prototype.downstreamPowerIds = function (id) {
    return this.powerOutEdges(id).map(function (e) { return e.to; });
  };

  /**
   * 溯源: 从某节点沿 power 边向上找 source 节点
   * 允许多父 (ORing / 多路输入), 返回全部可达 source id
   */
  Graph.prototype.traceToSources = function (id) {
    var visited = {};
    var sources = [];
    var stack = [id];
    var self = this;
    while (stack.length) {
      var cur = stack.pop();
      if (visited[cur]) continue;
      visited[cur] = true;
      var n = self.node(cur);
      if (!n) continue;
      if (n.type === "source") {
        sources.push(cur);
        continue;
      }
      var ups = self.upstreamPowerIds(cur);
      if (ups.length === 0 && n.type !== "source") {
        // 追不到 source 的中间节点 —— 由规则模块判定 "无源可溯"
        continue;
      }
      ups.forEach(function (u) { stack.push(u); });
    }
    return sources;
  };

  /**
   * 环路检测 (DFS 三色标记)
   * @returns {Array} 环路数组, 每个环路是节点 id 数组; 空数组 = 无环
   */
  Graph.prototype.detectCycles = function () {
    var WHITE = 0, GRAY = 1, BLACK = 2;
    var color = {};
    var stack = [];
    var cycles = [];
    var self = this;

    function dfs(u) {
      color[u] = GRAY;
      stack.push(u);
      var outs = self.downstreamPowerIds(u);
      for (var i = 0; i < outs.length; i++) {
        var v = outs[i];
        if (color[v] === GRAY) {
          // 找到回边, 提取环
          var idx = stack.indexOf(v);
          if (idx >= 0) cycles.push(stack.slice(idx).concat([v]));
        } else if (color[v] === WHITE || color[v] === undefined) {
          dfs(v);
        }
      }
      stack.pop();
      color[u] = BLACK;
    }

    this.nodeList().forEach(function (n) {
      if (!color[n.id]) dfs(n.id);
    });
    return cycles;
  };

  /**
   * 子树: 从某节点向下的全部 power 后代 (含自身)
   */
  Graph.prototype.powerSubtree = function (id, maxDepth) {
    var visited = {};
    var result = [];
    var self = this;
    function walk(cur, depth) {
      if (visited[cur]) return;
      visited[cur] = true;
      result.push(cur);
      if (maxDepth != null && depth >= maxDepth) return;
      self.downstreamPowerIds(cur).forEach(function (d) { walk(d, depth + 1); });
    }
    walk(id, 0);
    return result;
  };

  /**
   * 反向子树: 从某节点向上的全部 power 祖先 (含自身)
   */
  Graph.prototype.powerAncestors = function (id, maxDepth) {
    var visited = {};
    var result = [];
    var self = this;
    function walk(cur, depth) {
      if (visited[cur]) return;
      visited[cur] = true;
      result.push(cur);
      if (maxDepth != null && depth >= maxDepth) return;
      self.upstreamPowerIds(cur).forEach(function (u) { walk(u, depth + 1); });
    }
    walk(id, 0);
    return result;
  };

  /**
   * N 跳邻域 (上下游都算), 用于聚焦模式
   */
  Graph.prototype.neighborhood = function (id, hops) {
    var visited = {};
    var frontier = [id];
    visited[id] = true;
    for (var h = 0; h < hops; h++) {
      var next = [];
      for (var i = 0; i < frontier.length; i++) {
        var cur = frontier[i];
        var adj = this.upstreamPowerIds(cur).concat(this.downstreamPowerIds(cur));
        // 控制边邻接也算
        this.controlInEdges(cur).forEach(function (e) { adj.push(e.from); });
        this.controlOutEdges(cur).forEach(function (e) { adj.push(e.to); });
        for (var j = 0; j < adj.length; j++) {
          if (!visited[adj[j]]) {
            visited[adj[j]] = true;
            next.push(adj[j]);
          }
        }
      }
      frontier = next;
    }
    return Object.keys(visited);
  };

  /** 并联组成员 */
  Graph.prototype.parallelMembers = function (groupId) {
    if (!groupId) return [];
    return this.nodeList().filter(function (n) { return n.parallel_group === groupId; });
  };

  /** 级联链成员 (按 stage 升序) */
  Graph.prototype.cascadeChain = function (chainId) {
    if (!chainId) return [];
    return this.nodeList()
      .filter(function (n) { return n.cascade && n.cascade.chain_id === chainId; })
      .sort(function (a, b) { return (a.cascade.stage || 0) - (b.cascade.stage || 0); });
  };

  /** 某节点所在分组的全部祖先分组 (含自身) */
  Graph.prototype.groupChain = function (groupId) {
    var chain = [];
    var cur = groupId;
    var guard = 0;
    while (cur && this.groups[cur] && guard < 32) {
      chain.unshift(cur);
      cur = this.groups[cur].parent;
      guard++;
    }
    return chain;
  };

  /** 某分组直接包含的节点 */
  Graph.prototype.nodesInGroup = function (groupId) {
    return this.nodeList().filter(function (n) { return n.group === groupId; });
  };

  PT.Graph = Graph;
})();
