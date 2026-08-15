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
   * 降级布局: 层次化简化 layered 布局 (在 ELK 不可用时使用, 保证 file:// 也能跑)
   * - 递归处理分组嵌套: 子分组先布局, 尺寸由内容 + 内边距撑起
   * - 每个容器内按 Kahn 最长路分层 (只参考 power 边, 控制边不参与分层)
   * - 层间距按"穿越该层边界的 net 通道数"动态加宽 (平行干线保持最小间距 LANE_GAP)
   * - 跨容器边把端点向上提升 (lift) 到本容器直接孩子后再参与分层
   * - 空分组 (成员被过滤/聚焦隐藏) 自动从 children 移除
   * - 节点坐标为相对父容器原点 (渲染器会累加分组偏移); 边 sections 用世界绝对坐标
   * - 走线 (列间通道化):
   *   相邻列边 H-V-H, 竖直段走列间间隙车道, 同 net 合并共享干线, 异网 ≥ LANE_GAP;
   *   跨列边 H-V-H-V-H, 在中间列模块间的"水平空隙带"穿过, 绝不穿模块身体;
   *   同节点多路入/出沿边缘纵向分散端口 (负载多路输入各自独立进线, 不先合并);
   *   同源扇出 ≥3 且同 net: 总线拓扑 (一条竖直干线 + 各目标水平分支)。
   */
  function _fallbackLayout(elkGraph) {
    var NODE_GAP = 24;     // 同层节点垂直间距
    var GROUP_PAD = { t: 48, l: 16, r: 16, b: 16 };  // 分组内边距 (同 layoutOpts.groupOptions)
    var ROOT_PAD = 24;
    var BASE_GAP = 56;     // 最小层间水平间距
    var LANE_GAP = 12;     // 平行竖直干线最小间距
    var GAP_MARGIN = 60;   // 层间距余量 (= 节点 CLR*2 + 分组 padding 等)
    var PORT_STEP = 12;    // 同节点多路入/出端口的纵向间距
    var PORT_MARGIN = 10;  // 端口距节点上下缘的最小距离
    var BAND_CLR = 8;      // 跨列水平空隙带与模块的安全间距
    var CLR = 14;          // 走线与节点的安全间距

    var edges = elkGraph.edges || [];
    var depths = elkGraph.__depths || {};

    // 清理上一次布局挂在 Graph 边上的渲染标记, 防止折叠/过滤后残留
    edges.forEach(function (e) {
      if (e.__edge) {
        e.__edge.__bus = null;
        e.__edge.__trunk = null;
        e.__edge.__hops = null;
        e.__edge.__vinHidden = null;
      }
    });

    // 全局 id → elk 节点, 并挂父指针 (lift 用)
    var nodeById = {};
    (function index(container) {
      (container.children || []).forEach(function (c) {
        nodeById[c.id] = c;
        c.__parent = container;
        index(c);
      });
    })(elkGraph);
    elkGraph.__parent = null;

    /** 把端点 id 向上提升为 container 直接孩子的 id; 不在本子树则返回 null */
    function liftTo(id, childSet) {
      var n = nodeById[id];
      while (n && !childSet[n.id]) n = n.__parent;
      return n ? n.id : null;
    }

    /** 布局 pair 容器: 成员垂直堆叠 (BUCK 上 LDO 下), 尺寸由成员撑起 */
    function layoutPair(container) {
      // 对偶组一律不显示标题, 上留白收窄
      var PAD = { t: 8, l: 6, r: 6, b: 6 };
      var GAP = 4;
      var w = 0;
      (container.children || []).forEach(function (m) { if ((m.width || 0) > w) w = m.width; });
      var y = PAD.t;
      (container.children || []).forEach(function (m) {
        m.x = PAD.l + (w - (m.width || 0)) / 2;
        m.y = y;
        y += (m.height || 0) + GAP;
      });
      container.width = w + PAD.l + PAD.r;
      container.height = y - GAP + PAD.b;
    }

    /** 递归布局容器 (isRoot=根), 孩子坐标相对容器原点, 容器尺寸由内容撑起 */
    function layoutContainer(container, isRoot) {
      var children = container.children || [];
      // 先递归子分组与 pair, 让其获得尺寸
      children.forEach(function (c) {
        if (c.__isGroup) layoutContainer(c, false);
        else if (c.__isPair) layoutPair(c);
      });
      // 移除空分组 (成员全部被隐藏时)
      children = children.filter(function (c) { return !c.__isGroup || !c.__empty; });
      container.children = children;

      if (container.__isGroup && !children.length) {
        container.__empty = true;
        container.width = 0;
        container.height = 0;
        return;
      }

      var pad = isRoot
        ? { t: ROOT_PAD, l: ROOT_PAD, r: ROOT_PAD, b: ROOT_PAD }
        : GROUP_PAD;

      var childSet = {};
      children.forEach(function (c) { childSet[c.id] = c; });

      // 容器内分层边: 仅 power 边参与; 端点 lift 到本容器孩子; 去掉自环
      var inDeg = {}, adj = {};
      children.forEach(function (c) { inDeg[c.id] = 0; adj[c.id] = []; });
      edges.forEach(function (e) {
        if (e.__edge && e.__edge.type === "control") return;
        var s = liftTo(e.sources && e.sources[0], childSet);
        var t = liftTo(e.targets && e.targets[0], childSet);
        if (s && t && s !== t) {
          inDeg[t]++;
          adj[s].push(t);
        }
      });

      // Kahn 拓扑 + 最长路分层 (环内节点保持 layer 0)
      var layer = {}, queue = [];
      children.forEach(function (c) {
        if (inDeg[c.id] === 0) { layer[c.id] = 0; queue.push(c.id); }
      });
      var qi = 0;
      while (qi < queue.length) {
        var cur = queue[qi++];
        adj[cur].forEach(function (t) {
          if (layer[t] == null || layer[t] < layer[cur] + 1) layer[t] = layer[cur] + 1;
          if (--inDeg[t] === 0) queue.push(t);
        });
      }
      children.forEach(function (c) { if (layer[c.id] == null) layer[c.id] = 0; });

      // 按层分组 (保持 children 声明顺序)
      var layers = {};
      children.forEach(function (c) {
        (layers[layer[c.id]] = layers[layer[c.id]] || []).push(c);
      });

      // 预计算: 每个孩子的"直接 power 下游"lift 到本容器后的目标 (用于同层排序)
      var downMap = {};
      children.forEach(function (c) { downMap[c.id] = []; });
      edges.forEach(function (e) {
        if (e.__edge && e.__edge.type === "control") return;
        var s = liftTo(e.sources && e.sources[0], childSet);
        var t = liftTo(e.targets && e.targets[0], childSet);
        if (s && t && s !== t && childSet[s] && childSet[t]) {
          downMap[s].push(t);
        }
      });

      // 动态层间距: 统计穿越每个层边界 b (layer b 与 b+1 之间) 的 net 通道数,
      // 间距 = 通道数 * LANE_GAP + GAP_MARGIN —— 一二层之间需要走多少条平行干线,
      // 就留多宽, 避免干线挤在一起或贴到模块边缘。
      var sortedLayers = Object.keys(layers).map(Number).sort(function (a, b) { return a - b; });
      var maxLayer = sortedLayers.length ? sortedLayers[sortedLayers.length - 1] : 0;
      var gapOf = {};
      for (var b = 0; b < maxLayer; b++) {
        var chNets = {};
        edges.forEach(function (e) {
          var ge = e.__edge;
          if (!ge) return;
          var nk = ge.type === "control" ? "__ctl__" : (ge.net || ("__e_" + e.id));
          var s = liftTo(e.sources && e.sources[0], childSet);
          var t = liftTo(e.targets && e.targets[0], childSet);
          var hit = false;
          if (s && t) {
            if (s === t) return;
            var ls = layer[s], lt = layer[t];
            if (ls <= b && lt >= b + 1) hit = true;   // 前向穿越
            if (lt <= b && ls >= b + 1) hit = true;   // 后向穿越 (PG 等)
          } else if (s || t) {
            // 进/出容器的边: 按 power 深度判断流向 (深度增加 = 向右),
            // 只在其源侧/目标侧间隙占通道
            var fd = depths[ge.from], td = depths[ge.to];
            if (fd == null || td == null || td <= fd) return;
            if (s && layer[s] === b) hit = true;             // 出容器: 源侧间隙
            if (!s && t && layer[t] === b + 1) hit = true;   // 入容器: 目标侧间隙
          }
          if (hit) chNets[nk] = 1;
        });
        var nch = Object.keys(chNets).length;
        gapOf[b] = nch <= 1 ? BASE_GAP : nch * LANE_GAP + GAP_MARGIN;
      }
      // 第一级 (layer0 源 → layer1 模块) 的入线要带 Vin 标签 (如 VSYS_BUCK_01 · 2100mA, 约 100px),
      // 标签放在"干线 → 目标引脚"的末段水平线上方, 该段长 = 目标左缘-CLR - 干线x。
      // 故第一层间隙必须 ≥ 第一级入边数*LANE_GAP (L 侧干线占位) + VIN_LABEL_W (末段留宽)。
      var VIN_LABEL_W = 104;
      var firstInNets = {};
      edges.forEach(function (e) {
        var ge = e.__edge;
        if (!ge || ge.type === "control") return;
        if ((depths[ge.from] || 0) !== 0) return;   // 源 depth=0 = 第一级
        var t = liftTo(e.targets && e.targets[0], childSet);
        if (t && layer[t] === 1) firstInNets[ge.net || e.id] = 1;
      });
      var nFirst = Object.keys(firstInNets).length;
      if (maxLayer >= 1 && nFirst > 0) {
        var need = nFirst * LANE_GAP + VIN_LABEL_W + CLR * 2;
        if (gapOf[0] == null || gapOf[0] < need) gapOf[0] = need;
      }

      // 逐层放置: 每层一列, x 按前层最大宽度 + 动态层间距累加, y 同层垂直堆叠
      var xCursor = pad.l;
      var prevCenters = null;  // 上一层各 child 的 y 中心 (用于重心排序)
      sortedLayers.forEach(function (l, li) {
        var list = layers[l].slice();

        if (li === 0) {
          // 第一层: 把"有直接下游扇出"的节点与其下挂在纵向上靠近 ——
          // 这里按声明顺序即可, 但把扇出多的往前提, 让后续层对齐更稳
          list.sort(function (a, b) { return downMap[b.id].length - downMap[a.id].length; });
        } else if (prevCenters) {
          // 后续层: 按"上游在上一层的 y 中心"重心排序, 减少交叉
          var bary = {};
          list.forEach(function (c) {
            var ups = [];
            edges.forEach(function (e) {
              if (e.__edge && e.__edge.type === "control") return;
              var t = liftTo(e.targets && e.targets[0], childSet);
              if (t !== c.id) return;
              var s = liftTo(e.sources && e.sources[0], childSet);
              if (s != null && prevCenters[s] != null) ups.push(prevCenters[s]);
            });
            bary[c.id] = ups.length ? (ups.reduce(function (x, y) { return x + y; }, 0) / ups.length) : Infinity;
          });
          list.sort(function (a, b) {
            if (bary[a.id] === bary[b.id]) return 0;
            return bary[a.id] < bary[b.id] ? -1 : 1;
          });
        }

        var wMax = 0;
        list.forEach(function (c) { if ((c.width || 0) > wMax) wMax = c.width; });
        var y = pad.t;
        var centers = {};
        list.forEach(function (c) {
          // 同层节点按"中心对齐"放置 (而非左对齐): 混合宽度时边缘不齐更整齐,
          // 第一级 buck/ldo/load_switch 宽度不同, 中心对齐后入线端口 x 一致
          c.x = xCursor + (wMax - (c.width || 0)) / 2;
          c.y = y;
          centers[c.id] = y + (c.height || 0) / 2;
          y += (c.height || 0) + NODE_GAP;
        });
        prevCenters = centers;
        xCursor += wMax + (gapOf[l] != null ? gapOf[l] : BASE_GAP);
      });

      // 容器尺寸 = 内容 bbox + 内边距
      var bbW = 0, bbH = 0;
      children.forEach(function (c) {
        if (c.x + (c.width || 0) > bbW) bbW = c.x + (c.width || 0);
        if (c.y + (c.height || 0) > bbH) bbH = c.y + (c.height || 0);
      });
      container.width = bbW + pad.r;
      container.height = bbH + pad.b;
    }

    layoutContainer(elkGraph, true);

    // 世界绝对坐标表 (边 sections 用): 递归所有容器 (分组 + pair)
    var abs = {};
    (function collect(container, ox, oy) {
      var bx = ox + (container.x || 0);
      var by = oy + (container.y || 0);
      (container.children || []).forEach(function (c) {
        abs[c.id] = { x: bx + (c.x || 0), y: by + (c.y || 0), w: c.width || 0, h: c.height || 0 };
        if (c.__isGroup || c.__isPair) collect(c, bx, by);
      });
    })(elkGraph, 0, 0);

    /** 解析边端点坐标: 真实节点优先, 找不到则 lift 到最近的已布局祖先 (pair/分组) */
    function resolveAbs(id) {
      if (abs[id]) return abs[id];
      var n = nodeById[id];
      while (n) {
        if (abs[n.id]) return abs[n.id];
        n = n.__parent;
      }
      return null;
    }

    /* ================= 正交走线 (列间通道化) =================
     * 节点按 x 归并为若干"列", 列间间隙是唯一的竖直走线区:
     * - 相邻列边 H-V-H; 跨列边 H-V-H-V-H (在中间列模块间的"水平空隙带"穿过, 不穿模块)
     * - 间隙内竖直干线按 net 分配车道: 同 net 共线合并, 异网保持 LANE_GAP 最小间距
     * - 同节点多路入/出: 端口沿边缘纵向分散 (负载多路输入各自独立进线, 不先合并)
     */

    // 1) 障碍矩形: 真实节点 + 折叠聚合节点 (分组/pair 外框不算障碍)
    var obstacles = [];
    Object.keys(abs).forEach(function (id) {
      var nd = nodeById[id];
      if (nd && (nd.__node || nd.__collapsed)) obstacles.push(abs[id]);
    });

    // 线段 (x1,y1)-(x2,y2) 是否穿过任一障碍 (含 clr 外扩; 起止节点不算障碍)
    function segBlockedClr(x1, y1, x2, y2, sRect, tRect, clr) {
      var minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
      var minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
      for (var i = 0; i < obstacles.length; i++) {
        var r = obstacles[i];
        if (r === sRect || r === tRect) continue;
        var rx1 = r.x - clr, ry1 = r.y - clr, rx2 = r.x + r.w + clr, ry2 = r.y + r.h + clr;
        if (maxX < rx1 || minX > rx2 || maxY < ry1 || minY > ry2) continue;
        if (x1 === x2) {  // 竖线
          if (x1 > rx1 && x1 < rx2 && maxY > ry1 && minY < ry2) return true;
        } else {          // 横线
          if (y1 > ry1 && y1 < ry2 && maxX > rx1 && minX < rx2) return true;
        }
      }
      return false;
    }
    function segBlocked(x1, y1, x2, y2, sRect, tRect) {
      return segBlockedClr(x1, y1, x2, y2, sRect, tRect, CLR);
    }

    // 2) 列归并: x 方向重叠/相接的节点归为同列; 列间间隙 = 竖直走线通道
    var runs = [];
    obstacles.slice().sort(function (a, b) { return a.x - b.x; }).forEach(function (r) {
      var last = runs[runs.length - 1];
      if (last && r.x <= last.x2 + 4) {
        if (r.x + r.w > last.x2) last.x2 = r.x + r.w;
        r.__run = runs.length - 1;
      } else {
        runs.push({ x1: r.x, x2: r.x + r.w });
        r.__run = runs.length - 1;
      }
    });
    function runOf(rect) {
      var cx = rect.x + rect.w / 2;
      for (var i = 0; i < runs.length; i++) {
        if (cx >= runs[i].x1 - 2 && cx <= runs[i].x2 + 2) return i;
      }
      return -1;
    }
    /** 列 runIdx 与其右邻列之间的可用走线区间 (两侧留 CLR 安全间距);
     *  runIdx=-1 表示首列左侧; 末列之后自动外扩 */
    function gapZone(runIdx) {
      if (runIdx < 0) {
        var xr = runs[0].x1 - CLR;
        return { x1: xr - 48, x2: xr };
      }
      var l = runs[runIdx], r = runs[runIdx + 1];
      var x1 = l.x2 + CLR;
      var x2 = r ? r.x1 - CLR : l.x2 + CLR + 48;
      if (x2 < x1 + 12) x2 = x1 + 12;
      return { x1: x1, x2: x2 };
    }

    /** 边的 net key (控制边统一 __ctl__ 共享车道) */
    function netOf(e) {
      var ge = e.__edge;
      if (ge && ge.type === "control") return "__ctl__";
      return (ge && ge.net) || ("__nonet_" + e.id);
    }

    var BUS_SRC_MIN = 3;   // 同源同 net 扇出达到该数才合并成总线
    var busEdgeIds = {};   // 被总线接管的边 id
    var recs = [];         // 全部走线记录
    var zones = {};        // runIdx -> {x1, x2, segs: []}

    /** 登记一条竖直走线段 (参与车道分配; kind: bus/n=普通/x=跨列; side: L 贴源列 / R 贴目标列) */
    function addSeg(runIdx, net, y1, y2, kind, rec, side) {
      var z = gapZone(runIdx);
      var key = String(runIdx);
      if (!zones[key]) zones[key] = { x1: z.x1, x2: z.x2, segs: [] };
      var sg = { net: net, y1: Math.min(y1, y2), y2: Math.max(y1, y2), kind: kind, rec: rec, side: side || "R", x: 0 };
      zones[key].segs.push(sg);
      return sg;
    }

    // 3) 总线检测: 同一源节点、同 net、向右扇出 ≥3 → 一条竖直干线 + 各目标水平分支
    var bySrc = {};
    edges.forEach(function (e) {
      var s = resolveAbs(e.sources && e.sources[0]);
      var t = resolveAbs(e.targets && e.targets[0]);
      if (!s || !t) return;
      var isControl = e.__edge && e.__edge.type === "control";
      var forward = t.x > s.x + s.w;   // 目标在源右侧
      var key = e.sources[0];
      (bySrc[key] = bySrc[key] || []).push({ e: e, s: s, t: t, forward: forward, isControl: isControl });
    });

    Object.keys(bySrc).forEach(function (srcId) {
      var list = bySrc[srcId];
      // 按 net 细分: 只有同 net 的扇出才合并成总线
      var byNet = {};
      list.forEach(function (r) {
        if (!r.forward || r.isControl) return;
        var nk = netOf(r.e);
        (byNet[nk] = byNet[nk] || []).push(r);
      });
      Object.keys(byNet).forEach(function (nk) {
        var fwd = byNet[nk];
        if (fwd.length < BUS_SRC_MIN) return;
        var s = fwd[0].s;
        var sr = runOf(s);
        // 成员目标必须都在紧邻右列, 否则退出总线单独走线
        var members = fwd.filter(function (r) { return sr >= 0 && runOf(r.t) === sr + 1; });
        if (members.length < BUS_SRC_MIN) return;
        members.sort(function (a, b) { return (a.t.y + a.t.h / 2) - (b.t.y + b.t.h / 2); });
        var rec = {
          kind: "bus", net: nk, s: s,
          sx: s.x + s.w, sy: s.y + s.h / 2,
          members: members
        };
        members.forEach(function (m) { busEdgeIds[m.e.id] = 1; });
        var ys = members.map(function (m) { return m.t.y + m.t.h / 2; });
        ys.push(rec.sy);
        // 总线干线贴源列 (L): 各目标分支水平段拉长到目标, Vin 标签放在分支线上方不溢出
        rec.trunkSeg = addSeg(sr, nk, Math.min.apply(null, ys), Math.max.apply(null, ys), "bus", rec, "L");
        recs.push(rec);
      });
    });

    // 4) 端口分配: 同节点的多路入边/出边沿边缘纵向分散 (按对端 y 排序减少交叉)。
    //    负载多路输入由此各自独立进线, 不在节点外先合并; 总线源保持单点出线。
    var ports = {};   // edgeId -> {sy, ty}
    (function assignPorts() {
      var inBy = {}, outBy = {};
      edges.forEach(function (e) {
        if (e.__edge && e.__edge.type === "control") return;
        var s = resolveAbs(e.sources && e.sources[0]);
        var t = resolveAbs(e.targets && e.targets[0]);
        if (!s || !t) return;
        (inBy[e.targets[0]] = inBy[e.targets[0]] || []).push({ e: e, other: s.y + s.h / 2 });
        if (!busEdgeIds[e.id]) {
          (outBy[e.sources[0]] = outBy[e.sources[0]] || []).push({ e: e, other: t.y + t.h / 2 });
        }
      });
      function spread(map, key) {
        Object.keys(map).forEach(function (nid) {
          var arr = map[nid];
          if (arr.length < 2) return;
          var r = resolveAbs(nid);
          if (!r) return;
          var n = arr.length;
          var maxSpan = Math.max(0, r.h - 2 * PORT_MARGIN);
          var step = Math.min(PORT_STEP, maxSpan / (n - 1));
          if (step <= 0) return;
          arr.sort(function (a, b) { return a.other - b.other; });
          var cy = r.y + r.h / 2;
          var span = step * (n - 1);
          arr.forEach(function (it, i) {
            ports[it.e.id] = ports[it.e.id] || {};
            ports[it.e.id][key] = cy - span / 2 + i * step;
          });
        });
      }
      spread(inBy, "ty");
      spread(outBy, "sy");
    })();
    function portY(e, rect, key) {
      var p = ports[e.id];
      return (p && p[key] != null) ? p[key] : rect.y + rect.h / 2;
    }

    // 5) 跨列走线: H-V-H-V-H —— 在中间列模块间的"水平空隙带"穿过, 绝不穿模块身体
    //    同一带可被同 net 复用; 异 net 要求水平 x 区间不重叠 (间隔 ≥6), 避免带耗尽
    var bandUsed = {};   // Math.round(y) -> [{x1, x2, net}]
    /**
     * @param rec      {s,t,sx,sy,tx,ty,net}
     * @param segRun1  竖直段1所在间隙 (源列右侧)
     * @param segRun2  竖直段2所在间隙
     * @param crossLo/crossHi 需要水平穿越的列范围 (含两端)
     */
    function routeExtended(rec, segRun1, segRun2, crossLo, crossHi) {
      var z1 = gapZone(segRun1), z2 = gapZone(segRun2);
      var g1 = (z1.x1 + z1.x2) / 2, g2 = (z2.x1 + z2.x2) / 2;
      // 空隙带候选: 穿越列 + 源列 + 目标列全部模块的 y 区间 (外扩 BAND_CLR) 补集 ——
      // 源/目标自己也被当成障碍, 水平段绝不从模块"上/下边中间"穿过。
      // 带按 4px 粒度逐点枚举报全, 防止"近处带被异网占用时把挡板挤进模块" (补集重算挡板移动)。
      var ints = [];
      obstacles.forEach(function (r) {
        if (r.__run < crossLo - 1 || r.__run > crossHi + 1) return;
        ints.push([r.y - BAND_CLR, r.y + r.h + BAND_CLR]);
      });
      ints.sort(function (a, b) { return a[0] - b[0]; });
      var merged = [];
      ints.forEach(function (iv) {
        var last = merged[merged.length - 1];
        if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
        else merged.push(iv.slice());
      });
      var top = merged.length ? merged[0][0] - 40 : 0;
      var bot = merged.length ? merged[merged.length - 1][1] + 40 : Math.max(rec.sy, rec.ty) + 40;
      var cands = [];
      if (merged.length) cands.push((rec.sy + rec.ty) / 2);
      for (var yi = Math.floor(top / 4) * 4; yi <= bot; yi += 4) cands.push(yi);
      var lo2 = Math.min(g1, g2), hi2 = Math.max(g1, g2);
      var bands = cands.filter(function (yc) {
        var ok = !merged.some(function (iv) { return yc > iv[0] && yc < iv[1]; });
        if (!ok) return false;
        // 异网同水平带且 x 区间重叠时跳过 (同 net 可复用)
        var spans = bandUsed[Math.round(yc)] || [];
        return !spans.some(function (sp) {
          return sp.net !== rec.net && sp.x1 < hi2 - 6 && sp.x2 > lo2 + 6;
        });
      });
      // 优先"源水平短"的带, 其次总行程短
      bands.sort(function (a, b) {
        var ca = Math.abs(a - rec.sy) * 1.5 + Math.abs(a - rec.ty);
        var cb = Math.abs(b - rec.sy) * 1.5 + Math.abs(b - rec.ty);
        return ca - cb;
      });
      for (var bi = 0; bi < bands.length; bi++) {
        var yc = bands[bi];
        var bk = Math.round(yc);
        var spans = bandUsed[bk] || [];
        if (segBlocked(rec.sx, rec.sy, g1, rec.sy, rec.s, rec.t)) continue;
        if (segBlocked(g1, rec.sy, g1, yc, rec.s, rec.t)) continue;
        if (segBlockedClr(g1, yc, g2, yc, rec.s, rec.t, BAND_CLR)) continue;
        if (segBlocked(g2, yc, g2, rec.ty, rec.s, rec.t)) continue;
        if (segBlocked(g2, rec.ty, rec.tx, rec.ty, rec.s, rec.t)) continue;
        spans.push({ x1: lo2, x2: hi2, net: rec.net });
        bandUsed[bk] = spans;
        rec.yc = yc;
        rec.seg1 = addSeg(segRun1, rec.net, rec.sy, yc, "x", rec, "L");  // 贴源列: 源水平段极短
        rec.seg2 = addSeg(segRun2, rec.net, yc, rec.ty, "x", rec, "R"); // 贴目标列: 目标水平段极短
        return true;
      }
      return false;
    }

    // 6) 普通边路由: 相邻列 H-V-H; 跨列 power 走空隙带; 后向/同列/控制边简单绕行
    edges.forEach(function (e) {
      if (busEdgeIds[e.id]) return;
      var s = resolveAbs(e.sources && e.sources[0]);
      var t = resolveAbs(e.targets && e.targets[0]);
      if (!s || !t) return;
      var isCtl = e.__edge && e.__edge.type === "control";
      var rec = {
          e: e, s: s, t: t, net: netOf(e),
          sx: s.x + s.w, sy: portY(e, s, "sy"),
          tx: t.x, ty: portY(e, t, "ty")
        };
        var sr = runOf(s), tr = runOf(t);
        if (sr >= 0 && tr === sr + 1) {
          rec.kind = "n";
          // 第一级入边 (源 depth=0): 干线贴源列 (L), 末段水平留宽放 Vin 标签
          var isFirst = (depths[e.__edge && e.__edge.from] || 0) === 0;
          rec.seg = addSeg(sr, rec.net, rec.sy, rec.ty, "n", rec, isFirst ? "L" : "R");
        } else if (sr >= 0 && tr > sr + 1) {
          // 前向跨列: H-V-H-V-H 走中间列水平空隙带
          rec.kind = "x";
          if (!routeExtended(rec, sr, tr - 1, sr + 1, tr - 1)) {
            rec.kind = "b";
            rec.seg = addSeg(tr - 1, rec.net, rec.sy, rec.ty, "n", rec);
          }
        } else if (sr >= 0 && tr >= 0 && tr < sr) {
          // 后向跨列 (PG 等): 同样走水平空隙带, 穿越范围含目标列 (带在目标上方/下方)
          rec.kind = "x";
          if (!routeExtended(rec, sr, tr - 1, tr, sr - 1)) {
            rec.kind = "b";
            rec.seg = addSeg(tr - 1, rec.net, rec.sy, rec.ty, "n", rec);
          }
        } else {
          // 同列边: 绕本列右侧车道 (同列节点垂直堆叠不重叠, 目标水平段不穿兄弟)
          rec.kind = "b";
          rec.seg = addSeg(Math.max(sr, 0), rec.net, rec.sy, rec.ty, "n", rec);
        }
        recs.push(rec);
    });

    // 7) 跨列对偶短接线: 成员输出侧相连 (不建功率边, 视觉上输出合并后一起输出)
    (elkGraph.__pairLinks || []).forEach(function (link) {
      var A = resolveAbs(link.a), B = resolveAbs(link.b);
      if (!A || !B) return;
      var rec = {
        link: link, s: A, t: B, net: "__pairlink_" + link.id,
        sx: A.x + A.w, sy: A.y + A.h / 2,
        tx: B.x + B.w, ty: B.y + B.h / 2     // 终点为 B 右缘 (输出侧)
      };
      var sr = runOf(A), tr = runOf(B);
      var ok = false;
      if (sr >= 0 && tr > sr) {
        rec.kind = "x";
        // 从 A 右缘穿中间列 + B 所在列, 在 B 右侧间隙折回 B 右缘
        ok = routeExtended(rec, sr, tr, sr + 1, tr);
      } else if (sr >= 0 && sr === tr) {
        rec.kind = "b";
        rec.pts = (function () {
          var mx = Math.round(runs[sr].x2 + CLR + 6);
          return [{ x: rec.sx, y: rec.sy }, { x: mx, y: rec.sy },
                  { x: mx, y: rec.ty }, { x: rec.tx, y: rec.ty }];
        })();
        ok = true;
      }
      if (ok) recs.push(rec);
    });

    // 8) 车道分配: 每个间隙内, 车道以间隙中线为中心排开;
    //    同 net 共线 (共享干线), 异网保持 LANE_GAP 最小间距 (过挤时按比例收紧, 最小 6)。
    //    先修正总线干线的 y 范围 (端口分配后目标 y 可能偏移)。
    recs.forEach(function (rec) {
      if (rec.kind !== "bus") return;
      var ys = rec.members.map(function (m) { return portY(m.e, m.t, "ty"); });
      ys.push(rec.sy);
      rec.trunkSeg.y1 = Math.min.apply(null, ys);
      rec.trunkSeg.y2 = Math.max.apply(null, ys);
    });
    Object.keys(zones).forEach(function (zk) {
      var z = zones[zk];
      // 分两侧: L 侧 (贴源列, 跨列边 seg1) 从 x1 往右排; R 侧 (贴目标列, 普通/总线/seg2) 从 x2 往左排。
      // 贴目标列的干线让目标水平分支极短 (跳弧集中在源短接, 每条边最多穿越一次干线区)。
      var byNetL = {}, byNetR = {}, orderL = [], orderR = [];
      z.segs.forEach(function (sg) {
        var m = sg.side === "L" ? byNetL : byNetR;
        var ord = sg.side === "L" ? orderL : orderR;
        if (!m[sg.net]) { m[sg.net] = []; ord.push(sg.net); }
        m[sg.net].push(sg);
      });
      function sortByY(byNet, order) {
        order.sort(function (a, b) {
          function mid(nk) {
            var arr = byNet[nk], sum = 0;
            arr.forEach(function (sg) { sum += (sg.y1 + sg.y2) / 2; });
            return sum / arr.length;
          }
          return mid(a) - mid(b);
        });
      }
      sortByY(byNetL, orderL);
      sortByY(byNetR, orderR);
      var nL = orderL.length, nR = orderR.length;
      if (!nL && !nR) return;
      var avail = z.x2 - z.x1;
      var spacing = Math.min(LANE_GAP, avail / Math.max(1, nL + nR));
      spacing = Math.max(6, spacing);
      orderL.forEach(function (nk, i) {
        var x = Math.min(z.x2, z.x1 + i * spacing);
        byNetL[nk].forEach(function (sg) { sg.x = x; });
      });
      orderR.forEach(function (nk, i) {
        var x = Math.max(z.x1, z.x2 - i * spacing);
        byNetR[nk].forEach(function (sg) { sg.x = x; });
      });
    });

    // 9) 生成 sections: 普通边同 (间隙, net) 合并共享干线 (branchOnly);
    //    跨列边画完整 H-V-H-V-H; 总线首边负责源短接 + 干线
    var trunkGroups = {};
    recs.forEach(function (rec) {
      if (rec.kind !== "n") return;
      var key = rec.net + "@" + Math.round(rec.seg.x);
      (trunkGroups[key] = trunkGroups[key] || []).push(rec);
    });
    Object.keys(trunkGroups).forEach(function (key) {
      var arr = trunkGroups[key];
      var x = arr[0].seg.x;
      var y1 = Infinity, y2 = -Infinity;
      arr.forEach(function (rec) {
        y1 = Math.min(y1, rec.seg.y1);
        y2 = Math.max(y2, rec.seg.y2);
      });
      arr.forEach(function (rec, i) {
        // shared: 是否有 ≥2 条边共享该干线 (决定 T 型结点圆点)
        if (i === 0 && rec.e.__edge) {
          rec.e.__edge.__trunk = { x: x, y1: y1, y2: y2, shared: arr.length > 1 };
        }
        rec.e.sections = [{
          id: rec.e.id + "_sec",
          startPoint: { x: rec.sx, y: rec.sy },
          bendPoints: [{ x: x, y: rec.sy }, { x: x, y: rec.ty }],
          endPoint: { x: rec.tx, y: rec.ty },
          __branchOnly: true
        }];
      });
    });

    recs.forEach(function (rec) {
      if (rec.kind === "x") {
        var pts = [
          { x: rec.sx, y: rec.sy },
          { x: rec.seg1.x, y: rec.sy },
          { x: rec.seg1.x, y: rec.yc },
          { x: rec.seg2.x, y: rec.yc },
          { x: rec.seg2.x, y: rec.ty },
          { x: rec.tx, y: rec.ty }
        ];
        var secx = {
          id: (rec.e ? rec.e.id : "link_" + rec.link.id) + "_sec",
          startPoint: pts[0],
          bendPoints: pts.slice(1, 5),
          endPoint: pts[5]
        };
        if (rec.e) rec.e.sections = [secx];
        else rec.link.sections = [secx];
      } else if (rec.kind === "b") {
        // 兜底路径也逐段过障碍校验 (不改路径, 只检测); 穿障碍时记入 __blocked 便于排查
        var bmx = rec.seg ? rec.seg.x : rec.pts[1].x;
        var bpts = [{ x: rec.sx, y: rec.sy }, { x: bmx, y: rec.sy },
                    { x: bmx, y: rec.ty }, { x: rec.tx, y: rec.ty }];
        for (var bi2 = 0; bi2 < bpts.length - 1; bi2++) {
          if (segBlocked(bpts[bi2].x, bpts[bi2].y, bpts[bi2 + 1].x, bpts[bi2 + 1].y, rec.s, rec.t)) {
            (rec.e ? rec.e.__edge.__blocked = true : 0);
            if (typeof console !== "undefined") {
              console.warn("[PT] 走线兜底未避开障碍:",
                rec.e ? rec.e.id : rec.link.id,
                Math.round(bpts[bi2].x) + "," + Math.round(bpts[bi2].y) + " → " +
                Math.round(bpts[bi2 + 1].x) + "," + Math.round(bpts[bi2 + 1].y));
            }
            break;
          }
        }
        var secb = {
          id: (rec.e ? rec.e.id : "link_" + rec.link.id) + "_sec",
          startPoint: bpts[0],
          bendPoints: [bpts[1], bpts[2]],
          endPoint: bpts[3]
        };
        if (rec.e) rec.e.sections = [secb];
        else rec.link.sections = [secb];
      } else if (rec.kind === "bus") {
        var bx = rec.trunkSeg.x;
        rec.members.forEach(function (m, i) {
          var ty2 = portY(m.e, m.t, "ty");
          // __bus 挂在 Graph 边对象上 —— 渲染器 renderEdge 读它
          m.e.__edge.__bus = {
            busX: bx, busY1: rec.trunkSeg.y1, busY2: rec.trunkSeg.y2,
            sx: rec.sx, sy: rec.sy, first: i === 0
          };
          m.e.sections = [{
            id: m.e.id + "_sec",
            startPoint: { x: bx, y: ty2 },
            bendPoints: [],
            endPoint: { x: m.t.x, y: ty2 }
          }];
        });
      }
    });

    // 10) 跨网交叉检测: 水平线段 × 异网竖直线段严格内交 → 水平侧记跳线点 (__hops)
    //     渲染器据此画跨越弧, 与 T 型结点圆点 (相连) 区分。
    var segs = [];   // 实际绘制的线段 {holder, net, h, x1,x2,y1,y2}
    function pushSeg(holder, net, x1, y1, x2, y2) {
      if (Math.abs(x1 - x2) < 0.5 && Math.abs(y1 - y2) < 0.5) return;
      segs.push({
        holder: holder, net: net, h: Math.abs(y1 - y2) < 0.5,
        x1: Math.min(x1, x2), x2: Math.max(x1, x2),
        y1: Math.min(y1, y2), y2: Math.max(y1, y2)
      });
    }
    recs.forEach(function (rec) {
      var holder = rec.e ? rec.e.__edge : rec.link;
      if (rec.e && rec.e.__edge && rec.e.__edge.type === "control") return;  // 控制虚线不参与跳线
      if (rec.kind === "bus") {
        var bx = rec.trunkSeg.x;
        var first = rec.members[0];
        pushSeg(first.e.__edge, rec.net, rec.sx, rec.sy, bx, rec.sy);               // 源短接
        pushSeg(first.e.__edge, rec.net, bx, rec.trunkSeg.y1, bx, rec.trunkSeg.y2); // 总线干线
        rec.members.forEach(function (m) {
          var ty2 = portY(m.e, m.t, "ty");
          pushSeg(m.e.__edge, rec.net, bx, ty2, m.t.x, ty2);                        // 分支
        });
      } else if (rec.kind === "n") {
        var x = rec.seg.x;
        pushSeg(holder, rec.net, rec.sx, rec.sy, x, rec.sy);   // 源水平分支
        pushSeg(holder, rec.net, x, rec.ty, rec.tx, rec.ty);   // 目标水平分支
      } else if (rec.kind === "x" || rec.kind === "b") {
        var secArr = rec.e ? rec.e.sections : rec.link.sections;
        var s0 = secArr && secArr[0];
        if (!s0) return;
        var pts = [s0.startPoint].concat(s0.bendPoints || []).concat([s0.endPoint]);
        for (var i = 0; i < pts.length - 1; i++) {
          pushSeg(holder, rec.net, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
        }
      }
    });
    // 共享干线 (每个 (间隙, net) 只画一次)
    Object.keys(trunkGroups).forEach(function (key) {
      var arr = trunkGroups[key];
      var x = arr[0].seg.x;
      var y1 = Infinity, y2 = -Infinity;
      arr.forEach(function (rec) {
        y1 = Math.min(y1, rec.seg.y1);
        y2 = Math.max(y2, rec.seg.y2);
      });
      pushSeg(arr[0].e.__edge, arr[0].net, x, y1, x, y2);
    });
    for (var si = 0; si < segs.length; si++) {
      var A = segs[si];
      if (!A.h) continue;
      for (var sj = 0; sj < segs.length; sj++) {
        var B = segs[sj];
        if (B.h || B.net === A.net) continue;
        // 竖线 B 严格穿过水平线 A 内部 (端点 ±2 容差, T 型相接不算跨越)
        if (B.x1 <= A.x1 + 2 || B.x1 >= A.x2 - 2) continue;
        if (A.y1 <= B.y1 + 2 || A.y1 >= B.y2 - 2) continue;
        A.holder.__hops = A.holder.__hops || [];
        var hp = { x: B.x1, y: A.y1 };
        var dup = A.holder.__hops.some(function (q) {
          return Math.abs(q.x - hp.x) < 1 && Math.abs(q.y - hp.y) < 1;
        });
        if (!dup) A.holder.__hops.push(hp);
      }
    }

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

    // power 深度 (按 power 边最长路径, 源=0; 环安全) —— 跨列对偶判定 / 层间距通道数用
    var powerDepth = {};
    (function computePowerDepth() {
      var memo = {};
      var visiting = {};
      function d(nid) {
        if (memo[nid] != null) return memo[nid];
        if (visiting[nid]) return 0;
        visiting[nid] = true;
        var ups = graph.upstreamPowerIds(nid);
        var r = 0;
        ups.forEach(function (u) { r = Math.max(r, d(u) + 1); });
        visiting[nid] = false;
        memo[nid] = r;
        return r;
      }
      graph.nodeList().forEach(function (n) { d(n.id); });
      powerDepth = memo;
    })();

    // 先决定哪些节点被折叠聚合 (只折叠叶子分组: 组内直接有节点;
    // 嵌套分组折叠父级时, 子分组节点被父级摘要吸收, 不再生成子级聚合节点)
    var collapsedSet = {};   // groupId -> collapsedNode
    var nodeToCollapsed = {}; // nodeId -> collapsedGroupId
    Object.keys(collapsedGroups).forEach(function (gid) {
      if (!collapsedGroups[gid]) return;
      if (graph.nodesInGroup(gid).length === 0) return;   // 只折叠叶子分组
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
        if (allGroupIds.indexOf(n.group) < 0) return;
        // 节点所在分组链上有更早的折叠组时跳过, 避免双重聚合
        var anc = n.group;
        while (anc) {
          if (anc !== gid && collapsedSet[anc]) return;
          anc = (graph.groups[anc] && graph.groups[anc].parent) || null;
        }
        nodeToCollapsed[n.id] = gid;
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

    // 对偶组 (pair_groups): 同列 (同 power 深度) 成员聚成一个 pair 单元, 成员仍单独渲染。
    // 跨列对偶 (成员深度不同, 如 BUCK_06 一级 / LDO_06 二级) 不整体聚合 —— 按深度拆成独立列簇,
    // 不显示总标题; 若各簇都有多路直接下游, 布局阶段在簇输出端之间画"合并短接线" (输出合并后一起输出)。
    var pairGroupMap = {};  // nodeId -> pairId
    var pairGroups = {};
    var crossPairs = [];  // [{pg, clusterIds:[subId,...]}]
    (graph.data && graph.data.pair_groups || []).forEach(function (pg) {
      if (!pg || !pg.id || !Array.isArray(pg.members)) return;
      var valid = pg.members.filter(function (mid) {
        return !hiddenNodeIds.has(mid) && !nodeToCollapsed[mid];
      });
      if (valid.length < 2) return;   // 不足 2 个可见成员不聚合
      var byDepth = {};
      valid.forEach(function (mid) {
        var d = powerDepth[mid] || 0;
        (byDepth[d] = byDepth[d] || []).push(mid);
      });
      var dkeys = Object.keys(byDepth);
      if (dkeys.length === 1) {
        pairGroups[pg.id] = { id: pg.id, label: pg.label || pg.id, members: valid };
        valid.forEach(function (mid) { pairGroupMap[mid] = pg.id; });
        return;
      }
      // 跨列: 每列一个独立簇 (无标题, 仅浅框)
      var clusterIds = [];
      dkeys.forEach(function (dk, ci) {
        var subId = pg.id + "#" + ci;
        var mem = byDepth[dk];
        pairGroups[subId] = { id: subId, label: "", members: mem, noTitle: true };
        mem.forEach(function (mid) { pairGroupMap[mid] = subId; });
        clusterIds.push(subId);
      });
      crossPairs.push({ pg: pg, clusterIds: clusterIds });
    });

    // 跨列对偶的"输出合并短接线": 每簇直接下游 (排除同组成员) ≥2 个时, 簇输出端相连
    var pairLinks = [];
    crossPairs.forEach(function (cp) {
      var need = [];
      cp.clusterIds.forEach(function (sid) {
        var mem = pairGroups[sid].members;
        var memSet = {};
        mem.forEach(function (m) { memSet[m] = 1; });
        var downs = {};
        mem.forEach(function (m) {
          graph.powerOutEdges(m).forEach(function (e) {
            if (!memSet[e.to] && !hiddenNodeIds.has(e.to) && !nodeToCollapsed[e.to]) downs[e.to] = 1;
          });
        });
        if (Object.keys(downs).length >= 2) need.push(sid);
      });
      // 成员节点 id (渲染端合并点用)
      for (var li = 0; li + 1 < need.length; li++) {
        pairLinks.push({
          id: cp.pg.id + "_" + li,
          a: "__pair_" + need[li], b: "__pair_" + need[li + 1],
          am: pairGroups[need[li]].members, bm: pairGroups[need[li + 1]].members
        });
      }
    });

    // 节点 → elk 子节点
    var nodeElkMap = {};  // nodeId -> elkNode (成员节点入 pair 容器, 不直接进 group)
    var pairElkMap = {};  // pairId -> pair elk 容器
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

      // 对偶成员 → pair 容器 (pair 容器再进 node 的 group)
      var pid = pairGroupMap[n.id];
      if (pid) {
        if (!pairElkMap[pid]) {
          pairElkMap[pid] = {
            id: "__pair_" + pid,
            layoutOptions: {},
            children: [],
            edges: [],
            labels: [{ text: pairGroups[pid].label }],
            __isPair: true,
            __pairId: pid,
            __noTitle: !!pairGroups[pid].noTitle
          };
        }
        pairElkMap[pid].children.push(elkNode);
        return;
      }

      // 放到对应分组
      if (n.group && groupNodes[n.group]) {
        groupNodes[n.group].children.push(elkNode);
      } else {
        root.children.push(elkNode);
      }
    });

    // 把 pair 容器按"多数成员所属 group"放进对应分组
    Object.keys(pairElkMap).forEach(function (pid) {
      var container = pairElkMap[pid];
      var grpId = null;
      var first = container.children[0] && container.children[0].__node;
      if (first && first.group && groupNodes[first.group]) grpId = first.group;
      if (grpId) groupNodes[grpId].children.push(container);
      else root.children.push(container);
      container.children.forEach(function (m) {
        // 成员节点坐标相对 pair 容器
        nodeElkMap[m.id] = m;
      });
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

    // 边 (折叠重定向后两端相同的组内边 → 跳过, 避免折叠态自环乱线)
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
      if (fromElk.id === toElk.id) return;   // 折叠后两端同一聚合节点: 组内边不画

      root.edges.push({
        id: e.id,
        sources: [fromElk.id],
        targets: [toElk.id],
        __edge: e
      });
    });

    root.__depths = powerDepth;      // 层间距通道数用
    root.__pairLinks = pairLinks;    // 跨列对偶输出合并短接线
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
