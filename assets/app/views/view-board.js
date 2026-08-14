/* ============================================================
 * view-board.js — 视图一: 板级电源树 (主视图)
 * ELK layered + 左 PMIC / 右 Power Domain + 折叠/聚焦/反杂乱
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;

  function BoardView(container) {
    this.container = container;
    this.renderer = null;
    this.layoutData = null;
    this._build();
  }

  BoardView.prototype._build = function () {
    var self = this;
    var canvasWrap = document.createElement("div");
    canvasWrap.className = "pt-canvas-wrap";
    this.container.appendChild(canvasWrap);
    this.canvasWrap = canvasWrap;

    this.renderer = new PT.SvgRenderer(canvasWrap, {
      onNodeClick: function (id, ev) {
        PT.store.set({ selectedNodeId: id });
        if (ev.ctrlKey || ev.metaKey) {
          if (self.renderer.selectedNodeIds.has(id)) self.renderer.selectedNodeIds.delete(id);
          else self.renderer.selectedNodeIds.add(id);
          self.renderer._refreshSelection();
        } else {
          self.renderer.selectedNodeIds.clear();
          self.renderer.selectedNodeIds.add(id);
          self.renderer._refreshSelection();
        }
      },
      onNodeDblClick: function (id) {
        // 双击聚焦
        PT.store.set({ focusNodeId: id });
      },
      onGroupDblClick: function (gid) {
        // 切换折叠
        var collapsed = PT.util.deepClone(PT.store.get("collapsedGroups") || {});
        collapsed[gid] = !collapsed[gid];
        PT.store.set({ collapsedGroups: collapsed });
      },
      onEdgeClick: function (edgeId) {
        // 选中边: 同 net 连线高亮, 其余淡化 (再点/点背景取消)
        self.renderer.selectEdge(edgeId);
      },
      onBackgroundClick: function () {
        PT.store.set({ selectedNodeId: null, focusNodeId: null });
        self.renderer.selectedNodeIds.clear();
        self.renderer._refreshSelection();
        self.renderer.highlightPath(null, true);
        self.refresh();
      }
    });
  };

  /** 计算需要隐藏的节点 (聚焦模式 / 过滤) */
  BoardView.prototype._computeHiddenNodes = function () {
    var graph = PT.store.graph;
    var hidden = new Set();
    if (!graph) return hidden;

    var focusId = PT.store.get("focusNodeId");
    var focusHops = PT.store.get("focusHops") || 2;
    if (focusId) {
      var visible = new Set(graph.neighborhood(focusId, focusHops));
      graph.nodeList().forEach(function (n) {
        if (!visible.has(n.id)) hidden.add(n.id);
      });
    }

    // 过滤器
    var filter = PT.store.get("filter") || {};
    if (filter.text || (filter.types && filter.types.length) ||
        (filter.groups && filter.groups.length) ||
        (filter.tags && filter.tags.length) ||
        filter.vMin != null || filter.vMax != null || filter.issueLevel) {
      graph.nodeList().forEach(function (n) {
        if (hidden.has(n.id)) return;
        var match = true;
        if (filter.text) {
          var t = filter.text.toLowerCase();
          var hay = (n.id + " " + (n.name || "") + " " + (n.part || "") + " " + (n.refdes || "") + " " + (n.domain || "")).toLowerCase();
          if (hay.indexOf(t) < 0) match = false;
        }
        if (match && filter.types && filter.types.length) {
          if (filter.types.indexOf(n.type) < 0) match = false;
        }
        if (match && filter.groups && filter.groups.length) {
          if (filter.groups.indexOf(n.group) < 0) match = false;
        }
        if (match && filter.tags && filter.tags.length) {
          var hasTag = (n.tags || []).some(function (tg) { return filter.tags.indexOf(tg) >= 0; });
          if (!hasTag) match = false;
        }
        if (match && filter.vMin != null) {
          var v = PT.engine.nodeVout(n, PT.store.get("mode"));
          if (v == null || v < filter.vMin) match = false;
        }
        if (match && filter.vMax != null) {
          var v2 = PT.engine.nodeVout(n, PT.store.get("mode"));
          if (v2 == null || v2 > filter.vMax) match = false;
        }
        if (match && filter.issueLevel) {
          var issues = PT.rules.issuesForNode(PT.store.issues, n.id);
          var has = issues.some(function (i) { return i.level === filter.issueLevel; });
          if (!has) match = false;
        }
        // 过滤命中逻辑: 若条件全部不满足, 则隐藏
        // 但若所有条件都为空, 不进入此分支
        if (!match) hidden.add(n.id);
      });
    }

    return hidden;
  };

  /** 布局 + 渲染 */
  BoardView.prototype.refresh = function () {
    var self = this;
    var graph = PT.store.graph;
    if (!graph) return;

    var hiddenNodeIds = this._computeHiddenNodes();
    var collapsedGroups = PT.store.get("collapsedGroups") || {};
    var showControl = PT.store.get("controlEdgeVisible");

    var elkGraph = PT.elkAdapter.buildElkGraph(graph, {
      collapsedGroups: collapsedGroups,
      hiddenNodeIds: hiddenNodeIds,
      showControlEdges: showControl
    });

    return PT.elkAdapter.layout(elkGraph).then(function (laid) {
      self.layoutData = laid;
      var ctx = {
        modeId: PT.store.get("mode"),
        colorBy: PT.store.get("colorBy"),
        showSwimlane: PT.store.get("showSwimlane"),
        showInlinePassive: PT.store.get("showInlinePassive"),
        issuesFor: function (nodeId) {
          return PT.rules.issuesForNode(PT.store.issues, nodeId);
        }
      };
      // 若某节点被选中, 先设置高亮状态再渲染 (避免二次重绘)
      var sel = PT.store.get("selectedNodeId");
      if (sel) {
        self.renderer.highlightPath(sel, true);
      }
      self.renderer.render(graph, laid, ctx);
    });
  };

  BoardView.prototype.fit = function () {
    if (this.renderer) this.renderer.fit();
  };

  BoardView.prototype.onShow = function () {
    this.refresh();
  };

  BoardView.prototype.onHide = function () {};

  PT.BoardView = BoardView;
})();
