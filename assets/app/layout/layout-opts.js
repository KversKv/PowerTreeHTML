/* ============================================================
 * layout-opts.js — ELK 布局参数集中管理
 * 左 → 右, 正交走线, BRANDES_KOEPF 节点放置
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;

  /** 根图布局选项 */
  function rootOptions() {
    return {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.cycleBreaking.strategy": "GREEDY",
      "elk.spacing.nodeNode": "24",
      "elk.spacing.edgeNode": "16",
      "elk.spacing.edgeEdge": "10",
      "elk.layered.spacing.nodeNodeBetweenLayers": "56",
      "elk.layered.spacing.edgeNodeBetweenLayers": "18",
      "elk.layered.spacing.edgeEdgeBetweenLayers": "12",
      "elk.spacing.componentComponent": "48",
      "elk.padding": "[top=24,left=24,bottom=24,right=24]",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.separateConnectedComponents": "false",
      "elk.layered.mergeEdges": "false",
      "elk.layered.allowNonFlowPortsToSwitchSides": "true",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES"
    };
  }

  /** 分组 (复合节点) 布局选项 */
  function groupOptions() {
    return {
      "elk.padding": "[top=48,left=16,bottom=16,right=16]",
      "elk.spacing.nodeNode": "20",
      "elk.layered.spacing.nodeNodeBetweenLayers": "48"
    };
  }

  /** 节点尺寸 */
  function nodeSize(node) {
    // 依据类型返回 {width, height}
    switch (node.type) {
      case "source":      return { width: 140, height: 56 };
      // 模块卡片 (BUCK/LDO 系列): 紧凑尺寸 = 原 180x88 的 2/3
      case "buck":        return { width: 120, height: 58 };
      case "boost":       return { width: 120, height: 58 };
      case "buck_boost":  return { width: 120, height: 58 };
      case "ldo":         return { width: 120, height: 58 };
      case "load_switch": return { width: 160, height: 72 };
      case "efuse":       return { width: 150, height: 64 };
      case "ideal_diode": return { width: 150, height: 64 };
      case "divider":     return { width: 130, height: 56 };
      case "level_shifter": return { width: 140, height: 56 };
      case "passive_r":
      case "passive_l":
      case "passive_c":   return { width: 110, height: 44 };
      case "load":        return { width: 180, height: 80 };
      case "domain":      return { width: 200, height: 90 };
      case "virtual":     return { width: 120, height: 40 };
      case "seq_ctrl":    return { width: 140, height: 56 };
      default:            return { width: 140, height: 56 };
    }
  }

  PT.layoutOpts = {
    rootOptions: rootOptions,
    groupOptions: groupOptions,
    nodeSize: nodeSize
  };
})();
