/* ============================================================
 * svg-renderer.js — 主 SVG 渲染器
 * - 分层: 泳道层 / 分组框层 / 边层 / 节点层 / 水印层
 * - 缩放/平移/Fit/框选
 * - 视口裁剪 (LOD) — 节点数超阈值时启用
 * - 小地图联动
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;
  var SVG_NS = "http://www.w3.org/2000/svg";

  var LOD_THRESHOLD = 400;   // 超过则启用 LOD

  function SvgRenderer(container, opts) {
    opts = opts || {};
    this.container = container;
    this.onNodeClick = opts.onNodeClick || function () {};
    this.onNodeDblClick = opts.onNodeDblClick || function () {};
    this.onEdgeClick = opts.onEdgeClick || function () {};
    this.onBackgroundClick = opts.onBackgroundClick || function () {};
    this.onGroupDblClick = opts.onGroupDblClick || function () {};

    this.transform = { x: 0, y: 0, k: 1 };
    this.layoutData = null;   // ELK 布局后的图
    this.graph = null;
    this.ctx = null;          // 渲染上下文
    this._dragState = null;
    this._boxSelectState = null;
    this.selectedNodeIds = new Set();
    this.highlightNodeIds = null;   // null=不高亮; Set=高亮这些
    this.fadedNodeIds = null;
    this.selectedEdgeId = null;        // 选中的边 id
    this.highlightEdgeIds = null;      // Set=高亮这些边 (同 net/signal 追踪)
    this.highlightEdgeNodeIds = null;  // 高亮边两端的节点

    this._build();
    this._bindEvents();
  }

  SvgRenderer.prototype._build = function () {
    var self = this;
    this.svg = document.createElementNS(SVG_NS, "svg");
    this.svg.setAttribute("class", "pt-svg");
    this.svg.setAttribute("width", "100%");
    this.svg.setAttribute("height", "100%");

    // 定义
    var defs = document.createElementNS(SVG_NS, "defs");
    defs.innerHTML =
      '<marker id="pt-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
      '  <path d="M 0 0 L 10 5 L 0 10 z" fill="#546e7a"/>' +
      '</marker>' +
      '<marker id="pt-arrow-hl" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
      '  <path d="M 0 0 L 10 5 L 0 10 z" fill="#ff5722"/>' +
      '</marker>';
    this.svg.appendChild(defs);

    // 主视口 g
    this.viewport = document.createElementNS(SVG_NS, "g");
    this.viewport.setAttribute("class", "pt-viewport");
    this.svg.appendChild(this.viewport);

    // 分层
    this.laneLayer = this._g(this.viewport, "pt-lane-layer");
    this.groupLayer = this._g(this.viewport, "pt-group-layer");
    this.edgeLayer = this._g(this.viewport, "pt-edge-layer");
    this.nodeLayer = this._g(this.viewport, "pt-node-layer");
    this.watermarkLayer = this._g(this.viewport, "pt-watermark-layer");

    // 框选矩形
    this.selectRect = document.createElementNS(SVG_NS, "rect");
    this.selectRect.setAttribute("class", "pt-select-rect");
    this.selectRect.setAttribute("fill", "rgba(30,136,229,0.1)");
    this.selectRect.setAttribute("stroke", "#1e88e5");
    this.selectRect.setAttribute("stroke-dasharray", "4,3");
    this.selectRect.style.display = "none";
    this.svg.appendChild(this.selectRect);

    this.container.appendChild(this.svg);

    // 小地图容器
    this.minimapContainer = document.createElement("div");
    this.minimapContainer.className = "pt-minimap";
    this.container.appendChild(this.minimapContainer);
    this.minimap = new PT.Minimap(this.minimapContainer);
  };

  SvgRenderer.prototype._g = function (parent, cls) {
    var g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", cls);
    parent.appendChild(g);
    return g;
  };

  SvgRenderer.prototype._bindEvents = function () {
    var self = this;

    // 滚轮缩放
    this.svg.addEventListener("wheel", function (ev) {
      ev.preventDefault();
      var factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
      var pt = self._svgPoint(ev.clientX, ev.clientY);
      self._zoomAt(pt, factor);
    }, { passive: false });

    // 平移 (中键 / 右键 / 空格 + 左键 / 直接左键拖背景)
    this.svg.addEventListener("mousedown", function (ev) {
      var isBg = ev.target === self.svg || ev.target === self.viewport;
      if (ev.button === 1 || (ev.button === 0 && isBg && !ev.shiftKey)) {
        self._dragState = { x: ev.clientX, y: ev.clientY, tx: self.transform.x, ty: self.transform.y };
        ev.preventDefault();
      } else if (ev.button === 0 && isBg && ev.shiftKey) {
        // 框选
        var pt = self._svgPointRaw(ev.clientX, ev.clientY);
        self._boxSelectState = { x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y };
        self.selectRect.style.display = "block";
        self.selectRect.setAttribute("x", pt.x);
        self.selectRect.setAttribute("y", pt.y);
        self.selectRect.setAttribute("width", 0);
        self.selectRect.setAttribute("height", 0);
        ev.preventDefault();
      }
    });

    window.addEventListener("mousemove", function (ev) {
      if (self._dragState) {
        var dx = ev.clientX - self._dragState.x;
        var dy = ev.clientY - self._dragState.y;
        self.transform.x = self._dragState.tx + dx;
        self.transform.y = self._dragState.ty + dy;
        self._applyTransform();
      }
      if (self._boxSelectState) {
        var pt = self._svgPointRaw(ev.clientX, ev.clientY);
        var s = self._boxSelectState;
        s.x1 = pt.x; s.y1 = pt.y;
        var x = Math.min(s.x0, s.x1), y = Math.min(s.y0, s.y1);
        var w = Math.abs(s.x1 - s.x0), h = Math.abs(s.y1 - s.y0);
        self.selectRect.setAttribute("x", x);
        self.selectRect.setAttribute("y", y);
        self.selectRect.setAttribute("width", w);
        self.selectRect.setAttribute("height", h);
      }
    });

    window.addEventListener("mouseup", function (ev) {
      if (self._dragState) {
        self._dragState = null;
      }
      if (self._boxSelectState) {
        var s = self._boxSelectState;
        self._boxSelectState = null;
        self.selectRect.style.display = "none";
        // 转世界坐标
        var w0 = self._screenToWorld(s.x0, s.y0);
        var w1 = self._screenToWorld(s.x1, s.y1);
        var x = Math.min(w0.x, w1.x), y = Math.min(w0.y, w1.y);
        var w = Math.abs(w1.x - w0.x), h = Math.abs(w1.y - w0.y);
        self._selectInRect(x, y, w, h, ev.ctrlKey || ev.metaKey);
      }
    });

    // 边点击 (事件委托: 主线/干线/命中区/标签/结点/跳线都带 data-edge-id)
    this.edgeLayer.addEventListener("click", function (ev) {
      var t = ev.target;
      while (t && t !== self.edgeLayer) {
        if (t.getAttribute) {
          var eid = t.getAttribute("data-edge-id");
          if (eid) {
            ev.stopPropagation();
            self.onEdgeClick(eid, ev);
            return;
          }
        }
        t = t.parentNode;
      }
    });

    // 背景点击
    this.svg.addEventListener("click", function (ev) {
      if (ev.target === self.svg || ev.target === self.viewport) {
        // 清边选中 (视图回调会触发重绘)
        self.selectedEdgeId = null;
        self.highlightEdgeIds = null;
        self.highlightEdgeNodeIds = null;
        self.onBackgroundClick();
      }
    });
  };

  SvgRenderer.prototype._svgPointRaw = function (cx, cy) {
    var rect = this.svg.getBoundingClientRect();
    return { x: cx - rect.left, y: cy - rect.top };
  };

  SvgRenderer.prototype._svgPoint = function (cx, cy) {
    var p = this._svgPointRaw(cx, cy);
    // 转世界坐标
    return {
      x: (p.x - this.transform.x) / this.transform.k,
      y: (p.y - this.transform.y) / this.transform.k
    };
  };

  SvgRenderer.prototype._screenToWorld = function (sx, sy) {
    return {
      x: (sx - this.transform.x) / this.transform.k,
      y: (sy - this.transform.y) / this.transform.k
    };
  };

  SvgRenderer.prototype._zoomAt = function (worldPt, factor) {
    var k0 = this.transform.k;
    var k1 = Math.max(0.05, Math.min(8, k0 * factor));
    if (k1 === k0) return;
    // 保持 worldPt 在屏幕上的位置
    var t = this.transform;
    t.x = t.x - (worldPt.x * (k1 - k0));
    t.y = t.y - (worldPt.y * (k1 - k0));
    t.k = k1;
    this._applyTransform();
  };

  SvgRenderer.prototype._applyTransform = function () {
    var t = this.transform;
    this.viewport.setAttribute("transform",
      "translate(" + t.x + "," + t.y + ") scale(" + t.k + ")");
    this._updateMinimap();
  };

  /** 适应整图 */
  SvgRenderer.prototype.fit = function () {
    if (!this.layoutData) return;
    var bbox = this._computeBBox();
    if (!bbox) return;
    var rect = this.svg.getBoundingClientRect();
    var pad = 40;
    var w = bbox.width + pad * 2;
    var h = bbox.height + pad * 2;
    var k = Math.min(rect.width / w, rect.height / h);
    k = Math.max(0.05, Math.min(2, k));
    this.transform.k = k;
    this.transform.x = (rect.width - w * k) / 2 - bbox.x * k + pad * k;
    this.transform.y = (rect.height - h * k) / 2 - bbox.y * k + pad * k;
    this._applyTransform();
  };

  SvgRenderer.prototype._computeBBox = function () {
    if (!this.layoutData) return null;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    function walk(n, ox, oy) {
      var x = (n.x || 0) + ox, y = (n.y || 0) + oy;
      var w = n.width || 0, h = n.height || 0;
      if (!n.__isGroup) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x + w > maxX) maxX = x + w;
        if (y + h > maxY) maxY = y + h;
      }
      (n.children || []).forEach(function (c) { walk(c, x, y); });
    }
    walk(this.layoutData, 0, 0);
    if (minX === Infinity) return null;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  };

  SvgRenderer.prototype._selectInRect = function (x, y, w, h, append) {
    if (!append) this.selectedNodeIds.clear();
    var self = this;
    if (!this.layoutData) return;
    function walk(n, ox, oy) {
      var nx = (n.x || 0) + ox, ny = (n.y || 0) + oy;
      var nw = n.width || 0, nh = n.height || 0;
      if (!n.__isGroup && nw > 0) {
        if (nx < x + w && nx + nw > x && ny < y + h && ny + nh > y) {
          self.selectedNodeIds.add(n.id);
        }
      }
      (n.children || []).forEach(function (c) { walk(c, nx, ny); });
    }
    walk(this.layoutData, 0, 0);
    this._refreshSelection();
    PT.emit("selection:changed", { ids: Array.from(this.selectedNodeIds) });
  };

  SvgRenderer.prototype._refreshSelection = function () {
    var self = this;
    var nodes = this.nodeLayer.querySelectorAll(".pt-node");
    nodes.forEach(function (el) {
      var id = el.getAttribute("data-node-id");
      if (self.selectedNodeIds.has(id)) el.classList.add("pt-selected");
      else el.classList.remove("pt-selected");
    });
  };

  /**
   * 渲染整图
   * @param {PT.Graph} graph
   * @param {object} layoutData  ELK 布局后的图
   * @param {object} ctx { modeId, colorBy, issuesFor, showControlEdges, showSwimlane, showInlinePassive, hiddenNodeIds }
   */
  SvgRenderer.prototype.render = function (graph, layoutData, ctx) {
    this.graph = graph;
    this.layoutData = layoutData;
    this.ctx = ctx || {};

    // 清空层
    [this.laneLayer, this.groupLayer, this.edgeLayer, this.nodeLayer].forEach(function (l) {
      while (l.firstChild) l.removeChild(l.firstChild);
    });

    var self = this;
    var nodeCount = 0;
    var flatNodes = [];

    // 递归渲染分组
    function renderGroup(elkGroup, ox, oy) {
      var gx = (elkGroup.x || 0) + ox;
      var gy = (elkGroup.y || 0) + oy;

      if (elkGroup.__isGroup) {
        var g = document.createElementNS(SVG_NS, "g");
        g.setAttribute("transform", "translate(" + gx + "," + gy + ")");
        g.setAttribute("class", "pt-group");
        g.setAttribute("data-group-id", elkGroup.__groupId);
        PT.nodeShapes.renderGroupBox(g, elkGroup, self.ctx);
        // 双击折叠
        g.addEventListener("dblclick", function (ev) {
          ev.stopPropagation();
          self.onGroupDblClick(elkGroup.__groupId);
        });
        self.groupLayer.appendChild(g);
      }

      (elkGroup.children || []).forEach(function (child) {
        if (child.__isGroup) {
          renderGroup(child, gx, gy);
        } else if (child.__isPair) {
          renderPair(child, gx, gy);
        } else if (child.__collapsed) {
          renderCollapsed(child, gx, gy);
        } else if (child.__node) {
          renderNode(child, gx, gy);
        }
      });
    }

    // 对偶组容器: 浅外框 + 标签 + 成员 (坐标相对 pair 容器)
    function renderPair(elkPair, ox, oy) {
      var px = (elkPair.x || 0) + ox;
      var py = (elkPair.y || 0) + oy;
      var g = document.createElementNS(SVG_NS, "g");
      g.setAttribute("transform", "translate(" + px + "," + py + ")");
      g.setAttribute("class", "pt-pair");
      g.setAttribute("data-pair-id", elkPair.__pairId);
      PT.nodeShapes.renderPairBox(g, elkPair, self.ctx);
      self.groupLayer.appendChild(g);
      (elkPair.children || []).forEach(function (m) {
        if (m.__node) renderNode(m, px, py);
      });
    }

    function renderNode(elkNode, ox, oy) {
      var nx = (elkNode.x || 0) + ox;
      var ny = (elkNode.y || 0) + oy;
      var g = document.createElementNS(SVG_NS, "g");
      g.setAttribute("transform", "translate(" + nx + "," + ny + ")");
      g.setAttribute("class", "pt-node");
      g.setAttribute("data-node-id", elkNode.id);

      // 淡化
      if (self.fadedNodeIds && self.fadedNodeIds.has(elkNode.id)) {
        g.setAttribute("opacity", 0.15);
      }
      if (self.highlightNodeIds && !self.highlightNodeIds.has(elkNode.id)) {
        g.setAttribute("opacity", 0.25);
      }
      // 边选中高亮时, 不在高亮网络上的节点淡化
      if (self.highlightEdgeNodeIds && !self.highlightEdgeNodeIds.has(elkNode.id)) {
        g.setAttribute("opacity", 0.25);
      }

      // 把 layout 尺寸回写到节点 (renderNode 内部读 node.width/height)
      elkNode.__node.width = elkNode.width;
      elkNode.__node.height = elkNode.height;

      PT.nodeShapes.renderNode(g, elkNode.__node, self.ctx);
      g.addEventListener("click", function (ev) {
        ev.stopPropagation();
        // 点节点时清边选中 (后续回调会触发重绘)
        self.selectedEdgeId = null;
        self.highlightEdgeIds = null;
        self.highlightEdgeNodeIds = null;
        self.onNodeClick(elkNode.id, ev);
      });
      g.addEventListener("dblclick", function (ev) {
        ev.stopPropagation();
        self.onNodeDblClick(elkNode.id, ev);
      });
      self.nodeLayer.appendChild(g);
      nodeCount++;
      flatNodes.push({ id: elkNode.id, x: nx, y: ny, w: elkNode.width, h: elkNode.height });
    }

    function renderCollapsed(elkNode, ox, oy) {
      var nx = (elkNode.x || 0) + ox;
      var ny = (elkNode.y || 0) + oy;
      var g = document.createElementNS(SVG_NS, "g");
      g.setAttribute("transform", "translate(" + nx + "," + ny + ")");
      g.setAttribute("class", "pt-node pt-collapsed");
      g.setAttribute("data-node-id", elkNode.id);
      PT.nodeShapes.renderCollapsedGroup(g, elkNode.__collapsed, self.ctx);
      g.addEventListener("dblclick", function (ev) {
        ev.stopPropagation();
        // 双击展开
        self.onGroupDblClick(elkNode.__collapsed.groupId);
      });
      self.nodeLayer.appendChild(g);
      nodeCount++;
      flatNodes.push({ id: elkNode.id, x: nx, y: ny, w: elkNode.width, h: elkNode.height });
    }

    renderGroup(layoutData, 0, 0);

    // 边视觉状态: 边选中 (同 net/signal 追踪) 优先, 其次节点路径高亮
    function edgeState(edge) {
      var faded = false, highlight = false;
      if (self.highlightEdgeIds) {
        highlight = self.highlightEdgeIds.has(edge.id);
        faded = !highlight;
      } else if (self.highlightNodeIds) {
        var fromIn = self.highlightNodeIds.has(edge.from);
        var toIn = self.highlightNodeIds.has(edge.to);
        faded = !(fromIn && toIn);
        highlight = fromIn && toIn && (self.selectedNodeIds.has(edge.from) || self.selectedNodeIds.has(edge.to));
      }
      return { faded: faded, highlight: highlight };
    }

    // 渲染边 (点击走 edgeLayer 事件委托, 见 _bindEvents)
    (layoutData.edges || []).forEach(function (elkEdge) {
      var edge = elkEdge.__edge;
      if (!edge) return;
      var st = edgeState(edge);
      var hit = PT.edgeRouter.renderEdge(self.edgeLayer, edge, elkEdge.sections, {
        showLabel: true,
        currentMa: edge.__calc && edge.__calc.i_ma,
        modeId: self.ctx.modeId,
        faded: st.faded,
        highlight: st.highlight
      });
      if (hit) {
        // hover tooltip (返回的是加宽透明命中区)
        hit.addEventListener("mouseenter", function (ev) {
          self._showEdgeTooltip(edge, ev);
        });
        hit.addEventListener("mouseleave", function () {
          self._hideEdgeTooltip();
        });
      }
    });

    // 第二遍: 结点圆点 (相连) 与 跨越弧 (不相连), 压在所有边线之上
    (layoutData.edges || []).forEach(function (elkEdge) {
      var edge = elkEdge.__edge;
      if (!edge) return;
      var st = edgeState(edge);
      PT.edgeRouter.renderEdgeDecor(self.edgeLayer, edge, elkEdge.sections, {
        currentMa: edge.__calc && edge.__calc.i_ma,
        modeId: self.ctx.modeId,
        faded: st.faded,
        highlight: st.highlight
      });
    });

    // 跨列对偶"输出合并短接线" (不建功率边, 仅视觉连接; 边选中高亮时淡化)
    if (layoutData.__pairLinks && layoutData.__pairLinks.length) {
      var posMap = {};
      flatNodes.forEach(function (n) { posMap[n.id] = n; });
      layoutData.__pairLinks.forEach(function (link) {
        if (self.highlightEdgeIds) {
          // 高亮模式下对偶合并线淡出, 不干扰追踪
          var lg = document.createElementNS(SVG_NS, "g");
          lg.setAttribute("opacity", 0.15);
          self.edgeLayer.appendChild(lg);
          PT.edgeRouter.renderPairLink(lg, link, {
            posOf: function (nid) { return posMap[nid]; }
          });
        } else {
          PT.edgeRouter.renderPairLink(self.edgeLayer, link, {
            posOf: function (nid) { return posMap[nid]; }
          });
        }
      });
    }

    // 泳道
    if (this.ctx.showSwimlane) {
      var laneNodes = flatNodes.map(function (n) {
        var origNode = graph.node(n.id);
        return {
          id: n.id, x: n.x, y: n.y, width: n.w, height: n.h,
          vout: origNode ? PT.engine.nodeVout(origNode, self.ctx.modeId) : null
        };
      });
      var lanes = PT.swimlane.computeLanes(laneNodes);
      var bbox = this._computeBBox();
      if (bbox) {
        lanes.forEach(function (lane) {
          var r = document.createElementNS(SVG_NS, "rect");
          r.setAttribute("x", bbox.x - 20);
          r.setAttribute("y", lane.y);
          r.setAttribute("width", bbox.width + 40);
          r.setAttribute("height", lane.height);
          r.setAttribute("fill", lane.color);
          r.setAttribute("stroke", "none");
          self.laneLayer.appendChild(r);
          var t = document.createElementNS(SVG_NS, "text");
          t.setAttribute("x", bbox.x - 25);
          t.setAttribute("y", lane.y + lane.height / 2);
          t.setAttribute("font-size", 11);
          t.setAttribute("fill", "#78909c");
          t.setAttribute("text-anchor", "end");
          t.setAttribute("transform", "rotate(-90 " + (bbox.x - 25) + " " + (lane.y + lane.height / 2) + ")");
          t.textContent = lane.label;
          self.laneLayer.appendChild(t);
        });
      }
    }

    // 水印
    this._renderWatermark();

    // 小地图
    this._updateMinimap();

    // 应用选中态
    this._refreshSelection();
  };

  SvgRenderer.prototype._renderWatermark = function () {
    var layer = this.watermarkLayer;
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    var cfg = PT.store.config || {};
    var wm = (cfg.watermark && cfg.watermark.text) || "";
    if (!wm || (cfg.watermark && cfg.watermark.enabled === false)) return;
    var meta = PT.store.rawData && PT.store.rawData.meta || {};
    var text = wm.replace("{project}", meta.project || "").replace("{version}", meta.version || "");
    if (!text.trim()) return;

    var bbox = this._computeBBox();
    if (!bbox) return;

    // 斜向平铺
    var step = 220;
    for (var x = bbox.x - 100; x < bbox.x + bbox.width + 100; x += step) {
      for (var y = bbox.y - 100; y < bbox.y + bbox.height + 100; y += step) {
        var t = document.createElementNS(SVG_NS, "text");
        t.setAttribute("x", x);
        t.setAttribute("y", y);
        t.setAttribute("font-size", 14);
        t.setAttribute("fill", "rgba(120,120,120,0.08)");
        t.setAttribute("transform", "rotate(-30 " + x + " " + y + ")");
        t.setAttribute("class", "pt-watermark");
        t.textContent = text;
        layer.appendChild(t);
      }
    }
  };

  SvgRenderer.prototype._updateMinimap = function () {
    if (!this.minimap) return;
    var bbox = this._computeBBox();
    if (!bbox) return;
    var rect = this.svg.getBoundingClientRect();
    var t = this.transform;
    var vp = {
      x: -t.x / t.k,
      y: -t.y / t.k,
      w: rect.width / t.k,
      h: rect.height / t.k
    };
    var nodes = [];
    if (this.layoutData) {
      function walk(n, ox, oy) {
        var x = (n.x || 0) + ox, y = (n.y || 0) + oy;
        if (!n.__isGroup && n.width) {
          nodes.push({ x: x, y: y, w: n.width, h: n.height });
        }
        (n.children || []).forEach(function (c) { walk(c, x, y); });
      }
      walk(this.layoutData, 0, 0);
    }
    this.minimap.update(bbox, nodes, vp);
  };

  SvgRenderer.prototype._showEdgeTooltip = function (edge, ev) {
    this._hideEdgeTooltip();
    var tip = document.createElement("div");
    tip.className = "pt-tooltip";
    var i = (edge.__calc && edge.__calc.i_ma) || 0;
    var vdrop = (edge.__calc && edge.__calc.vdrop_v) || 0;
    var r = (edge.__calc && edge.__calc.r_mohm) || 0;
    tip.innerHTML =
      "<b>" + PT.util.esc(edge.net || edge.id) + "</b><br>" +
      "I = " + PT.util.fmt(i) + " mA<br>" +
      "R = " + PT.util.fmt(r) + " mΩ<br>" +
      "Vdrop = " + PT.util.fmt(vdrop * 1000) + " mV";
    tip.style.left = (ev.clientX + 12) + "px";
    tip.style.top = (ev.clientY + 12) + "px";
    document.body.appendChild(tip);
    this._tooltip = tip;
  };

  SvgRenderer.prototype._hideEdgeTooltip = function () {
    if (this._tooltip) {
      document.body.removeChild(this._tooltip);
      this._tooltip = null;
    }
  };

  /**
   * 高亮某节点的上下游子图
   * @param {string|null} nodeId
   * @param {boolean} defer  true=只设置状态不重绘 (调用方随后自行 render)
   */
  SvgRenderer.prototype.highlightPath = function (nodeId, defer) {
    if (!this.graph) return;
    // 与边选中互斥
    this.selectedEdgeId = null;
    this.highlightEdgeIds = null;
    this.highlightEdgeNodeIds = null;
    if (!nodeId) {
      this.highlightNodeIds = null;
    } else {
      var ups = this.graph.powerAncestors(nodeId);
      var downs = this.graph.powerSubtree(nodeId);
      var set = new Set(ups.concat(downs));
      this.highlightNodeIds = set;
    }
    // 立即重绘应用高亮
    if (!defer && this.layoutData) this.render(this.graph, this.layoutData, this.ctx);
  };

  /**
   * 选中/高亮一条边: 同 net 的 power 边 (或同 signal 的 control 边) 一起高亮,
   * 其余边与无关节点淡化; 再点同一条边或传 null 取消。
   */
  SvgRenderer.prototype.selectEdge = function (edgeId) {
    if (edgeId && this.selectedEdgeId === edgeId) edgeId = null;   // 再点取消
    this.selectedEdgeId = edgeId || null;
    this.highlightEdgeIds = null;
    this.highlightEdgeNodeIds = null;
    if (edgeId && this.graph) {
      var hit = null;
      this.graph.edges.forEach(function (e) { if (e.id === edgeId) hit = e; });
      if (hit) {
        var isCtl = hit.type === "control";
        var set = new Set();
        var nodes = new Set();
        this.graph.edges.forEach(function (e) {
          var match = isCtl
            ? (e.type === "control" && (hit.signal ? e.signal === hit.signal : e.id === hit.id))
            : (e.type !== "control" && (hit.net ? e.net === hit.net : e.id === hit.id));
          if (match) { set.add(e.id); nodes.add(e.from); nodes.add(e.to); }
        });
        this.highlightEdgeIds = set;
        this.highlightEdgeNodeIds = nodes;
        this.highlightNodeIds = null;   // 与节点路径高亮互斥
      }
    }
    if (this.layoutData && this.graph) this.render(this.graph, this.layoutData, this.ctx);
  };

  /** 仅看子树 */
  SvgRenderer.prototype.focusSubtree = function (nodeId, hops) {
    if (!this.graph) return null;
    return this.graph.neighborhood(nodeId, hops || 2);
  };

  PT.SvgRenderer = SvgRenderer;
})();
