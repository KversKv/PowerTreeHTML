/* ============================================================
 * view-dashboard.js — 视图五: 汇总看板
 * 自绘 SVG 图表 (禁止第三方图表库)
 * - 各模式负载电流分布条形图
 * - Top-N 大电流 rail
 * - Top-N 高利用率器件
 * - 问题分布
 * - 按域/PMIC 聚合统计
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;
  var SVG_NS = "http://www.w3.org/2000/svg";

  function DashboardView(container) {
    this.container = container;
    this._build();
  }

  DashboardView.prototype._build = function () {
    this.container.classList.add("pt-dashboard");
    this.grid = document.createElement("div");
    this.grid.className = "pt-dash-grid";
    this.container.appendChild(this.grid);
  };

  function _el(tag, attrs, parent) {
    var e = document.createElementNS(SVG_NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  /** 通用条形图 */
  function barChart(container, title, items, opts) {
    opts = opts || {};
    var card = document.createElement("div");
    card.className = "pt-dash-card";
    var h = document.createElement("div");
    h.className = "pt-dash-title";
    h.textContent = title;
    card.appendChild(h);

    if (!items.length) {
      var empty = document.createElement("div");
      empty.className = "pt-dash-empty";
      empty.textContent = "无数据";
      card.appendChild(empty);
      container.appendChild(card);
      return;
    }

    var w = opts.width || 480;
    var rowH = opts.rowH || 22;
    var labelW = opts.labelW || 160;
    var hgt = items.length * rowH + 20;

    var svg = _el("svg", { width: "100%", height: hgt, viewBox: "0 0 " + w + " " + hgt }, card);

    var maxV = 0;
    items.forEach(function (it) { if (it.value > maxV) maxV = it.value; });
    if (maxV <= 0) maxV = 1;

    items.forEach(function (it, i) {
      var y = i * rowH + 4;
      var barW = (it.value / maxV) * (w - labelW - 60);

      var label = _el("text", {
        x: 4, y: y + rowH / 2 + 4, "font-size": 11, fill: "#37474f"
      }, svg);
      label.textContent = PT.util.ellipsize(it.label, 18);

      var bar = _el("rect", {
        x: labelW, y: y + 3, width: Math.max(1, barW), height: rowH - 6,
        fill: it.color || "#42a5f5", rx: 2
      }, svg);

      var val = _el("text", {
        x: labelW + barW + 6, y: y + rowH / 2 + 4,
        "font-size": 10, fill: "#546e7a"
      }, svg);
      val.textContent = it.display != null ? it.display : PT.util.fmt(it.value);

      if (it.onClick) {
        bar.style.cursor = "pointer";
        bar.addEventListener("click", it.onClick);
        label.style.cursor = "pointer";
        label.addEventListener("click", it.onClick);
      }
    });

    container.appendChild(card);
  }

  DashboardView.prototype.refresh = function () {
    var self = this;
    var graph = PT.store.graph;
    if (!graph) return;
    this.grid.innerHTML = "";

    var modeId = PT.store.get("mode");
    var modes = PT.store.rawData.modes || [];

    /* ---------- 1. 各模式负载电流分布 ---------- */
    var modeItems = [];
    modes.forEach(function (m) {
      var total = 0;
      graph.nodeList().forEach(function (n) {
        if (n.type === "load" || n.type === "domain") {
          total += PT.engine.loadCurrent(n, m.id, PT.store.statKey());
        }
      });
      modeItems.push({
        label: (m.name_zh || m.id),
        value: total,
        display: PT.util.fmt(total) + " mA",
        color: m.id === modeId ? "#1e88e5" : "#90caf9"
      });
    });
    barChart(this.grid, "各模式负载电流分布 (" + PT.store.statKey() + ")", modeItems);

    /* ---------- 2. Top-N 大电流 rail ---------- */
    var topCurrent = [];
    graph.nodeList().forEach(function (n) {
      var i = (n.__calc && n.__calc.i_out_sum_ma) || 0;
      if (i > 0) {
        topCurrent.push({
          label: n.name || n.id,
          value: i,
          display: PT.util.fmt(i) + " mA",
          color: "#66bb6a",
          onClick: function () {
            PT.store.set({ view: "board", selectedNodeId: n.id, focusNodeId: n.id });
          }
        });
      }
    });
    topCurrent.sort(function (a, b) { return b.value - a.value; });
    barChart(this.grid, "Top 10 大电流 rail", topCurrent.slice(0, 10));

    /* ---------- 3. Top-N 高利用率 ---------- */
    var topUtil = [];
    graph.nodeList().forEach(function (n) {
      var u = (n.__calc && n.__calc.utilization);
      if (u != null) {
        var color = u > 1 ? "#e53935" : u > 0.8 ? "#fb8c00" : "#43a047";
        topUtil.push({
          label: n.name || n.id,
          value: u,
          display: PT.util.pct(u),
          color: color,
          onClick: function () {
            PT.store.set({ view: "board", selectedNodeId: n.id, focusNodeId: n.id });
          }
        });
      }
    });
    topUtil.sort(function (a, b) { return b.value - a.value; });
    barChart(this.grid, "Top 10 高利用率器件", topUtil.slice(0, 10));

    /* ---------- 4. 问题分布 ---------- */
    var counts = PT.rules.countByLevel(PT.store.issues);
    var issueItems = [
      { label: "错误 (E)", value: counts.E, display: counts.E, color: "#e53935" },
      { label: "警告 (W)", value: counts.W, display: counts.W, color: "#fb8c00" },
      { label: "提示 (I)", value: counts.I, display: counts.I, color: "#1e88e5" }
    ];
    barChart(this.grid, "问题分布", issueItems);

    /* ---------- 5. 按域聚合 ---------- */
    var byDomain = {};
    graph.nodeList().forEach(function (n) {
      if (n.type !== "load" && n.type !== "domain") return;
      var dom = n.domain || "(未分域)";
      byDomain[dom] = (byDomain[dom] || 0) + PT.engine.loadCurrent(n, modeId, PT.store.statKey());
    });
    var domainItems = Object.keys(byDomain).map(function (d) {
      return {
        label: d,
        value: byDomain[d],
        display: PT.util.fmt(byDomain[d]) + " mA",
        color: "#8e24aa"
      };
    }).sort(function (a, b) { return b.value - a.value; });
    barChart(this.grid, "按电源域电流聚合", domainItems);

    /* ---------- 6. 按 PMIC 聚合 ---------- */
    var byPmic = {};
    graph.nodeList().forEach(function (n) {
      if (!n.group) return;
      var chain = graph.groupChain(n.group);
      var pmicG = null;
      for (var i = chain.length - 1; i >= 0; i--) {
        var g = graph.groups[chain[i]];
        if (g && g.kind === "pmic") { pmicG = g; break; }
      }
      if (!pmicG) return;
      var key = pmicG.name_zh || pmicG.id;
      byPmic[key] = (byPmic[key] || 0) + ((n.__calc && n.__calc.i_in_ma) || 0);
    });
    var pmicItems = Object.keys(byPmic).map(function (k) {
      return { label: k, value: byPmic[k], display: PT.util.fmt(byPmic[k]) + " mA", color: "#00897b" };
    }).sort(function (a, b) { return b.value - a.value; });
    barChart(this.grid, "按 PMIC 电流聚合", pmicItems);

    /* ---------- 7. 效率曲线 (选中节点) ---------- */
    var sel = PT.store.get("selectedNodeId");
    if (sel) {
      var node = graph.node(sel);
      if (node && node.eff_ref) {
        this._renderEffCard(node);
      }
    }
  };

  /** 效率曲线卡 */
  DashboardView.prototype._renderEffCard = function (node) {
    var modeId = PT.store.get("mode");
    var vin = null;
    var ups = PT.store.graph.upstreamPowerIds(node.id);
    if (ups.length) {
      var upNode = PT.store.graph.node(ups[0]);
      if (upNode) vin = PT.engine.nodeVout(upNode, modeId);
    }
    var vout = PT.engine.nodeVout(node, modeId);
    var curve = PT.effTable.curve(node.eff_ref, vin || 3.8, vout || 0.9);
    if (!curve) return;

    var card = document.createElement("div");
    card.className = "pt-dash-card";
    var title = document.createElement("div");
    title.className = "pt-dash-title";
    title.textContent = "效率曲线: " + (node.name || node.id);
    card.appendChild(title);

    var w = 480, h = 200;
    var pad = { l: 40, r: 12, t: 12, b: 30 };
    var svg = _el("svg", { width: "100%", height: h, viewBox: "0 0 " + w + " " + h }, card);

    var iArr = curve.i, eArr = curve.eff;
    if (!iArr.length) return;
    var iMax = iArr[iArr.length - 1];
    var eMax = Math.max.apply(null, eArr);
    var eMin = Math.min.apply(null, eArr);

    // 坐标轴
    _el("line", { x1: pad.l, y1: h - pad.b, x2: w - pad.r, y2: h - pad.b, stroke: "#90a4ae" }, svg);
    _el("line", { x1: pad.l, y1: pad.t, x2: pad.l, y2: h - pad.b, stroke: "#90a4ae" }, svg);

    // 曲线
    var path = "M";
    for (var k = 0; k < iArr.length; k++) {
      var x = pad.l + (iArr[k] / iMax) * (w - pad.l - pad.r);
      var y = h - pad.b - ((eArr[k] - eMin) / Math.max(1e-6, eMax - eMin)) * (h - pad.t - pad.b);
      path += (k === 0 ? "" : " L") + x.toFixed(1) + " " + y.toFixed(1);
    }
    _el("path", { d: path, fill: "none", stroke: "#1e88e5", "stroke-width": 1.5 }, svg);

    // 当前工作点
    var iCur = (node.__calc && node.__calc.i_out_sum_ma) || 0;
    var interp = PT.effTable.interpolate(node.eff_ref, vin || 3.8, vout || 0.9, iCur);
    if (interp && interp.eff != null) {
      var cx = pad.l + (iCur / iMax) * (w - pad.l - pad.r);
      var cy = h - pad.b - ((interp.eff - eMin) / Math.max(1e-6, eMax - eMin)) * (h - pad.t - pad.b);
      _el("circle", { cx: cx, cy: cy, r: 5, fill: "#e53935", stroke: "#fff", "stroke-width": 1.5 }, svg);
      var t = _el("text", { x: cx + 8, y: cy - 6, "font-size": 10, fill: "#c62828" }, svg);
      t.textContent = PT.util.fmt(iCur) + "mA → " + PT.util.pct(interp.eff);
    }

    // 轴标签
    var xl = _el("text", { x: w / 2, y: h - 6, "font-size": 10, fill: "#607d8b", "text-anchor": "middle" }, svg);
    xl.textContent = "Iout (mA)";
    var yl = _el("text", {
      x: 12, y: h / 2, "font-size": 10, fill: "#607d8b",
      "text-anchor": "middle",
      transform: "rotate(-90 12 " + (h / 2) + ")"
    }, svg);
    yl.textContent = "效率";

    this.grid.appendChild(card);
  };

  DashboardView.prototype.onShow = function () { this.refresh(); };
  DashboardView.prototype.onHide = function () {};

  PT.DashboardView = DashboardView;
})();
