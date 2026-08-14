/* ============================================================
 * view-sequence.js — 视图四: 时序视图
 * 甘特条 + 简化波形 + PG 触发点, 上电 / 下电两组
 * 违例在图上标红
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;
  var SVG_NS = "http://www.w3.org/2000/svg";

  function SequenceView(container) {
    this.container = container;
    this._build();
  }

  SequenceView.prototype._build = function () {
    var self = this;
    this.toolbar = document.createElement("div");
    this.toolbar.className = "pt-seq-toolbar";
    this.toolbar.innerHTML =
      "<button class='pt-btn' data-dir='up'>上电时序</button>" +
      "<button class='pt-btn' data-dir='down'>下电时序</button>" +
      "<span class='pt-seq-hint'>点击甘特条定位节点</span>";
    this.container.appendChild(this.toolbar);

    this.direction = "up";
    var btns = this.toolbar.querySelectorAll(".pt-btn");
    btns.forEach(function (b) {
      b.onclick = function () {
        self.direction = b.getAttribute("data-dir");
        btns.forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        self.refresh();
      };
    });
    btns[0].classList.add("active");

    this.canvasWrap = document.createElement("div");
    this.canvasWrap.className = "pt-seq-canvas";
    this.container.appendChild(this.canvasWrap);
  };

  SequenceView.prototype.refresh = function () {
    var graph = PT.store.graph;
    if (!graph) return;
    var modeId = PT.store.get("mode");
    var seq = this.direction === "up" ?
      PT.sequence.buildPowerUpSequence(graph, modeId) :
      PT.sequence.buildPowerDownSequence(graph, modeId);

    // 违例集合
    var seqIssues = PT.sequence.checkSequence(graph, modeId);
    var violatedIds = new Set(seqIssues.map(function (i) { return i.nodeId; }));

    while (this.canvasWrap.firstChild) this.canvasWrap.removeChild(this.canvasWrap.firstChild);

    if (!seq.length) {
      this.canvasWrap.innerHTML = "<div class='pt-empty'>没有 enable.order 标注的 rail, 请先在数据中补充</div>";
      return;
    }

    var rowH = 32;
    var labelW = 180;
    var chartW = Math.max(600, this.canvasWrap.clientWidth - labelW - 40);
    var maxT = seq[seq.length - 1].end_ms || 1;
    var svgH = seq.length * rowH + 60;

    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", svgH);
    svg.setAttribute("viewBox", "0 0 " + (labelW + chartW) + " " + svgH);

    var self = this;

    // 时间轴
    var axisY = 20;
    var axis = document.createElementNS(SVG_NS, "line");
    axis.setAttribute("x1", labelW);
    axis.setAttribute("y1", axisY);
    axis.setAttribute("x2", labelW + chartW);
    axis.setAttribute("y2", axisY);
    axis.setAttribute("stroke", "#90a4ae");
    svg.appendChild(axis);

    // 时间刻度
    var ticks = 10;
    for (var i = 0; i <= ticks; i++) {
      var t = maxT * i / ticks;
      var x = labelW + chartW * i / ticks;
      var tick = document.createElementNS(SVG_NS, "line");
      tick.setAttribute("x1", x); tick.setAttribute("y1", axisY - 4);
      tick.setAttribute("x2", x); tick.setAttribute("y2", axisY);
      tick.setAttribute("stroke", "#90a4ae");
      svg.appendChild(tick);
      var tl = document.createElementNS(SVG_NS, "text");
      tl.setAttribute("x", x); tl.setAttribute("y", axisY - 8);
      tl.setAttribute("font-size", 9);
      tl.setAttribute("fill", "#607d8b");
      tl.setAttribute("text-anchor", "middle");
      tl.textContent = PT.util.fmt(t) + "ms";
      svg.appendChild(tl);

      // 垂直网格
      var grid = document.createElementNS(SVG_NS, "line");
      grid.setAttribute("x1", x); grid.setAttribute("y1", axisY);
      grid.setAttribute("x2", x); grid.setAttribute("y2", svgH - 20);
      grid.setAttribute("stroke", "#eceff1");
      grid.setAttribute("stroke-dasharray", "2,3");
      svg.appendChild(grid);
    }

    // 每一行
    seq.forEach(function (item, idx) {
      var y = axisY + 20 + idx * rowH;
      var violated = violatedIds.has(item.nodeId);

      // 标签
      var label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("x", 8);
      label.setAttribute("y", y + rowH / 2 + 4);
      label.setAttribute("font-size", 11);
      label.setAttribute("fill", violated ? "#c62828" : "#263238");
      label.setAttribute("font-weight", violated ? "700" : "400");
      label.textContent = (violated ? "⚠ " : "") + "#" + item.order + " " + (item.name || item.nodeId);
      svg.appendChild(label);

      // 甘特条
      var x0 = labelW + (item.start_ms / maxT) * chartW;
      var x1 = labelW + (item.end_ms / maxT) * chartW;
      var barY = y + 6;
      var barH = rowH - 12;

      // delay 段 (浅色)
      if (item.delay_ms > 0) {
        var delayEnd = labelW + ((item.start_ms) / maxT) * chartW;
        var delayStart = labelW + ((item.start_ms - item.delay_ms) / maxT) * chartW;
        var dbar = document.createElementNS(SVG_NS, "rect");
        dbar.setAttribute("x", delayStart);
        dbar.setAttribute("y", barY + barH / 2 - 2);
        dbar.setAttribute("width", Math.max(1, delayEnd - delayStart));
        dbar.setAttribute("height", 4);
        dbar.setAttribute("fill", "#b0bec5");
        svg.appendChild(dbar);
      }

      // ramp 主体
      var rbar = document.createElementNS(SVG_NS, "rect");
      rbar.setAttribute("x", x0);
      rbar.setAttribute("y", barY);
      rbar.setAttribute("width", Math.max(2, x1 - x0));
      rbar.setAttribute("height", barH);
      rbar.setAttribute("fill", violated ? "#ef9a9a" : "#a5d6a7");
      rbar.setAttribute("stroke", violated ? "#c62828" : "#43a047");
      rbar.setAttribute("stroke-width", 1);
      rbar.setAttribute("rx", 2);
      rbar.setAttribute("class", "pt-seq-bar");
      rbar.setAttribute("data-node-id", item.nodeId);
      svg.appendChild(rbar);

      // 简化波形 (斜率示意): 在 ramp 条内画斜线
      if (item.ramp_ms > 0) {
        var wave = document.createElementNS(SVG_NS, "polyline");
        var wy = barY + barH;
        var points = x0 + "," + wy + " " +
                     (x0 + Math.min(x1 - x0, 12)) + "," + barY + " " +
                     x1 + "," + barY;
        wave.setAttribute("points", points);
        wave.setAttribute("fill", "none");
        wave.setAttribute("stroke", violated ? "#b71c1c" : "#1b5e20");
        wave.setAttribute("stroke-width", 1.5);
        svg.appendChild(wave);
      }

      // PG 触发点
      if (item.pg) {
        var pg = document.createElementNS(SVG_NS, "circle");
        pg.setAttribute("cx", x1);
        pg.setAttribute("cy", barY + barH / 2);
        pg.setAttribute("r", 4);
        pg.setAttribute("fill", "#fff");
        pg.setAttribute("stroke", violated ? "#c62828" : "#43a047");
        pg.setAttribute("stroke-width", 2);
        svg.appendChild(pg);
      }

      // order 标记
      var ord = document.createElementNS(SVG_NS, "text");
      ord.setAttribute("x", x0 + 4);
      ord.setAttribute("y", barY + barH / 2 + 3);
      ord.setAttribute("font-size", 9);
      ord.setAttribute("fill", violated ? "#b71c1c" : "#1b5e20");
      ord.setAttribute("font-weight", "700");
      ord.textContent = "#" + item.order;
      svg.appendChild(ord);

      // 点击跳转
      rbar.addEventListener("click", function () {
        PT.store.set({ view: "board", selectedNodeId: item.nodeId, focusNodeId: item.nodeId });
      });
    });

    this.canvasWrap.appendChild(svg);
  };

  SequenceView.prototype.onShow = function () { this.refresh(); };
  SequenceView.prototype.onHide = function () {};

  PT.SequenceView = SequenceView;
})();
