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
  /** 把 sections 转成 path, branchOnly=true 时跳过竖直段 (由共享干线承载者画) */
  function sectionsToPathBranch(sections, branchOnly) {
    if (!sections || !sections.length) return "";
    var d = "";
    sections.forEach(function (sec) {
      var pts = [];
      if (sec.startPoint) pts.push(sec.startPoint);
      if (Array.isArray(sec.bendPoints)) pts = pts.concat(sec.bendPoints);
      if (sec.endPoint) pts.push(sec.endPoint);
      if (pts.length < 2) return;
      if (!branchOnly) {
        d += "M " + pts[0].x + " " + pts[0].y;
        for (var i = 1; i < pts.length; i++) d += " L " + pts[i].x + " " + pts[i].y;
        return;
      }
      // branchOnly: 源水平段 (pts[0]→pts[1]) 与 目标水平段 (倒数第2→末点), 竖直段跳过
      if (pts.length >= 2) {
        d += "M " + pts[0].x + " " + pts[0].y + " L " + pts[1].x + " " + pts[1].y;
        var n = pts.length;
        d += " M " + pts[n - 2].x + " " + pts[n - 2].y + " L " + pts[n - 1].x + " " + pts[n - 1].y;
      }
    });
    return d;
  }

  /** netNaming 配置 (Vin 标签规则, 可在 data/config.data.js 调整) */
  function _netNaming() {
    var cfg = (PT.store && PT.store.config) || {};
    var nn = cfg.netNaming || {};
    return {
      enabled: nn.vinLabel !== false,
      types: nn.moduleTypes || ["buck", "boost", "buck_boost", "ldo", "load_switch", "efuse", "ideal_diode", "level_shifter"],
      pattern: nn.pattern || "{net}_{node}"
    };
  }

  /**
   * 模块输入网络名 (Vin 标签):
   * 显式 node.vin_net 优先, 否则按 netNaming.pattern 推导 (缺省 "{net}_{node}", 如 VSYS_BUCK_03)。
   * 仅 power 边且目标类型属于 moduleTypes 时返回非空; 电气连接仍走 edge.net, 只改显示。
   */
  function vinNetName(edge) {
    var nn = _netNaming();
    if (!nn.enabled) return null;
    if (!edge || edge.type === "control" || !edge.net) return null;
    var graph = PT.store && PT.store.graph;
    var tnode = graph && graph.node ? graph.node(edge.to) : null;
    if (!tnode || nn.types.indexOf(tnode.type) < 0) return null;
    if (tnode.vin_net) return tnode.vin_net;
    return nn.pattern
      .replace("{net}", edge.net)
      .replace("{node}", tnode.id)
      .replace("{from}", edge.from);
  }

  function renderEdge(g, edge, sections, ctx) {
    ctx = ctx || {};
    var branchOnly = sections && sections[0] && sections[0].__branchOnly;
    var d = branchOnly ? sectionsToPathBranch(sections, true) : sectionsToPath(sections);
    if (!d) return null;

    var isControl = edge.type === "control";
    var subColor = isControl ? (SUB_COLORS[edge.sub] || "#607d8b") : "#546e7a";
    var currentMa = ctx.currentMa != null ? ctx.currentMa : ((edge.__calc && edge.__calc.i_ma) || 0);
    var strokeW = isControl ? 1.2 : widthForCurrent(currentMa);
    var edgeColor = ctx.highlight ? "#ff5722" : subColor;

    // 透明加宽命中区 (点击/hover 用), 细线也能可靠点中
    function hitPath(dPath) {
      return _el("path", {
        d: dPath, fill: "none", stroke: "rgba(0,0,0,0)",
        "stroke-width": Math.max(strokeW + 4, 10),
        "pointer-events": "stroke",
        "class": "pt-edge-hit", "data-edge-id": edge.id
      }, g);
    }

    // 共享干线: 承载者画整段竖直干线 (细线), 只画一次
    if (edge.__trunk) {
      var tk = edge.__trunk;
      var trunkD = "M " + tk.x + " " + tk.y1 + " L " + tk.x + " " + tk.y2;
      _el("path", {
        d: trunkD,
        fill: "none", stroke: edgeColor, "stroke-width": 1.4,
        "class": "pt-edge pt-edge-trunk", "data-edge-id": edge.id,
        opacity: ctx.faded ? 0.15 : null
      }, g);
      hitPath(trunkD);
    }

    // 总线干线: 同源扇出的首条边负责画 "源→竖直干线" (只做一次)
    if (edge.__bus && edge.__bus.first) {
      var b = edge.__bus;
      var busD = "M " + b.sx + " " + b.sy +
                 " L " + b.busX + " " + b.sy +
                 " L " + b.busX + " " + b.busY1 +
                 " M " + b.busX + " " + b.sy +
                 " L " + b.busX + " " + b.busY2;
      _el("path", {
        d: busD, fill: "none", stroke: edgeColor,
        "stroke-width": strokeW + 0.6, "class": "pt-edge pt-edge-bus", "data-edge-id": edge.id,
        opacity: ctx.faded ? 0.15 : null
      }, g);
      hitPath(busD);
    }

    var attrs = {
      d: d,
      fill: "none",
      stroke: edgeColor,
      "stroke-width": ctx.highlight ? strokeW + 1 : strokeW,
      "class": "pt-edge pt-edge-" + (isControl ? "control" : "power"),
      "data-edge-id": edge.id
    };
    if (isControl) {
      attrs["stroke-dasharray"] = "5,4";
    }
    if (ctx.faded) {
      attrs.opacity = 0.15;
    }
    _el("path", attrs, g);
    var hit = hitPath(d);

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

    // 标签: 只保留模块 Vin 输入网络名 (如 VSYS_BUCK_03) + 电流;
    // 连线上的 net/信号名称一律不画 (避免杂乱) —— 网络名可 hover 查看 tooltip 或点击追踪高亮。
    if (ctx.showLabel && sections && sections.length) {
      var sec2 = sections[0];
      var vinName = isControl ? null : vinNetName(edge);
      if (vinName && !edge.__vinHidden && sec2.endPoint) {
        // Vin 标签: 锚在目标模块输入引脚处 (目标端上方, 右对齐)
        // 显示模块输入网络名, 而不是前级的输出网络名
        var ep = sec2.endPoint;
        var vparts = [vinName];
        if (currentMa > 0) vparts.push(PT.util.fmt(currentMa) + "mA");
        var vlabel = _el("text", {
          x: ep.x - 6, y: ep.y - 5, "font-size": 9,
          fill: ctx.highlight ? "#e64a19" : "#37474f",
          "text-anchor": "end", "class": "pt-edge-vin-label", "data-edge-id": edge.id
        }, g);
        vlabel.textContent = vparts.join(" · ");
      }
    }

    return hit;
  }

  /**
   * 跨列对偶"输出合并短接线": 对偶轨成员分列放置时, 两簇输出端之间画连接,
   * 并在两端成员节点的输出端口画合并结点圆点 —— 表示输出合并后一起输出。
   * @param {SVGGElement} g
   * @param {object} link  { id, sections, am, bm }  am/bm 为两端成员节点 id
   * @param {object} ctx   { posOf(nid) -> {x,y,w,h} 绝对坐标 }
   */
  function renderPairLink(g, link, ctx) {
    ctx = ctx || {};
    if (!link.sections || !link.sections[0]) return;
    var d = sectionsToPath(link.sections);
    if (!d) return;
    _el("path", {
      d: d, fill: "none", stroke: "#7e57c2", "stroke-width": 2,
      "class": "pt-pair-link"
    }, g);
    // 合并结点 (两端成员的输出端口)
    var dots = [];
    (link.am || []).concat(link.bm || []).forEach(function (nid) {
      var r = ctx.posOf && ctx.posOf(nid);
      if (r) dots.push({ x: r.x + r.w, y: r.y + r.h / 2 });
    });
    dots.forEach(function (pt) {
      _el("circle", {
        cx: pt.x, cy: pt.y, r: 3,
        fill: "#7e57c2", "class": "pt-pair-link-dot"
      }, g);
    });
    // 跨越弧 (异网交叉时, 布局阶段已写入 link.__hops)
    (link.__hops || []).forEach(function (hp) {
      var hg = _el("g", { "class": "pt-edge-hop" }, g);
      _el("line", {
        x1: hp.x - 5.5, y1: hp.y, x2: hp.x + 5.5, y2: hp.y,
        stroke: "#fafafa", "stroke-width": 4, "class": "pt-edge-hop-mask"
      }, hg);
      _el("path", {
        d: "M " + (hp.x - 5) + " " + hp.y + " A 5 5 0 0 1 " + (hp.x + 5) + " " + hp.y,
        fill: "none", stroke: "#7e57c2", "stroke-width": 1.6
      }, hg);
    });
  }

  /**
   * 边装饰 (由渲染器第二遍调用, 保证压在所有边线之上):
   * - T 型结点圆点 (pt-edge-dot)  = 电气相连: 总线分支接干线 / 同网共享干线接点
   * - 跨越弧 (pt-edge-hop)        = 异网十字交叉但不相连 (布局阶段检测, __hops)
   */
  function renderEdgeDecor(g, edge, sections, ctx) {
    ctx = ctx || {};
    if (edge.type === "control") return;   // 控制虚线不画结点/跳线
    var currentMa = ctx.currentMa != null ? ctx.currentMa : ((edge.__calc && edge.__calc.i_ma) || 0);
    var strokeW = widthForCurrent(currentMa);
    var color = ctx.highlight ? "#ff5722" : "#546e7a";
    var op = ctx.faded ? 0.15 : null;

    // T 型结点 (相连)
    var dots = [];
    if (edge.__bus) {
      var b = edge.__bus;
      if (b.first) dots.push({ x: b.busX, y: b.sy });   // 源短接 × 干线
      if (sections && sections[0] && sections[0].startPoint) {
        dots.push({ x: sections[0].startPoint.x, y: sections[0].startPoint.y });  // 分支 × 干线
      }
    } else if (sections && sections[0] && sections[0].__branchOnly && Array.isArray(sections[0].bendPoints)) {
      // 共享干线接点: 非承载者必然共享; 承载者仅在 shared 时 (独占干线只是走线拐角, 不画点)
      var shared = edge.__trunk ? edge.__trunk.shared : true;
      if (shared) {
        sections[0].bendPoints.forEach(function (bp) { dots.push({ x: bp.x, y: bp.y }); });
      }
    }
    dots.forEach(function (pt) {
      _el("circle", {
        cx: pt.x, cy: pt.y, r: 2.8, fill: color,
        "class": "pt-edge-dot", "data-edge-id": edge.id,
        opacity: op
      }, g);
    });

    // 跨越弧 (不相连): 白色遮蔽被跨线 + 上半圆拱
    (edge.__hops || []).forEach(function (hp) {
      var hg = _el("g", { "class": "pt-edge-hop", "data-edge-id": edge.id, opacity: op }, g);
      _el("line", {
        x1: hp.x - 5.5, y1: hp.y, x2: hp.x + 5.5, y2: hp.y,
        stroke: "#fafafa",   // 内联兜底 (PNG 导出无 CSS); 浏览器中由主题类覆盖
        "stroke-width": strokeW + 3, "class": "pt-edge-hop-mask"
      }, hg);
      _el("path", {
        d: "M " + (hp.x - 5) + " " + hp.y + " A 5 5 0 0 1 " + (hp.x + 5) + " " + hp.y,
        fill: "none", stroke: color, "stroke-width": Math.max(strokeW, 1.6)
      }, hg);
    });
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
    renderEdgeDecor: renderEdgeDecor,
    renderPairLink: renderPairLink,
    vinNetName: vinNetName,
    bundleByNet: bundleByNet
  };
})();
