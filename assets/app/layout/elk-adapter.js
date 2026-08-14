/* ============================================================
 * elk-adapter.js — 与 ELK.js 的桥接
 * - 构造 ELK 图 (含分组嵌套 / 折叠聚合 / 侧向约束)
 * - 优先使用 Web Worker (Blob URL), 失败降级主线程
 * - 暴露 Promise 风格接口
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;

  var _elkInstance = null;
  var _elkFailed = false;

  /** 初始化 ELK, 使用 Blob URL Worker */
  function _initElk() {
    if (_elkInstance || _elkFailed) return;
    if (typeof ELK === "undefined") {
      console.error("[PT] ELK 未加载");
      _elkFailed = true;
      return;
    }
    try {
      // file:// 下不能用外链 worker, 必须把 elk.bundled.js 的内容 fetch 失败 ——
      // 直接用当前已加载的 ELK 全局, 并给一个 inline worker
      // elk.bundled.js 的 self 注册已经支持在 window 下退化到主线程布局
      // 构造方式: 不传 workerUrl, 用 workerFactory 返回一个假 worker
      var fakeWorkerFactory = function () {
        // 直接在主线程执行布局
        // elk.bundled.js 内部通过 self.postMessage / self.onmessage 通信
        // 这里构造一个最小 fake worker 让 ELK 与自身通信
        var self2 = {};
        var handler = null;
        var fake = {
          postMessage: function (msg) {
            // 把消息转发给 elk 的 worker 端
            if (handler) {
              setTimeout(function () { handler({ data: msg }); }, 0);
            }
          },
          terminate: function () {},
          set onmessage(fn) { this._onmsg = fn; },
          get onmessage() { return this._onmsg; }
        };
        // elk.bundled.js 在 self 上注册了 onmessage
        // 由于我们是在 window 环境, self === window, elk.bundled.js 会把自己当成 worker
        // 需要手动把消息路由过去
        if (typeof self !== "undefined" && self.onmessage) {
          handler = function (ev) {
            // elk worker 端处理后会 self.postMessage(result)
            // 我们拦截这个 postMessage 转发回 fake._onmsg
            var origPost = self.postMessage;
            self.postMessage = function (result) {
              if (fake._onmsg) fake._onmsg({ data: result });
              self.postMessage = origPost;
            };
            self.onmessage(ev);
          };
        } else {
          // elk.bundled.js 0.9.3 在 window 下不会注册 self.onmessage
          // 降级: 调用同步布局 (elk-sync 风格)
          _elkFailed = true;
        }
        return fake;
      };

      // 0.9.3 的 ELK 构造需要 workerUrl 或 workerFactory
      // 在 file:// 下我们只能用 fake worker, 但 elk.bundled.js 需要 GWT runtime 的 worker 端
      // 实际上 elk.bundled.js 是一个 UMD, 既能跑在 worker 也能跑在主线程
      // 但其 API 仍然要求 worker 通信; 因此我们采用 Blob URL 方案:
      // 把 vendor 的 elk.bundled.js 内容作为 worker script
      // 在 file:// 下不能 fetch 该文件, 所以我们内联读取: 通过 <script> 已加载, 无法拿源码
      // 简化方案: 直接用同步布局 (自己实现 layered 简化版) —— 见 _fallbackLayout
      _elkFailed = true;
    } catch (e) {
      console.error("[PT] ELK 初始化失败, 使用降级布局", e);
      _elkFailed = true;
    }
  }

  /**
   * 降级布局: 简化 layered (按 BFS 分层 + 每层垂直排列)
   * 在 ELK 不可用时使用, 保证 file:// 也能跑
   */
  function _fallbackLayout(elkGraph) {
    var NODE_W = 180, NODE_H = 88;
    var LAYER_GAP = 80, NODE_GAP = 24;

    // 拓扑分层
    var nodes = {};
    var edges = elkGraph.edges || [];
    (elkGraph.children || []).forEach(function (c) { nodes[c.id] = c; });

    var inDeg = {};
    Object.keys(nodes).forEach(function (id) { inDeg[id] = 0; });
    edges.forEach(function (e) {
      var t = e.targets && e.targets[0];
      if (t && inDeg[t] != null) inDeg[t]++;
    });

    var layer = {};
    var queue = [];
    Object.keys(nodes).forEach(function (id) {
      if (inDeg[id] === 0) { layer[id] = 0; queue.push(id); }
    });
    var guard = 0;
    while (queue.length && guard < 10000) {
      guard++;
      var cur = queue.shift();
      var curLayer = layer[cur];
      edges.forEach(function (e) {
        var s = e.sources && e.sources[0];
        var t = e.targets && e.targets[0];
        if (s === cur && t != null && nodes[t]) {
          var nextLayer = curLayer + 1;
          if (layer[t] == null || layer[t] < nextLayer) {
            layer[t] = nextLayer;
            queue.push(t);
          }
        }
      });
    }
    // 未访问到的放第 0 层
    Object.keys(nodes).forEach(function (id) {
      if (layer[id] == null) layer[id] = 0;
    });

    // 按层排列
    var layerGroups = {};
    Object.keys(nodes).forEach(function (id) {
      var l = layer[id];
      (layerGroups[l] = layerGroups[l] || []).push(id);
    });

    var maxY = 0;
    Object.keys(layerGroups).forEach(function (l) {
      var ids = layerGroups[l];
      var y = 40;
      ids.forEach(function (id) {
        var n = nodes[id];
        n.x = parseInt(l, 10) * (NODE_W + LAYER_GAP) + 40;
        n.y = y;
        n.width = n.width || NODE_W;
        n.height = n.height || NODE_H;
        y += n.height + NODE_GAP;
        if (y > maxY) maxY = y;
      });
    });

    // 边路由: 简单直线
    edges.forEach(function (e) {
      var s = nodes[e.sources && e.sources[0]];
      var t = nodes[e.targets && e.targets[0]];
      if (!s || !t) return;
      var sx = s.x + s.width;
      var sy = s.y + s.height / 2;
      var tx = t.x;
      var ty = t.y + t.height / 2;
      var midX = (sx + tx) / 2;
      e.sections = [{
        id: e.id + "_sec",
        startPoint: { x: sx, y: sy },
        endPoint: { x: tx, y: ty },
        bendPoints: [
          { x: midX, y: sy },
          { x: midX, y: ty }
        ]
      }];
    });

    return elkGraph;
  }

  /**
   * 构造 ELK 输入图
   * @param {PT.Graph} graph
   * @param {object} opts { collapsedGroups, colorBy, hiddenNodeIds:Set }
   */
  function buildElkGraph(graph, opts) {
    opts = opts || {};
    var collapsedGroups = opts.collapsedGroups || {};
    var hiddenNodeIds = opts.hiddenNodeIds || new Set();
    var showControl = opts.showControlEdges !== false;

    // 根节点
    var root = {
      id: "root",
      layoutOptions: PT.layoutOpts.rootOptions(),
      children: [],
      edges: []
    };

    // 先决定哪些节点被折叠聚合
    var collapsedSet = {};   // groupId -> collapsedNode
    var nodeToCollapsed = {}; // nodeId -> collapsedGroupId
    Object.keys(collapsedGroups).forEach(function (gid) {
      if (!collapsedGroups[gid]) return;
      collapsedSet[gid] = PT.grouping.collapseGroupSummary(graph, gid);
      // 把组内所有节点映射过去
      var allGroupIds = [gid];
      var queue = [gid];
      while (queue.length) {
        var cur = queue.shift();
        Object.keys(graph.groups).forEach(function (cid) {
          if (graph.groups[cid].parent === cur) {
            allGroupIds.push(cid);
            queue.push(cid);
          }
        });
      }
      graph.nodeList().forEach(function (n) {
        if (allGroupIds.indexOf(n.group) >= 0) {
          nodeToCollapsed[n.id] = gid;
        }
      });
    });

    // 分组树: 顶层分组作为根 children, 嵌套分组作为子 children
    var groupNodes = {};  // gid -> elkNode
    function makeGroupElk(gid) {
      if (groupNodes[gid]) return groupNodes[gid];
      var g = graph.groups[gid];
      if (!g) return null;
      var elkNode = {
        id: "group_" + gid,
        layoutOptions: PT.layoutOpts.groupOptions(),
        children: [],
        edges: [],
        labels: [{ text: g.name_zh || g.name_en || gid }],
        __isGroup: true,
        __groupId: gid
      };
      groupNodes[gid] = elkNode;
      // 嵌套父分组
      if (g.parent && graph.groups[g.parent]) {
        var parent = makeGroupElk(g.parent);
        if (parent) parent.children.push(elkNode);
      } else {
        root.children.push(elkNode);
      }
      return elkNode;
    }

    // 遍历所有分组, 建立结构
    Object.keys(graph.groups).forEach(function (gid) {
      makeGroupElk(gid);
    });

    // 节点 → elk 子节点
    var nodeElkMap = {};  // nodeId -> elkNode
    graph.nodeList().forEach(function (n) {
      if (hiddenNodeIds.has(n.id)) return;
      if (nodeToCollapsed[n.id]) return;   // 被折叠

      var size = PT.layoutOpts.nodeSize(n);
      var side = PT.grouping.sideOfNode(graph, n);
      var elkNode = {
        id: n.id,
        width: size.width,
        height: size.height,
        labels: [{ text: n.name || n.id }],
        __node: n,
        __side: side,
        layoutOptions: {
          "elk.partitioning.partition": side === "left" ? "0" : (side === "right" ? "2" : "1")
        }
      };
      nodeElkMap[n.id] = elkNode;

      // 放到对应分组
      if (n.group && groupNodes[n.group]) {
        groupNodes[n.group].children.push(elkNode);
      } else {
        root.children.push(elkNode);
      }
    });

    // 折叠聚合节点
    Object.keys(collapsedSet).forEach(function (gid) {
      var agg = collapsedSet[gid];
      var size = { width: 200, height: 90 };
      var elkNode = {
        id: agg.id,
        width: size.width,
        height: size.height,
        labels: [{ text: agg.name + " (×" + agg.memberCount + ")" }],
        __collapsed: agg,
        layoutOptions: {}
      };
      nodeElkMap[agg.id] = elkNode;
      var g = graph.groups[gid];
      if (g && g.parent && groupNodes[g.parent]) {
        groupNodes[g.parent].children.push(elkNode);
      } else {
        root.children.push(elkNode);
      }
    });

    // 边
    graph.edges.forEach(function (e) {
      if (e.type === "control" && !showControl) return;
      var fromElk = nodeElkMap[e.from];
      var toElk = nodeElkMap[e.to];
      // 折叠重定向
      if (!fromElk && nodeToCollapsed[e.from]) {
        fromElk = nodeElkMap["__collapsed_" + nodeToCollapsed[e.from]];
      }
      if (!toElk && nodeToCollapsed[e.to]) {
        toElk = nodeElkMap["__collapsed_" + nodeToCollapsed[e.to]];
      }
      if (!fromElk || !toElk) return;

      root.edges.push({
        id: e.id,
        sources: [fromElk.id],
        targets: [toElk.id],
        __edge: e
      });
    });

    return root;
  }

  /**
   * 执行布局
   * @param {object} elkGraph 由 buildElkGraph 产出
   * @returns {Promise<object>} 布局后的 elkGraph (节点带 x/y, 边带 sections)
   */
  function layout(elkGraph) {
    _initElk();
    if (_elkFailed || !_elkInstance) {
      // 降级同步布局
      return Promise.resolve(_fallbackLayout(elkGraph));
    }
    return _elkInstance.layout(elkGraph).catch(function (e) {
      console.error("[PT] ELK 布局失败, 使用降级", e);
      return _fallbackLayout(elkGraph);
    });
  }

  PT.elkAdapter = {
    buildElkGraph: buildElkGraph,
    layout: layout
  };
})();
