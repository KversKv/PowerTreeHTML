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

  /** 电压域分色 (power 边按源端输出电压分档):
   *  0.5~1V → 蓝; 1~1.3V → 青; 1.3~3V (含 1.6~2V) → 绿; 3~3.5V → 橙; 3.5V 以上 → 红
   *  (档位间隙归入邻近档: <0.5 归蓝, 1.3~1.6/2~3 归绿) */
  var VOLT_BANDS = [
    { max: 1.0,      color: "#1565c0" },
    { max: 1.3,      color: "#00838f" },
    { max: 3.0,      color: "#2e7d32" },
    { max: 3.5,      color: "#ef6c00" },
    { max: Infinity, color: "#c62828" }
  ];
  var DEFAULT_POWER_COLOR = "#546e7a";

  function voltageBandColor(v) {
    for (var i = 0; i < VOLT_BANDS.length; i++) {
      if (v <= VOLT_BANDS[i].max) return VOLT_BANDS[i].color;
    }
    return DEFAULT_POWER_COLOR;
  }

  /** power 边电压: 取源节点输出电压; 源无 vout (如 load_switch) 时沿 power 入边上溯 */
  function edgeVoltage(edge, modeId) {
    var graph = PT.store && PT.store.graph;
    if (!graph || !edge) return null;
    var seen = {};
    var stack = [edge.from];
    while (stack.length) {
      var nid = stack.pop();
      if (seen[nid]) continue;
      seen[nid] = true;
      var n = graph.node(nid);
      if (!n) continue;
      var v = PT.engine.nodeVout(n, modeId);
      if (v != null) return v;
      var ups = graph.upstreamPowerIds(nid);
      for (var i = 0; i < ups.length; i++) stack.push(ups[i]);
    }
    return null;
  }

  /** power 边颜色 (按电压域分色); 取不到电压时退回默认灰蓝 */
  function powerEdgeColor(edge, modeId) {
    var v = edgeVoltage(edge, modeId);
    return v == null ? DEFAULT_POWER_COLOR : voltageBandColor(v);
  }

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

  var HOP_RX = 4.5;   // 跳线拱半宽 (与 renderEdgeDecor 的拱一致)

  /**
   * 在 path 的跳线位置断开水平段: 每个 hop 挖掉 [hp.x-RX, hp.x+RX] 区间,
   * 让拱替代该段水平线 (拱在 decor 里画), 避免"拱 + 底部直线"重叠。
   * 仅处理水平段 (y 相同); 返回拆分后的 path。
   */
  function breakPathAtHops(sections, hops) {
    if (!hops || !hops.length) return sectionsToPath(sections);
    var d = "";
    sections.forEach(function (sec) {
      var pts = [];
      if (sec.startPoint) pts.push(sec.startPoint);
      if (Array.isArray(sec.bendPoints)) pts = pts.concat(sec.bendPoints);
      if (sec.endPoint) pts.push(sec.endPoint);
      if (pts.length < 2) return;
      // 把每个水平段按 hop 切成若干子段
      var out = [];   // [ [x1,y1,x2,y2], ... ] 保留的线段
      for (var i = 0; i < pts.length - 1; i++) {
        var a = pts[i], b = pts[i + 1];
        if (a.y !== b.y) { out.push([a.x, a.y, b.x, b.y]); continue; }  // 竖段原样
        var y = a.y, x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x);
        // 收集落在本段上的 hop, 按 x 排序后挖区间
        var cuts = [];
        hops.forEach(function (hp) {
          if (hp.y !== y) return;
          if (hp.x > x1 && hp.x < x2) cuts.push(hp.x);
        });
        if (!cuts.length) { out.push([x1, y, x2, y]); continue; }
        cuts.sort(function (p, q) { return p - q; });
        var cur = x1;
        cuts.forEach(function (cx) {
          out.push([cur, y, cx - HOP_RX, y]);   // 左半
          cur = cx + HOP_RX;                     // 跳过拱区间
        });
        out.push([cur, y, x2, y]);               // 右半
      }
      // 过滤零长段, 生成 path
      out.forEach(function (sg) {
        if (Math.abs(sg[2] - sg[0]) < 0.5 && Math.abs(sg[3] - sg[1]) < 0.5) return;
        d += "M " + sg[0] + " " + sg[1] + " L " + sg[2] + " " + sg[3];
      });
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
  /** 把 sections 转成 path, branchOnly=true 时跳过竖直段 (由共享干线承载者画);
   *  hops 提供时, 水平段在跳线位置断开 (拱替代该段) */
  function sectionsToPathBranch(sections, branchOnly, hops) {
    if (!sections || !sections.length) return "";
    var d = "";
    // 单条水平段按 hops 断开成若干子段
    function segWithHops(x1, y, x2) {
      var out = "";
      if (y == null || x1 === x2) return out;
      var lo = Math.min(x1, x2), hi = Math.max(x1, x2);
      var cuts = [];
      (hops || []).forEach(function (hp) {
        if (hp.y === y && hp.x > lo && hp.x < hi) cuts.push(hp.x);
      });
      if (!cuts.length) return " M " + x1 + " " + y + " L " + x2 + " " + y;
      cuts.sort(function (p, q) { return p - q; });
      var cur = lo;
      cuts.forEach(function (cx) {
        if (cx - HOP_RX > cur) out += " M " + cur + " " + y + " L " + (cx - HOP_RX) + " " + y;
        cur = cx + HOP_RX;
      });
      if (hi > cur) out += " M " + cur + " " + y + " L " + hi + " " + y;
      return out;
    }
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
        d += segWithHops(pts[0].x, pts[0].y, pts[1].x);
        var n = pts.length;
        d += segWithHops(pts[n - 2].x, pts[n - 2].y, pts[n - 1].x);
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
    // 有跳线的边: 水平段在拱位置断开 (拱替代该段), 否则整线连续 (branchOnly 分支同样断开)
    var d = branchOnly ? sectionsToPathBranch(sections, true, edge.__hops)
                       : (edge.__hops && edge.__hops.length ? breakPathAtHops(sections, edge.__hops)
                                                            : sectionsToPath(sections));
    if (!d) return null;

    var isControl = edge.type === "control";
    var subColor = isControl ? (SUB_COLORS[edge.sub] || "#607d8b") : powerEdgeColor(edge, ctx.modeId);
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
      // 源短接水平段按 __bus.hops 在跳线位置断开 (拱替代该段)
      var srcSeg = { startPoint: { x: b.sx, y: b.sy }, bendPoints: [], endPoint: { x: b.busX, y: b.sy } };
      var srcD = (b.hops && b.hops.length)
        ? breakPathAtHops([srcSeg], b.hops)
        : ("M " + b.sx + " " + b.sy + " L " + b.busX + " " + b.sy);
      var busD = srcD +
                 " M " + b.busX + " " + b.sy +
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
        // Vin 标签: 显示模块输入网络名, 放在"进目标模块的末段水平线"中点正上方,
        // 沿线居中 —— 第一级入边的末段已留宽 (干线贴源列), 标签完整落在线上方。
        var pts = [sec2.startPoint].concat(sec2.bendPoints || [], [sec2.endPoint]);
        var hp = pts[pts.length - 2], ep = pts[pts.length - 1];
        var midX = (hp.y === ep.y) ? (hp.x + ep.x) / 2 : (ep.x - 24);
        // 只显示 Vin 网络名 (不带电流, 避免杂乱; 电流 hover tooltip / 点击高亮可查)
        var vlabel = _el("text", {
          x: midX, y: ep.y - 5, "font-size": 9,
          fill: ctx.highlight ? "#e64a19" : "#37474f",
          "text-anchor": "middle", "class": "pt-edge-vin-label", "data-edge-id": edge.id
        }, g);
        vlabel.textContent = vinName;
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
    var d = (link.__hops && link.__hops.length) ? breakPathAtHops(link.sections, link.__hops)
                                               : sectionsToPath(link.sections);
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
    // 跨越弧 (异网交叉时, 布局阶段已写入 link.__hops): 同 renderEdgeDecor, 透明底只画弧
    (link.__hops || []).forEach(function (hp) {
      var hg = _el("g", { "class": "pt-edge-hop" }, g);
      var R = HOP_RX;
      _el("path", {
        d: "M " + (hp.x - R) + " " + hp.y + " A " + R + " " + R + " 0 0 1 " + (hp.x + R) + " " + hp.y,
        fill: "none", stroke: "#7e57c2", "stroke-width": 1.4, "stroke-linecap": "round"
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
    var color = ctx.highlight ? "#ff5722" : powerEdgeColor(edge, ctx.modeId);
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

    // 跨越弧 (不相连): 只画半圆拱, 不加背景遮蔽 —— 透明底, 弧线本身即跨线符号。
    // 普通跳线 edge.__hops + 总线干线/源短接跳线 edge.__bus.hops
    var allHops = (edge.__hops || []).slice();
    if (edge.__bus && edge.__bus.hops) allHops = allHops.concat(edge.__bus.hops);
    allHops.forEach(function (hp) {
      var hg = _el("g", { "class": "pt-edge-hop", "data-edge-id": edge.id, opacity: op }, g);
      // 小巧半圆拱: 半宽 HOP_RX, 高度与半宽一致 (标准半圆, 不夸张)
      var RX = HOP_RX, RY = HOP_RX;
      _el("path", {
        d: "M " + (hp.x - RX) + " " + hp.y + " A " + RX + " " + RY + " 0 0 1 " + (hp.x + RX) + " " + hp.y,
        fill: "none", stroke: color, "stroke-width": Math.max(strokeW, 1.4),
        "stroke-linecap": "round"
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
    VOLT_BANDS: VOLT_BANDS,
    voltageBandColor: voltageBandColor,
    powerEdgeColor: powerEdgeColor,
    widthForCurrent: widthForCurrent,
    sectionsToPath: sectionsToPath,
    renderEdge: renderEdge,
    renderEdgeDecor: renderEdgeDecor,
    renderPairLink: renderPairLink,
    vinNetName: vinNetName,
    bundleByNet: bundleByNet
  };
})();
