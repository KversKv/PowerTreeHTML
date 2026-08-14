/* ============================================================
 * minimap.js — 小地图
 * 显示整图缩略 + 当前视口框
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;
  var SVG_NS = "http://www.w3.org/2000/svg";

  function Minimap(container) {
    this.container = container;
    this.svg = null;
    this.viewBox = null;
    this._build();
  }

  Minimap.prototype._build = function () {
    this.svg = document.createElementNS(SVG_NS, "svg");
    this.svg.setAttribute("class", "pt-minimap-svg");
    this.svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    this.container.appendChild(this.svg);
  };

  /**
   * 更新小地图内容
   * @param {object} bbox { x, y, width, height } 整图包围盒
   * @param {Array} nodes 简化节点 [{x,y,w,h,color}]
   * @param {object} viewport 当前视口 { x,y,w,h }
   */
  Minimap.prototype.update = function (bbox, nodes, viewport) {
    while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);
    if (!bbox || bbox.width <= 0 || bbox.height <= 0) return;

    this.svg.setAttribute("viewBox", bbox.x + " " + bbox.y + " " + bbox.width + " " + bbox.height);

    // 背景
    var bg = document.createElementNS(SVG_NS, "rect");
    bg.setAttribute("x", bbox.x);
    bg.setAttribute("y", bbox.y);
    bg.setAttribute("width", bbox.width);
    bg.setAttribute("height", bbox.height);
    bg.setAttribute("fill", "rgba(200,200,200,0.08)");
    this.svg.appendChild(bg);

    // 节点
    var self = this;
    (nodes || []).forEach(function (n) {
      var r = document.createElementNS(SVG_NS, "rect");
      r.setAttribute("x", n.x);
      r.setAttribute("y", n.y);
      r.setAttribute("width", Math.max(n.w, 2));
      r.setAttribute("height", Math.max(n.h, 2));
      r.setAttribute("fill", n.color || "#90a4ae");
      r.setAttribute("opacity", 0.6);
      self.svg.appendChild(r);
    });

    // 视口框
    if (viewport) {
      var vp = document.createElementNS(SVG_NS, "rect");
      vp.setAttribute("x", viewport.x);
      vp.setAttribute("y", viewport.y);
      vp.setAttribute("width", viewport.w);
      vp.setAttribute("height", viewport.h);
      vp.setAttribute("fill", "none");
      vp.setAttribute("stroke", "#1e88e5");
      vp.setAttribute("stroke-width", Math.max(bbox.width, bbox.height) / 200);
      vp.setAttribute("stroke-dasharray", "4,3");
      this.svg.appendChild(vp);
    }
  };

  PT.Minimap = Minimap;
})();
