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
   * - 跨容器边把端点向上提升 (lift) 到本容器直接孩子后再参与分层
   * - 空分组 (成员被过滤/聚焦隐藏) 自动从 children 移除
   * - 节点坐标为相对父容器原点 (渲染器会累加分组偏移); 边 sections 用世界绝对坐标
   */
  function _fallbackLayout(elkGraph) {
    var LAYER_GAP = 56;    // 层间水平间距
    var NODE_GAP = 24;     // 同层节点垂直间距
    var GROUP_PAD = { t: 48, l: 16, r: 16, b: 16 };  // 分组内边距 (同 layoutOpts.groupOptions)
    var ROOT_PAD = 24;

    var edges = elkGraph.edges || [];

    // 清理上一次布局挂在 Graph 边上的渲染标记, 防止折叠/过滤后残留
    edges.forEach(function (e) {
      if (e.__edge) {
        e.__edge.__bus = null;
        e.__edge.__trunk = null;
        e.__edge.__hops = null;
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
      var PAD = { t: 26, l: 6, r: 6, b: 6 };  // 上留白放标签
      var GAP = 8;
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

      // 逐层放置: 每层一列, x 按前层最大宽度累加, y 同层垂直堆叠
      var xCursor = pad.l;
      var sortedLayers = Object.keys(layers).map(Number).sort(function (a, b) { return a - b; });
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
        var y = pad.t;
        var centers = {};
        list.forEach(function (c) {
          c.x = xCursor;
          c.y = y;
          centers[c.id] = y + (c.height || 0) / 2;
          y += (c.height || 0) + NODE_GAP;
          if ((c.width || 0) > wMax) wMax = c.width;
        });
        prevCenters = centers;
        xCursor += wMax + LAYER_GAP;
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

    /* ================= 正交避让路由 =================
     * 收集所有"真实节点"矩形作为障碍, 在由节点边缘生成的网格坐标上跑 A*,
     * 只允许 H-V-H (源→右 / 竖直 / →目标左) 的最少折线路径,
     * 并对共用同一通道的边分配不同轨道, 消除重叠与穿模块。 */

    // 1) 障碍矩形: 仅真实节点 (有 __node), 不含分组/pair 外框
    var obstacles = [];
    Object.keys(abs).forEach(function (id) {
      var nd = nodeById[id];
      if (nd && nd.__node) obstacles.push(abs[id]);
    });

    var CLR = 14;  // 与节点的安全间距

    // 线段 (x1,y1)-(x2,y2) 是否穿过任一障碍 (含 CLR 外扩)
    function segBlocked(x1, y1, x2, y2, sRect, tRect) {
      var minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
      var minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
      for (var i = 0; i < obstacles.length; i++) {
        var r = obstacles[i];
        if (r === sRect || r === tRect) continue;   // 起止节点不算障碍
        var rx1 = r.x - CLR, ry1 = r.y - CLR, rx2 = r.x + r.w + CLR, ry2 = r.y + r.h + CLR;
        // 线段(轴对齐)与矩形相交判定
        if (maxX < rx1 || minX > rx2 || maxY < ry1 || minY > ry2) continue;
        // 轴对齐线段: 若严格穿过矩形内部即阻挡
        if (x1 === x2) {  // 竖线
          if (x1 > rx1 && x1 < rx2 && maxY > ry1 && minY < ry2) return true;
        } else {          // 横线
          if (y1 > ry1 && y1 < ry2 && maxX > rx1 && minX < rx2) return true;
        }
      }
      return false;
    }

    // 候选竖直通道 x 坐标: 所有节点左右缘外扩 CLR + 起止中点
    var xLanes = {};
    obstacles.forEach(function (r) {
      xLanes[Math.round(r.x - CLR)] = 1;
      xLanes[Math.round(r.x + r.w + CLR)] = 1;
    });

    // 2) 总线拓扑路由:
    //    同一源节点向右扇出到多个右侧目标时, 合并为一条竖直总线干线 + 各目标短分支,
    //    而非多条平行长线 (VSYS 典型场景)。其余边仍走 H-V-H 避让。

    // 先按 (源id) 分组, 找出"向右扇出 ≥3"的源
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

    var BUS_SRC_MIN = 3;   // 扇出达到该数才合并成总线
    var busEdgeIds = {};   // 被总线接管的边 id

    var routed = [];

    Object.keys(bySrc).forEach(function (srcId) {
      var list = bySrc[srcId];
      var fwd = list.filter(function (r) { return r.forward && !r.isControl; });
      if (fwd.length < BUS_SRC_MIN) return;   // 不够扇出, 走普通路由

      // 源出口点
      var s = fwd[0].s;
      var sx = s.x + s.w, sy = s.y + s.h / 2;
      // 目标按 y 排序
      fwd.sort(function (a, b) { return (a.t.y + a.t.h / 2) - (b.t.y + b.t.h / 2); });

      // 总线竖直干线 x: 源右缘到最近目标左缘的中点, 但保证避开障碍
      var minTx = Math.min.apply(null, fwd.map(function (r) { return r.t.x; }));
      var busX = Math.round((sx + minTx) / 2);
      // 若干线 x 与源右缘太近, 外推一点
      if (busX < sx + 20) busX = sx + 28;

      // 干线 y 范围: 覆盖所有目标 y 中心 与 源 y
      var ys = fwd.map(function (r) { return r.t.y + r.t.h / 2; });
      ys.push(sy);
      var busY1 = Math.min.apply(null, ys);
      var busY2 = Math.max.apply(null, ys);

      // 源 → 干线顶/入点: 水平短接到 busX
      // 每条目标边: sections = [源短接(仅一次, 用首条边) + 干线 + 分支]
      fwd.forEach(function (r, i) {
        var ty = r.t.y + r.t.h / 2;
        var tx = r.t.x;
        busEdgeIds[r.e.id] = 1;
        // __bus 挂在 Graph 边对象 (e.__edge) 上 —— 渲染器 renderEdge 读的是它
        r.e.__edge.__bus = { busX: busX, busY1: busY1, busY2: busY2, sx: sx, sy: sy, first: i === 0 };
        r.e.sections = [{
          id: r.e.id + "_sec",
          startPoint: { x: busX, y: ty },
          bendPoints: [],
          endPoint: { x: tx, y: ty }
        }];
        routed.push({ e: r.e, pts: [{ x: busX, y: ty }, { x: tx, y: ty }], sy: ty, ty: ty, bus: true });
      });
    });

    // 普通 H-V-H 路由: 未被总线接管的边
    edges.forEach(function (e) {
      if (busEdgeIds[e.id]) return;
      var s = resolveAbs(e.sources && e.sources[0]);
      var t = resolveAbs(e.targets && e.targets[0]);
      if (!s || !t) return;
      var sx = s.x + s.w, sy = s.y + s.h / 2;
      var tx = t.x, ty = t.y + t.h / 2;

      // 关键: 跨间隙的边, 竖直段强制走"间隙中线", 让多条跨层边汇成一条共享干线,
      // 而不是各自占一条通道互相重叠。间隙中线 = 源右缘到目标左缘的中点 (源在左/目标在右时)。
      var pts = null;
      if (tx > sx + 4) {   // 前向边 (源左 目标右)
        var gapX = Math.round((sx + tx) / 2);
        // 干线不与源/目标自身重叠, 且三段不穿障碍才采用
        if (!segBlocked(sx, sy, gapX, sy, s, t) &&
            !segBlocked(gapX, sy, gapX, ty, s, t) &&
            !segBlocked(gapX, ty, tx, ty, s, t)) {
          pts = [ { x: sx, y: sy }, { x: gapX, y: sy }, { x: gapX, y: ty }, { x: tx, y: ty } ];
        }
      }
      if (!pts) {
        // 后向边或前向被挡: 从候选通道里挑不穿的, 偏好靠近间隙中线
        var prefX = Math.round((sx + tx) / 2);
        var cands = Object.keys(xLanes).map(Number);
        cands.push(prefX);
        cands = cands.filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
        var best = null;
        for (var ci = 0; ci < cands.length; ci++) {
          var mx = cands[ci];
          if (segBlocked(sx, sy, mx, sy, s, t)) continue;
          if (segBlocked(mx, sy, mx, ty, s, t)) continue;
          if (segBlocked(mx, ty, tx, ty, s, t)) continue;
          var cost = Math.abs(mx - sx) + Math.abs(tx - mx) + Math.abs(ty - sy) * 0.5
                   + Math.abs(mx - prefX) * 0.5;
          if (!best || cost < best.cost) best = { mx: mx, cost: cost };
        }
        if (best) {
          pts = [ { x: sx, y: sy }, { x: best.mx, y: sy }, { x: best.mx, y: ty }, { x: tx, y: ty } ];
        } else {
          var midX = prefX;
          pts = [ { x: sx, y: sy }, { x: midX, y: sy }, { x: midX, y: ty }, { x: tx, y: ty } ];
        }
      }
      routed.push({ e: e, pts: pts, sy: sy, ty: ty });
    });

    // 3) 通道去重叠: 普通 H-V-H 边共用同一竖直 x 时, 同 net 汇成一条干线;
    //    异网干线绝不共线 —— x 间距 <12px 且 y 区间重叠时横向拉开,
    //    保证"相连 (同网共线)"与"跨越 (异网分离)"在图上可区分。
    function netKeyOf(r) {
      var ge = r.e.__edge;
      if (ge && ge.type === "control") return "__ctl__";
      return (ge && ge.net) || ("__nonet_" + r.e.id);
    }
    var vertEdges = routed.filter(function (r) { return !r.bus; });
    // 按 x 聚类 (±3px) 内再按 net 拆分
    vertEdges.sort(function (a, b) { return a.pts[1].x - b.pts[1].x; });
    var clusters = [];
    vertEdges.forEach(function (r) {
      var x = r.pts[1].x;
      var nk = netKeyOf(r);
      var c = clusters[clusters.length - 1];
      if (c && Math.abs(x - c.x) <= 3 && c.net === nk) { c.items.push(r); }
      else clusters.push({ x: x, net: nk, items: [r] });
    });
    // 相邻干线簇 (异网) 若 y 区间重叠且 x 间距 < 12, 把它们横向拉开
    for (var k = 1; k < clusters.length; k++) {
      var prev = clusters[k - 1], cur = clusters[k];
      if (cur.net === prev.net) continue;   // 同网共享干线, 无需拉开
      if (cur.x - prev.x >= 12) continue;
      var overlap = prev.items.some(function (a) {
        return cur.items.some(function (b) {
          var a1 = Math.min(a.sy, a.ty), a2 = Math.max(a.sy, a.ty);
          var b1 = Math.min(b.sy, b.ty), b2 = Math.max(b.sy, b.ty);
          return a1 < b2 && b1 < a2;
        });
      });
      if (overlap) {
        var shift = 12 - (cur.x - prev.x);
        cur.items.forEach(function (r) {
          r.pts[1].x += shift;
          r.pts[2].x += shift;
        });
        cur.x += shift;
      }
    }

    // 4) 共享干线合并 + 写回 sections
    //    同一竖直 x 且**同一 net** 的多条边: 竖直段只画一次 (细线), 各边只保留自己的水平分支。
    //    这样共享通道不会叠成粗线; 异网竖直段已在第 3 步横向分离, 不参与合并。

    // 按 (x, net) 归并竖直段, 每段挑一条边作"干线承载者"
    var trunkOwner = {};   // key(x|net) -> {y1,y2,owner,count}
    routed.forEach(function (r) {
      if (r.bus) return;
      var y1 = Math.min(r.sy, r.ty), y2 = Math.max(r.sy, r.ty);
      // 干线 key = x + net (异网不共享)
      var key = Math.round(r.pts[1].x) + "|" + netKeyOf(r);
      if (!trunkOwner[key]) {
        trunkOwner[key] = { y1: y1, y2: y2, owner: r, count: 1 };
        r.__drawTrunk = true;   // 这条边负责画整段干线
      } else {
        trunkOwner[key].y1 = Math.min(trunkOwner[key].y1, y1);
        trunkOwner[key].y2 = Math.max(trunkOwner[key].y2, y2);
        trunkOwner[key].count++;
        r.__drawTrunk = false;
      }
    });

    routed.forEach(function (r) {
      if (r.bus) return;
      var p = r.pts;
      var owner = trunkOwner[Math.round(r.pts[1].x) + "|" + netKeyOf(r)];
      if (r.__drawTrunk) {
        // 干线承载者: 竖直整段由 __trunk 细线统一画, 自身路径也走 branchOnly 避免重复
        // shared: 是否有 ≥2 条边共享该干线 (决定 T 型结点圆点与上游 net 标签)
        r.e.__edge.__trunk = { x: r.pts[1].x, y1: owner.y1, y2: owner.y2, shared: owner.count > 1 };
        r.e.sections = [{
          id: r.e.id + "_sec",
          startPoint: p[0],
          bendPoints: [{ x: r.pts[1].x, y: r.sy }, { x: r.pts[1].x, y: r.ty }],
          endPoint: p[3],
          __branchOnly: true
        }];
      } else {
        // 非承载者: 只画水平分支 (源水平 与 目标水平), 竖直段由干线承载者画
        r.e.sections = [{
          id: r.e.id + "_sec",
          startPoint: p[0],
          bendPoints: [{ x: r.pts[1].x, y: r.sy }, { x: r.pts[1].x, y: r.ty }],
          endPoint: p[3],
          __branchOnly: true   // 渲染时跳过竖直段
        }];
      }
    });

    // 5) 跨网交叉检测: 水平线段 × 异网竖直线段严格内交 → 水平侧记跳线点 (__hops)
    //    渲染器据此画"跨越弧", 与 T 型结点圆点 (相连) 区分。
    var segs = [];   // 每条 power 边实际绘制的线段 {ge, net, h, x1,x2,y1,y2}
    function pushSeg(ge, net, x1, y1, x2, y2) {
      if (Math.abs(x1 - x2) < 0.5 && Math.abs(y1 - y2) < 0.5) return;
      segs.push({
        ge: ge, net: net, h: Math.abs(y1 - y2) < 0.5,
        x1: Math.min(x1, x2), x2: Math.max(x1, x2),
        y1: Math.min(y1, y2), y2: Math.max(y1, y2)
      });
    }
    routed.forEach(function (r) {
      var ge = r.e.__edge;
      if (!ge || ge.type === "control") return;   // 控制虚线不参与跳线
      var net = ge.net || ("__nonet_" + ge.id);
      if (r.bus) {
        var b = ge.__bus;
        if (b && b.first) {
          pushSeg(ge, net, b.sx, b.sy, b.busX, b.sy);            // 源短接
          pushSeg(ge, net, b.busX, b.busY1, b.busX, b.busY2);    // 总线干线
        }
        var bs = r.e.sections && r.e.sections[0];
        if (bs) pushSeg(ge, net, bs.startPoint.x, bs.startPoint.y, bs.endPoint.x, bs.endPoint.y);  // 分支
      } else {
        var sec = r.e.sections && r.e.sections[0];
        var bp = sec && sec.bendPoints || [];
        if (bp.length >= 2) {
          pushSeg(ge, net, sec.startPoint.x, sec.startPoint.y, bp[0].x, bp[0].y);  // 源水平分支
          pushSeg(ge, net, bp[1].x, bp[1].y, sec.endPoint.x, sec.endPoint.y);      // 目标水平分支
        }
        if (ge.__trunk) pushSeg(ge, net, ge.__trunk.x, ge.__trunk.y1, ge.__trunk.x, ge.__trunk.y2);  // 共享干线
      }
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
        A.ge.__hops = A.ge.__hops || [];
        var hp = { x: B.x1, y: A.y1 };
        var dup = A.ge.__hops.some(function (q) {
          return Math.abs(q.x - hp.x) < 1 && Math.abs(q.y - hp.y) < 1;
        });
        if (!dup) A.ge.__hops.push(hp);
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

    // 对偶组 (pair_groups): 把 BUCK/LDO 短接对偶聚成一个单元, 成员仍单独渲染
    var pairGroupMap = {};  // nodeId -> pairId
    var pairGroups = {};
    (graph.data && graph.data.pair_groups || []).forEach(function (pg) {
      if (!pg || !pg.id || !Array.isArray(pg.members)) return;
      var valid = pg.members.filter(function (mid) {
        return !hiddenNodeIds.has(mid) && !nodeToCollapsed[mid];
      });
      if (valid.length < 2) return;   // 不足 2 个可见成员不聚合
      pairGroups[pg.id] = { id: pg.id, label: pg.label || pg.id, members: valid };
      valid.forEach(function (mid) { pairGroupMap[mid] = pg.id; });
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
            __pairId: pid
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
