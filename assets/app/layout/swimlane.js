/* ============================================================
 * swimlane.js — 泳道 (按电压分层), 可选开关, 默认关闭
 * 泳道是装饰层: 不改布局, 只在 SVG 上叠加半透明色带
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;

  /**
   * 把节点按 vout 分到电压层
   * 分档: <=0.9 / 0.9~1.35 / 1.35~1.95 / 1.95~2.7 / 2.7~3.6 / >3.6
   */
  function laneOf(vout) {
    if (vout == null) return 0;
    if (vout <= 0.9) return 1;
    if (vout <= 1.35) return 2;
    if (vout <= 1.95) return 3;
    if (vout <= 2.7) return 4;
    if (vout <= 3.6) return 5;
    return 6;
  }

  var LANE_LABELS = [
    "未知", "≤0.9V", "0.9~1.35V", "1.35~1.95V", "1.95~2.7V", "2.7~3.6V", ">3.6V"
  ];

  var LANE_COLORS = [
    "rgba(160,160,160,0.06)",
    "rgba(66,133,244,0.08)",
    "rgba(52,168,83,0.08)",
    "rgba(251,188,4,0.08)",
    "rgba(255,112,67,0.08)",
    "rgba(156,39,176,0.08)",
    "rgba(233,30,99,0.08)"
  ];

  /**
   * 计算泳道矩形 (基于已布局的节点坐标)
   * @param {Array} laidOutNodes [{id,x,y,width,height,vout}]
   * @returns {Array} [{lane, label, color, y, height}]
   */
  function computeLanes(laidOutNodes) {
    var byLane = {};
    laidOutNodes.forEach(function (n) {
      var lane = laneOf(n.vout);
      if (!byLane[lane]) byLane[lane] = { minY: Infinity, maxY: -Infinity };
      if (n.y < byLane[lane].minY) byLane[lane].minY = n.y;
      if (n.y + n.height > byLane[lane].maxY) byLane[lane].maxY = n.y + n.height;
    });
    var lanes = [];
    Object.keys(byLane).forEach(function (k) {
      var lane = parseInt(k, 10);
      lanes.push({
        lane: lane,
        label: LANE_LABELS[lane] || ("L" + lane),
        color: LANE_COLORS[lane] || LANE_COLORS[0],
        y: byLane[lane].minY - 8,
        height: byLane[lane].maxY - byLane[lane].minY + 16
      });
    });
    lanes.sort(function (a, b) { return a.lane - b.lane; });
    return lanes;
  }

  PT.swimlane = {
    laneOf: laneOf,
    LANE_LABELS: LANE_LABELS,
    LANE_COLORS: LANE_COLORS,
    computeLanes: computeLanes
  };
})();
