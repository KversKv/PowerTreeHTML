/* ============================================================
 * view-soc.js — 视图二: SoC 内部电源域视图
 * 展示域层级 / AON / retention / ISO/RESET / 供电来源 rail
 * 与板级视图双向跳转
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;

  function SocView(container) {
    this.container = container;
    this.renderer = null;
    this.layoutData = null;
    this._build();
  }

  SocView.prototype._build = function () {
    var self = this;

    // 顶部说明条
    var header = document.createElement("div");
    header.className = "pt-soc-header";
    header.innerHTML = "<span class='pt-soc-title'>SoC 内部电源域视图</span>" +
      "<span class='pt-soc-hint'>点击域节点回跳板级供电链路</span>";
    this.container.appendChild(header);

    var canvasWrap = document.createElement("div");
    canvasWrap.className = "pt-canvas-wrap pt-soc-canvas";
    this.container.appendChild(canvasWrap);
    this.canvasWrap = canvasWrap;

    this.renderer = new PT.SvgRenderer(canvasWrap, {
      onNodeClick: function (id) {
        PT.store.set({ selectedNodeId: id });
        self.renderer.selectedNodeIds.clear();
        self.renderer.selectedNodeIds.add(id);
        self.renderer._refreshSelection();
        self.renderer.highlightPath(id);
      },
      onNodeDblClick: function (id) {
        // 双击回跳板级视图
        PT.store.set({ view: "board", selectedNodeId: id, focusNodeId: id });
      },
      onBackgroundClick: function () {
        PT.store.set({ selectedNodeId: null });
        self.renderer.selectedNodeIds.clear();
        self.renderer._refreshSelection();
        self.renderer.highlightPath(null);
        self.refresh();
      }
    });
  };

  SocView.prototype.refresh = function () {
    var self = this;
    var graph = PT.store.graph;
    if (!graph) return;

    // 只保留 chip / domain / load(domain) 相关节点 + 它们的供电 rail
    var keepIds = new Set();
    graph.nodeList().forEach(function (n) {
      var chain = n.group ? graph.groupChain(n.group) : [];
      var inChip = chain.some(function (gid) {
        var g = graph.groups[gid];
        return g && (g.kind === "chip" || g.kind === "domain");
      });
      if (inChip || n.type === "domain" || n.domain) {
        keepIds.add(n.id);
        // 把它的上游供电 rail 也保留
        graph.powerAncestors(n.id).forEach(function (id) { keepIds.add(id); });
      }
    });

    var hidden = new Set();
    graph.nodeList().forEach(function (n) {
      if (!keepIds.has(n.id)) hidden.add(n.id);
    });

    var elkGraph = PT.elkAdapter.buildElkGraph(graph, {
      collapsedGroups: PT.store.get("collapsedGroups") || {},
      hiddenNodeIds: hidden,
      showControlEdges: true   // SoC 视图保留 ISO/RESET 控制边
    });

    return PT.elkAdapter.layout(elkGraph).then(function (laid) {
      self.layoutData = laid;
      var ctx = {
        modeId: PT.store.get("mode"),
        colorBy: "domain",
        showSwimlane: false,
        issuesFor: function (nodeId) {
          return PT.rules.issuesForNode(PT.store.issues, nodeId);
        }
      };
      self.renderer.render(graph, laid, ctx);

      // 在域节点上追加 AON/retention/ISO/RESET 标记
      self._annotateDomains(laid);
    });
  };

  SocView.prototype._annotateDomains = function (laid) {
    var graph = PT.store.graph;
    if (!graph) return;
    var self = this;
    var nodes = this.renderer.nodeLayer.querySelectorAll(".pt-node");
    nodes.forEach(function (el) {
      var id = el.getAttribute("data-node-id");
      var node = graph.node(id);
      if (!node) return;
      if (node.type !== "domain" && !node.domain) return;

      var badges = [];
      if (node.always_on) badges.push({ text: "AON", color: "#00897b" });
      if (node.retention) badges.push({ text: "RET", color: "#8e24aa" });
      if (node.iso_signal) badges.push({ text: "ISO", color: "#f57f17" });
      if (node.reset_signal) badges.push({ text: "RST", color: "#c62828" });

      var w = parseFloat(el.querySelector("rect").getAttribute("width")) || 180;
      var x = w - 6;
      badges.forEach(function (b, i) {
        var g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("transform", "translate(" + (x - i * 32) + ", 26)");
        var rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", -14); rect.setAttribute("y", -8);
        rect.setAttribute("width", 28); rect.setAttribute("height", 12);
        rect.setAttribute("rx", 2);
        rect.setAttribute("fill", b.color);
        rect.setAttribute("opacity", 0.85);
        g.appendChild(rect);
        var t = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t.setAttribute("x", 0); t.setAttribute("y", 2);
        t.setAttribute("font-size", 8);
        t.setAttribute("fill", "#fff");
        t.setAttribute("text-anchor", "middle");
        t.setAttribute("font-weight", "700");
        t.textContent = b.text;
        g.appendChild(t);
        el.appendChild(g);
      });
    });
  };

  SocView.prototype.fit = function () { if (this.renderer) this.renderer.fit(); };
  SocView.prototype.onShow = function () { this.refresh(); };
  SocView.prototype.onHide = function () {};

  PT.SocView = SocView;
})();
