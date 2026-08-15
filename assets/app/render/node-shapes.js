/* ============================================================
 * node-shapes.js — 各类节点的 SVG 渲染
 * 统一 <text> + 手写换行/省略号; 禁用 foreignObject
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;

  var SVG_NS = "http://www.w3.org/2000/svg";

  function _el(tag, attrs, parent) {
    var e = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      for (var k in attrs) {
        if (attrs[k] != null) e.setAttribute(k, attrs[k]);
      }
    }
    if (parent) parent.appendChild(e);
    return e;
  }

  /** 类型颜色映射 */
  var TYPE_COLORS = {
    source:       { bg: "#fff3e0", stroke: "#f57c00", icon: "#e65100" },
    buck:         { bg: "#e8f5e9", stroke: "#43a047", icon: "#1b5e20" },
    boost:        { bg: "#e8f5e9", stroke: "#66bb6a", icon: "#1b5e20" },
    buck_boost:   { bg: "#e8f5e9", stroke: "#26a69a", icon: "#004d40" },
    ldo:          { bg: "#e3f2fd", stroke: "#1e88e5", icon: "#0d47a1" },
    load_switch:  { bg: "#fce4ec", stroke: "#d81b60", icon: "#880e4f" },
    efuse:        { bg: "#fff8e1", stroke: "#ffb300", icon: "#ff6f00" },
    ideal_diode:  { bg: "#f3e5f5", stroke: "#8e24aa", icon: "#4a148c" },
    divider:      { bg: "#e0f2f1", stroke: "#00897b", icon: "#004d40" },
    level_shifter:{ bg: "#e0f7fa", stroke: "#00acc1", icon: "#006064" },
    passive_r:    { bg: "#fafafa", stroke: "#9e9e9e", icon: "#424242" },
    passive_l:    { bg: "#fafafa", stroke: "#8d6e63", icon: "#4e342e" },
    passive_c:    { bg: "#fafafa", stroke: "#78909c", icon: "#263238" },
    load:         { bg: "#ede7f6", stroke: "#5e35b1", icon: "#311b92" },
    domain:       { bg: "#e8eaf6", stroke: "#3949ab", icon: "#1a237e" },
    virtual:      { bg: "#f5f5f5", stroke: "#757575", icon: "#212121" },
    seq_ctrl:     { bg: "#fffde7", stroke: "#f9a825", icon: "#f57f17" }
  };

  /** 类型图标 (内联 SVG path) */
  var TYPE_ICONS = {
    source:       "M12 2 L4 14 h6 l-2 8 L18 10 h-6 z",
    buck:         "M3 12 h4 l2 -4 l2 8 l2 -4 h4",
    boost:        "M3 16 h4 l2 -8 l2 8 l2 -4 h4",
    buck_boost:   "M3 12 h4 l2 -6 l2 12 l2 -6 h4",
    ldo:          "M4 6 h16 M4 12 h16 M4 18 h16",
    load_switch:  "M4 18 L18 6 M4 6 h4 M16 18 h4",
    efuse:        "M6 12 h12 M12 6 v12",
    ideal_diode:  "M4 12 h6 L14 6 v12 L10 12 M14 6 v12",
    divider:      "M12 4 v16 M6 12 h12",
    level_shifter:"M4 8 h6 M4 16 h6 M14 12 h6",
    passive_r:    "M2 12 h3 l2 -4 l2 8 l2 -8 l2 8 l2 -8 l2 4 h3",
    passive_l:    "M4 12 a2 2 0 0 1 4 0 a2 2 0 0 1 4 0 a2 2 0 0 1 4 0 a2 2 0 0 1 4 0",
    passive_c:    "M8 6 v12 M16 6 v12 M2 12 h6 M16 12 h6",
    load:         "M6 6 h12 v12 h-12 z M9 12 h6",
    domain:       "M4 4 h16 v16 h-16 z M8 8 h8 M8 12 h8 M8 16 h5",
    virtual:      "M4 12 h16",
    seq_ctrl:     "M4 6 h16 M4 12 h10 M4 18 h14"
  };

  /**
   * 标准电路符号渲染器
   * 电池 / 电阻 / 电感 / 电容 / 开关 / 保险丝 / 二极管 / 分压器
   * 参数: (g, cx, cy, color, edgeL, edgeR)
   *   cx,cy = 符号中心;  edgeL/edgeR = 节点左右边缘 x 坐标 (引线必须延伸到这两条边)
   *   符号主体在 cx 附近 ±26 内, 引线从 ±26 拉到 edgeL/edgeR
   */
  var SYMBOL_RENDERERS = {
    /* 电池: 长短线交替 + "+" */
    source: function (g, cx, cy, color, edgeL, edgeR) {
      // 左引线 (从节点左边缘拉到符号)
      _el("line", { x1: edgeL, y1: cy, x2: cx - 10, y2: cy, stroke: color, "stroke-width": 2 }, g);
      // 长-短-长-短
      _el("line", { x1: cx - 10, y1: cy - 11, x2: cx - 10, y2: cy + 11, stroke: color, "stroke-width": 3.2 }, g);
      _el("line", { x1: cx - 4,  y1: cy - 5,  x2: cx - 4,  y2: cy + 5,  stroke: color, "stroke-width": 1.6 }, g);
      _el("line", { x1: cx + 2,  y1: cy - 11, x2: cx + 2,  y2: cy + 11, stroke: color, "stroke-width": 3.2 }, g);
      _el("line", { x1: cx + 8,  y1: cy - 5,  x2: cx + 8,  y2: cy + 5,  stroke: color, "stroke-width": 1.6 }, g);
      // 右引线 (拉到右边缘)
      _el("line", { x1: cx + 8, y1: cy, x2: edgeR, y2: cy, stroke: color, "stroke-width": 2 }, g);
      // + 号
      _el("text", { x: cx - 22, y: cy - 8, "font-size": 10, "font-weight": 700, fill: color }, g).textContent = "+";
    },

    /* 电阻: zigzag */
    passive_r: function (g, cx, cy, color, edgeL, edgeR) {
      var d = "M " + edgeL + " " + cy +
              " L " + (cx - 18) + " " + cy +
              " L " + (cx - 14) + " " + (cy - 8) +
              " L " + (cx - 6)  + " " + (cy + 8) +
              " L " + (cx + 2)  + " " + (cy - 8) +
              " L " + (cx + 10) + " " + (cy + 8) +
              " L " + (cx + 14) + " " + (cy - 8) +
              " L " + (cx + 18) + " " + cy +
              " L " + edgeR + " " + cy;
      _el("path", { d: d, fill: "none", stroke: color, "stroke-width": 1.8, "stroke-linejoin": "round" }, g);
    },

    /* 电感: 4 个半圆 */
    passive_l: function (g, cx, cy, color, edgeL, edgeR) {
      var d = "M " + edgeL + " " + cy + " L " + (cx - 20) + " " + cy;
      for (var i = 0; i < 4; i++) {
        var x0 = cx - 20 + i * 10;
        var x1 = x0 + 10;
        d += " A 5 5 0 0 1 " + x1 + " " + cy;
      }
      d += " L " + edgeR + " " + cy;
      _el("path", { d: d, fill: "none", stroke: color, "stroke-width": 1.8 }, g);
    },

    /* 电容: 两平行板 */
    passive_c: function (g, cx, cy, color, edgeL, edgeR) {
      _el("line", { x1: edgeL, y1: cy, x2: cx - 5, y2: cy, stroke: color, "stroke-width": 1.8 }, g);
      _el("line", { x1: cx - 5, y1: cy - 10, x2: cx - 5, y2: cy + 10, stroke: color, "stroke-width": 2.4 }, g);
      _el("line", { x1: cx + 5, y1: cy - 10, x2: cx + 5, y2: cy + 10, stroke: color, "stroke-width": 2.4 }, g);
      _el("line", { x1: cx + 5, y1: cy, x2: edgeR, y2: cy, stroke: color, "stroke-width": 1.8 }, g);
    },

    /* 开关: 两触点 + 斜杠杆 */
    load_switch: function (g, cx, cy, color, edgeL, edgeR) {
      // 引线
      _el("line", { x1: edgeL, y1: cy, x2: cx - 16, y2: cy, stroke: color, "stroke-width": 1.8 }, g);
      _el("line", { x1: cx + 16, y1: cy, x2: edgeR, y2: cy, stroke: color, "stroke-width": 1.8 }, g);
      // 触点
      _el("circle", { cx: cx - 14, cy: cy, r: 2.6, fill: "#fff", stroke: color, "stroke-width": 1.6 }, g);
      _el("circle", { cx: cx + 14, cy: cy, r: 2.6, fill: "#fff", stroke: color, "stroke-width": 1.6 }, g);
      // 杠杆 (断开状态, 斜向右上)
      _el("line", { x1: cx - 14, y1: cy, x2: cx + 11, y2: cy - 11, stroke: color, "stroke-width": 2 }, g);
      // 杠杆端点小圆
      _el("circle", { cx: cx + 12, cy: cy - 12, r: 1.6, fill: color }, g);
    },

    /* 保险丝: 矩形 + 内部斜线 */
    efuse: function (g, cx, cy, color, edgeL, edgeR) {
      _el("line", { x1: edgeL, y1: cy, x2: cx - 12, y2: cy, stroke: color, "stroke-width": 1.8 }, g);
      _el("rect", { x: cx - 12, y: cy - 7, width: 24, height: 14, fill: "none", stroke: color, "stroke-width": 1.8, rx: 2 }, g);
      _el("line", { x1: cx - 9, y1: cy + 5, x2: cx + 9, y2: cy - 5, stroke: color, "stroke-width": 1.4 }, g);
      _el("line", { x1: cx + 12, y1: cy, x2: edgeR, y2: cy, stroke: color, "stroke-width": 1.8 }, g);
    },

    /* 理想二极管: 三角 + 竖线 */
    ideal_diode: function (g, cx, cy, color, edgeL, edgeR) {
      _el("line", { x1: edgeL, y1: cy, x2: cx - 9, y2: cy, stroke: color, "stroke-width": 1.8 }, g);
      _el("path", {
        d: "M " + (cx - 9) + " " + (cy - 9) +
           " L " + (cx - 9) + " " + (cy + 9) +
           " L " + (cx + 9) + " " + cy + " Z",
        fill: color, stroke: color, "stroke-width": 1.4
      }, g);
      _el("line", { x1: cx + 9, y1: cy - 9, x2: cx + 9, y2: cy + 9, stroke: color, "stroke-width": 2.2 }, g);
      _el("line", { x1: cx + 9, y1: cy, x2: edgeR, y2: cy, stroke: color, "stroke-width": 1.8 }, g);
    },

    /* 分压器: 电阻 + 中间向下抽头 */
    divider: function (g, cx, cy, color, edgeL, edgeR) {
      var d = "M " + edgeL + " " + (cy - 4) +
              " L " + (cx - 14) + " " + (cy - 4) +
              " L " + (cx - 11) + " " + (cy - 10) +
              " L " + (cx - 5)  + " " + (cy + 2) +
              " L " + (cx + 1)  + " " + (cy - 10) +
              " L " + (cx + 7)  + " " + (cy + 2) +
              " L " + (cx + 10) + " " + (cy - 4) +
              " L " + edgeR + " " + (cy - 4);
      _el("path", { d: d, fill: "none", stroke: color, "stroke-width": 1.6, "stroke-linejoin": "round" }, g);
      // 中间抽头
      _el("line", { x1: cx - 2, y1: cy + 2, x2: cx - 2, y2: cy + 12, stroke: color, "stroke-width": 1.6 }, g);
      _el("circle", { cx: cx - 2, cy: cy + 12, r: 1.8, fill: color }, g);
    }
  };

  /** 符号型节点的关键参数文本 */
  function _symbolParamText(node) {
    switch (node.type) {
      case "source":
        return (node.vout != null ? PT.util.fmt(node.vout) + "V" : "") +
               (node.imax ? " " + PT.util.fmt(node.imax / 1000) + "A" : "");
      case "passive_r":
        return (node.r_mohm != null ? PT.util.fmt(node.r_mohm) + "mΩ" : "") +
               (node.power_mw ? " " + PT.util.fmt(node.power_mw) + "mW" : "");
      case "passive_l":
        return (node.l_uh != null ? PT.util.fmt(node.l_uh) + "µH" : "") +
               (node.dcr_mohm ? " DCR" + PT.util.fmt(node.dcr_mohm) + "mΩ" : "");
      case "passive_c":
        return (node.c_uf != null ? PT.util.fmt(node.c_uf) + "µF" : "") +
               (node.volt_rating ? " " + PT.util.fmt(node.volt_rating) + "V" : "");
      case "load_switch":
        return node.rds_on_mohm != null ? "Rds " + PT.util.fmt(node.rds_on_mohm) + "mΩ" : "";
      case "efuse":
        return (node.rds_on_mohm != null ? PT.util.fmt(node.rds_on_mohm) + "mΩ" : "") +
               (node.imax ? " " + PT.util.fmt(node.imax / 1000) + "A" : "");
      case "ideal_diode":
        return node.vf_mv != null ? "Vf " + PT.util.fmt(node.vf_mv) + "mV" : "";
      case "divider":
        return node.ratio_str || (node.ratio != null ? String(node.ratio) : "");
    }
    return "";
  }

  /** 符号型节点渲染 (电池/阻容感/开关/保险丝/二极管/分压)
   *  无底框, 仅 名字 + 电路符号 + 参数 三段式 */
  function renderSymbolNode(g, node, ctx, maxLevel) {
    var colors = TYPE_COLORS[node.type] || TYPE_COLORS.virtual;
    var w = node.width, h = node.height;

    // 透明命中区 (保留点击/hover 范围, 不可见)
    _el("rect", {
      x: 0, y: 0, width: w, height: h,
      fill: "transparent", stroke: "none",
      "class": "pt-node-hitarea"
    }, g);

    // 名称 (顶部)
    var title = _el("text", {
      x: w / 2, y: 13, "text-anchor": "middle",
      "font-size": 10, "font-weight": 600, fill: "#212121",
      "class": "pt-node-title"
    }, g);
    title.textContent = PT.util.ellipsize(node.name || node.id, 18);

    // 电路符号 (中部) — 引线拉到节点左右边缘, 中心严格在 h/2 (与连线对齐)
    var renderer = SYMBOL_RENDERERS[node.type];
    if (renderer) {
      renderer(g, w / 2, h / 2, colors.icon, 0, w);
    }

    // 参数 (底部)
    var param = _symbolParamText(node);
    if (param) {
      var p = _el("text", {
        x: w / 2, y: h - 5, "text-anchor": "middle",
        "font-size": 9, fill: "#616161"
      }, g);
      p.textContent = param;
    }

    // 问题角标 (右上角)
    if (maxLevel) {
      var badgeColor = maxLevel === "E" ? "#c62828" : maxLevel === "W" ? "#f57f17" : "#1565c0";
      var badge = _el("g", { transform: "translate(" + (w - 8) + ",8)", "class": "pt-issue-badge" }, g);
      _el("circle", { cx: 0, cy: 0, r: 7, fill: badgeColor }, badge);
      var badgeText = _el("text", {
        x: 0, y: 3, "font-size": 9, "font-weight": 700,
        fill: "#fff", "text-anchor": "middle"
      }, badge);
      badgeText.textContent = maxLevel;
    }
  }

  /** 节点卡片渲染 */
  function renderNode(g, node, ctx) {
    var colors = TYPE_COLORS[node.type] || TYPE_COLORS.virtual;
    var issues = ctx.issuesFor(node.id);
    var maxLevel = issues.reduce(function (m, i) {
      if (i.level === "E") return "E";
      if (i.level === "W" && m !== "E") return "W";
      if (i.level === "I" && m !== "E" && m !== "W") return "I";
      return m;
    }, null);

    // 符号型元件走专门渲染
    if (SYMBOL_RENDERERS[node.type]) {
      renderSymbolNode(g, node, ctx, maxLevel);
      return;
    }

    // 配色语义覆盖
    var bgColor = colors.bg;
    var strokeColor = colors.stroke;
    if (ctx.colorBy === "util" && node.__calc && node.__calc.utilization != null) {
      var u = node.__calc.utilization;
      if (u > 1.0)      { bgColor = "#ffebee"; strokeColor = "#c62828"; }
      else if (u > 0.8) { bgColor = "#fff8e1"; strokeColor = "#f57f17"; }
      else if (u > 0.5) { bgColor = "#e8f5e9"; strokeColor = "#43a047"; }
      else              { bgColor = "#f1f8e9"; strokeColor = "#9ccc65"; }
    } else if (ctx.colorBy === "voltage") {
      var v = PT.engine.nodeVout(node, ctx.modeId);
      if (v != null) {
        var lane = PT.swimlane.laneOf(v);
        var laneColors = ["#eceff1","#e3f2fd","#e8f5e9","#fffde7","#fff3e0","#fce4ec","#f3e5f5"];
        bgColor = laneColors[lane] || colors.bg;
      }
    } else if (ctx.colorBy === "issue") {
      if (maxLevel === "E")      { bgColor = "#ffebee"; strokeColor = "#c62828"; }
      else if (maxLevel === "W") { bgColor = "#fff8e1"; strokeColor = "#f57f17"; }
      else if (maxLevel === "I") { bgColor = "#e3f2fd"; strokeColor = "#1565c0"; }
    } else if (ctx.colorBy === "domain" && node.domain) {
      bgColor = "#e8eaf6"; strokeColor = "#3949ab";
    } else if (ctx.colorBy === "pmic" && node.group) {
      var gchain = PT.store.graph.groupChain(node.group);
      var isPmic = gchain.some(function (gid) {
        var g = PT.store.graph.groups[gid];
        return g && g.kind === "pmic";
      });
      if (isPmic) { bgColor = "#e0f2f1"; strokeColor = "#00695c"; }
    }

    var w = node.width, h = node.height;
    var rx = 6;

    // 紧凑卡片: BUCK/LDO 系列只保留标题 (无第二行 id/refdes/part 描述)
    var compact = node.type === "buck" || node.type === "boost" ||
                  node.type === "buck_boost" || node.type === "ldo";

    // 卡片
    _el("rect", {
      x: 0, y: 0, width: w, height: h, rx: rx,
      fill: bgColor, stroke: strokeColor, "stroke-width": 1.5,
      "class": "pt-node-card"
    }, g);

    // 图标
    var iconG = _el("g", { transform: compact ? "translate(5,4)" : "translate(6,6)", "class": "pt-node-icon" }, g);
    _el("path", {
      d: TYPE_ICONS[node.type] || TYPE_ICONS.virtual,
      fill: "none", stroke: colors.icon, "stroke-width": 1.6,
      "stroke-linecap": "round", "stroke-linejoin": "round",
      transform: compact ? "scale(0.6)" : "scale(0.75)"
    }, iconG);

    // 标题
    var title = _el("text", {
      x: compact ? 24 : 30, y: compact ? 15 : 18, "class": "pt-node-title",
      "font-size": compact ? 11 : 12, "font-weight": 600, fill: "#212121"
    }, g);
    title.textContent = PT.util.ellipsize(node.name || node.id, compact ? 14 : 22);

    if (!compact) {
      // id / refdes (第二行描述, 紧凑卡片不画)
      var sub = _el("text", {
        x: 30, y: 32, "class": "pt-node-sub",
        "font-size": 10, fill: "#616161"
      }, g);
      var subText = node.id;
      if (node.refdes) subText += " · " + node.refdes;
      if (node.part) subText += " · " + node.part;
      sub.textContent = PT.util.ellipsize(subText, 30);
    }

    // 电气参数
    var line3 = _el("text", {
      x: 6, y: compact ? 33 : 48, "font-size": compact ? 9 : 10, fill: "#424242"
    }, g);
    var vout = PT.engine.nodeVout(node, ctx.modeId);
    var params = [];
    if (vout != null) params.push("V=" + PT.util.fmt(vout) + "V");
    var iSum = node.__calc && node.__calc.i_out_sum_ma;
    if (iSum != null && iSum > 0) params.push("I=" + PT.util.fmt(iSum) + "mA");
    line3.textContent = params.join("  ");

    // 利用率条
    var util = node.__calc && node.__calc.utilization;
    if (util != null && (compact ? h >= 48 : h >= 60)) {
      var barY = compact ? h - 11 : h - 14;
      var barH = 5;
      var barW = w - 12;
      _el("rect", {
        x: 6, y: barY, width: barW, height: barH,
        fill: "#eceff1", rx: 2
      }, g);
      var utilW = Math.min(1, util) * barW;
      var utilColor = util > 1 ? "#c62828" : util > 0.8 ? "#f57f17" : "#43a047";
      _el("rect", {
        x: 6, y: barY, width: utilW, height: barH,
        fill: utilColor, rx: 2
      }, g);
      var utilText = _el("text", {
        x: w - 8, y: barY - 2, "font-size": 9, fill: "#616161",
        "text-anchor": "end"
      }, g);
      utilText.textContent = PT.util.pct(util, 0);
    }

    // 问题角标
    if (maxLevel) {
      var badgeColor = maxLevel === "E" ? "#c62828" : maxLevel === "W" ? "#f57f17" : "#1565c0";
      var badge = _el("g", { transform: "translate(" + (w - 14) + ",10)", "class": "pt-issue-badge" }, g);
      _el("circle", { cx: 0, cy: 0, r: 8, fill: badgeColor }, badge);
      var badgeText = _el("text", {
        x: 0, y: 3, "font-size": 10, "font-weight": 700,
        fill: "#fff", "text-anchor": "middle"
      }, badge);
      badgeText.textContent = maxLevel;
    }

    // DVFS 标记 (紧凑卡片放右上角, 避免与参数行重叠)
    if (node.dvfs) {
      var dv = _el("text", {
        x: compact ? w - 6 : 6, y: compact ? 15 : h - 20,
        "font-size": 8, fill: "#8e24aa", "font-style": "italic"
      }, g);
      if (compact) dv.setAttribute("text-anchor", "end");
      dv.textContent = "DVFS";
    }
  }

  /** 折叠分组渲染 */
  function renderCollapsedGroup(g, agg, ctx) {
    var w = 200, h = 90;
    _el("rect", {
      x: 0, y: 0, width: w, height: h, rx: 8,
      fill: "#eceff1", stroke: "#607d8b", "stroke-width": 1.5,
      "stroke-dasharray": "4,3", "class": "pt-collapsed-group"
    }, g);

    var title = _el("text", {
      x: w / 2, y: 24, "font-size": 13, "font-weight": 700,
      fill: "#263238", "text-anchor": "middle"
    }, g);
    title.textContent = agg.name;

    var sub = _el("text", {
      x: w / 2, y: 42, "font-size": 11, fill: "#546e7a",
      "text-anchor": "middle"
    }, g);
    sub.textContent = "× " + agg.memberCount + " 节点 · Σ I = " + PT.util.fmt(agg.totalIMa) + " mA";

    var util = _el("text", {
      x: w / 2, y: 60, "font-size": 11, fill: "#546e7a",
      "text-anchor": "middle"
    }, g);
    util.textContent = "最大利用率 " + PT.util.pct(agg.maxUtil, 0);

    if (agg.issueCount.E + agg.issueCount.W + agg.issueCount.I > 0) {
      var iss = _el("text", {
        x: w / 2, y: 76, "font-size": 10, "text-anchor": "middle"
      }, g);
      iss.textContent = "E:" + agg.issueCount.E + "  W:" + agg.issueCount.W + "  I:" + agg.issueCount.I;
      iss.setAttribute("fill", agg.issueCount.E > 0 ? "#c62828" : "#f57f17");
    }
  }

  /** 分组框渲染 (在 elk 坐标下) */
  function renderGroupBox(g, elkGroup, ctx) {
    var label = (elkGroup.labels && elkGroup.labels[0] && elkGroup.labels[0].text) || "";
    _el("rect", {
      x: 0, y: 0,
      width: elkGroup.width, height: elkGroup.height,
      rx: 8, fill: "rgba(120,144,156,0.05)",
      stroke: "#90a4ae", "stroke-width": 1,
      "stroke-dasharray": "6,4",
      "class": "pt-group-box"
    }, g);
    var title = _el("text", {
      x: 12, y: 20, "font-size": 12, "font-weight": 600,
      fill: "#455a64", "class": "pt-group-title"
    }, g);
    title.textContent = label;
  }

  /** 对偶组外框渲染 (浅色整体框, 在 pair 容器坐标下; 跨列对偶簇不显示标题) */
  function renderPairBox(g, elkPair, ctx) {
    var label = (elkPair.labels && elkPair.labels[0] && elkPair.labels[0].text) || "";
    _el("rect", {
      x: 0, y: 0,
      width: elkPair.width, height: elkPair.height,
      rx: 10, fill: "rgba(126,87,194,0.05)",
      stroke: "#9575cd", "stroke-width": 1.2,
      "class": "pt-pair-box"
    }, g);
    if (elkPair.__noTitle || !label) return;   // 跨列对偶: 只留浅框
    var title = _el("text", {
      x: 10, y: 16, "font-size": 11, "font-weight": 600,
      fill: "#5e35b1", "class": "pt-pair-title"
    }, g);
    title.textContent = label;
  }

  PT.nodeShapes = {
    TYPE_COLORS: TYPE_COLORS,
    TYPE_ICONS: TYPE_ICONS,
    renderNode: renderNode,
    renderCollapsedGroup: renderCollapsedGroup,
    renderGroupBox: renderGroupBox,
    renderPairBox: renderPairBox
  };
})();
