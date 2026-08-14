/* ============================================================
 * edge-router.js — 边绘制工具
 * 实线 power / 虚线 control / inline 无源标记 / 捆扎 / 电流宽度
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;
  var SVG_NS = "http://www.w3.org/2000/svg";

  function _el(tag, attrs, parent) {
    var e = document.createElementNS(SVG_NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  /** 控制边子类颜色 */
  var SUB_COLORS = {
    EN:    "#f57f17",
    PG:    "#43a047",
    I2C:   "#1e88e5",
    RESET: "#c62828",
    ISO:   "#8e24aa",
    SENSE: "#00897b",
    IRQ:   "#d81b60"
  };

  /** 电流 → 线宽 */
  function widthForCurrent(iMa) {
    if (iMa == null || iMa <= 0) return 1.2;
    if (iMa < 10)   return 1.4;
    if (iMa < 100)  return 1.8;
    if (iMa < 500)  return 2.4;
    if (iMa < 1000) return 3.0;
    if (iMa < 3000) return 3.6;
    return 4.4;
  }

  /**
   * 把 ELK 的 sections 转成 SVG path
   */
  function sectionsToPath(sections) {
    if (!sections || !sections.length) return "";
    var d = "";
    sections.forEach(function (sec) {
      var pts = [];
      if (sec.startPoint) pts.push(sec.startPoint);
      if (Array.isArray(sec.bendPoints)) pts = pts.concat(sec.bendPoints);
      if (sec.endPoint) pts.push(sec.endPoint);
      if (!pts.length) return;
      d += "M " + pts[0].x + " " + pts[0].y;
      for (var i = 1; i < pts.length; i++) {
        d += " L " + pts[i].x + " " + pts[i].y;
      }
    });
    return d;
  }

  /**
   * 绘制一条边
   * @param {SVGGElement} g
   * @param {object} edge 原始终边 (含 __calc)
   * @param {Array} sections ELK 布局段
   * @param {object} ctx { showLabel, currentMa, faded }
   */
  function renderEdge(g, edge, sections, ctx) {
    ctx = ctx || {};
    var d = sectionsToPath(sections);
    if (!d) return null;

    var isControl = edge.type === "control";
    var subColor = isControl ? (SUB_COLORS[edge.sub] || "#607d8b") : "#546e7a";
    var currentMa = ctx.currentMa != null ? ctx.currentMa : ((edge.__calc && edge.__calc.i_ma) || 0);
    var strokeW = isControl ? 1.2 : widthForCurrent(currentMa);

    var attrs = {
      d: d,
      fill: "none",
      stroke: subColor,
      "stroke-width": strokeW,
      "class": "pt-edge pt-edge-" + (isControl ? "control" : "power"),
      "data-edge-id": edge.id
    };
    if (isControl) {
      attrs["stroke-dasharray"] = "5,4";
    }
    if (ctx.faded) {
      attrs.opacity = 0.15;
    }
    if (ctx.highlight) {
      attrs.stroke = "#ff5722";
      attrs["stroke-width"] = strokeW + 1;
    }
    var path = _el("path", attrs, g);

    // inline 无源元件标记
    if (!isControl && Array.isArray(edge.inline) && edge.inline.length && sections && sections.length) {
      var sec = sections[0];
      var pts = [];
      if (sec.startPoint) pts.push(sec.startPoint);
      if (Array.isArray(sec.bendPoints)) pts = pts.concat(sec.bendPoints);
      if (sec.endPoint) pts.push(sec.endPoint);
      if (pts.length >= 2) {
        var mid = pts[Math.floor(pts.length / 2)];
        var marker = _el("g", {
          transform: "translate(" + mid.x + "," + mid.y + ")",
          "class": "pt-inline-marker",
          "data-edge-id": edge.id
        }, g);
        _el("circle", {
          cx: 0, cy: 0, r: 6,
          fill: "#fff", stroke: "#78909c", "stroke-width": 1
        }, marker);
        var t = _el("text", {
          x: 0, y: 3, "font-size": 8, "text-anchor": "middle",
          fill: "#455a64"
        }, marker);
        t.textContent = edge.inline.length;
      }
    }

    // 标签 (net / 电流)
    if (ctx.showLabel && sections && sections.length) {
      var sec2 = sections[0];
      if (sec2.startPoint && sec2.endPoint) {
        var mx = (sec2.startPoint.x + sec2.endPoint.x) / 2;
        var my = (sec2.startPoint.y + sec2.endPoint.y) / 2;
        var label = _el("text", {
          x: mx, y: my - 4, "font-size": 9, fill: "#616161",
          "text-anchor": "middle", "class": "pt-edge-label"
        }, g);
        var parts = [];
        if (edge.net) parts.push(edge.net);
        if (!isControl && currentMa > 0) parts.push(PT.util.fmt(currentMa) + "mA");
        if (isControl && edge.signal) parts.push(edge.signal);
        label.textContent = parts.join(" · ");
      }
    }

    return path;
  }

  /**
   * 捆扎: 相同 net 的平行边合并
   * 输入: edges 数组
   * 输出: { bundles: [{net, edges, count}], singles: [edge] }
   */
  function bundleByNet(edges) {
    var byNet = {};
    var singles = [];
    edges.forEach(function (e) {
      if (e.type !== "power" || !e.net) {
        singles.push(e);
        return;
      }
      var key = e.from + "→" + e.to + "|" + e.net;
      if (!byNet[key]) byNet[key] = [];
      byNet[key].push(e);
    });
    var bundles = [];
    Object.keys(byNet).forEach(function (k) {
      var arr = byNet[k];
      if (arr.length > 1) {
        bundles.push({ net: arr[0].net, edges: arr, count: arr.length, from: arr[0].from, to: arr[0].to });
      } else {
        singles.push(arr[0]);
      }
    });
    return { bundles: bundles, singles: singles };
  }

  PT.edgeRouter = {
    SUB_COLORS: SUB_COLORS,
    widthForCurrent: widthForCurrent,
    sectionsToPath: sectionsToPath,
    renderEdge: renderEdge,
    bundleByNet: bundleByNet
  };
})();
