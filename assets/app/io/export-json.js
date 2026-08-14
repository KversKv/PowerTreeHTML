/* ============================================================
 * export-json.js — Author 模式导出
 * 规范化格式化输出 power_tree.data.js 与 .json
 * 字段顺序稳定, 缩进稳定, 数值精度稳定, 便于 git 提交
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;

  // 字段顺序定义 (保证 git diff 逐行可读)
  var META_ORDER = ["schema_version", "project", "version", "date", "author", "commit", "changelog"];
  var NODE_ORDER = [
    "id", "type", "name", "group", "part", "refdes", "sheet", "domain",
    "vin_range", "vout", "vout_range", "vout_tol_pct", "voltage", "vtol_pct",
    "dvfs", "imax", "iq_ua", "efficiency", "eff_ref",
    "dropout_mv", "rds_on_mohm", "dcr_mohm", "r_mohm", "l_uh", "isat",
    "c_uf", "esr_mohm", "volt_rating", "power_mw", "tol_pct", "vf_mv",
    "soft_start_ms", "theta_ja", "sense", "parallel_group", "cascade",
    "enable", "on_in_modes", "always_on", "retention",
    "iso_signal", "reset_signal", "current",
    "tags", "note", "ratio", "ratio_str", "side"
  ];
  var EDGE_ORDER = ["id", "from", "to", "type", "sub", "net", "signal", "trace_r_mohm", "inline"];
  var GROUP_ORDER = ["id", "name_zh", "name_en", "kind", "parent", "side"];
  var MODE_ORDER = ["id", "name_zh", "name_en", "default"];

  function _orderKeys(obj, order) {
    var keys = [];
    order.forEach(function (k) {
      if (obj.hasOwnProperty(k)) keys.push(k);
    });
    Object.keys(obj).forEach(function (k) {
      if (keys.indexOf(k) < 0) keys.push(k);
    });
    return keys;
  }

  function _formatValue(v, indent) {
    var pad = new Array(indent + 1).join("  ");
    var pad2 = new Array(indent + 2).join("  ");
    if (v === null) return "null";
    if (typeof v === "number") {
      // 数值精度: 保留有效位, 去尾零
      if (Number.isInteger(v)) return String(v);
      var s = v.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
      return s;
    }
    if (typeof v === "string") return JSON.stringify(v);
    if (typeof v === "boolean") return v ? "true" : "false";
    if (Array.isArray(v)) {
      if (!v.length) return "[]";
      // 短数组单行
      var isShort = v.length <= 6 && v.every(function (x) { return typeof x !== "object"; });
      if (isShort) {
        return "[" + v.map(function (x) { return _formatValue(x, 0); }).join(", ") + "]";
      }
      var items = v.map(function (x) {
        return pad2 + _formatValue(x, indent + 1);
      });
      return "[\n" + items.join(",\n") + "\n" + pad + "]";
    }
    if (typeof v === "object") {
      var keys = Object.keys(v);
      if (!keys.length) return "{}";
      var items = keys.map(function (k) {
        return pad2 + JSON.stringify(k) + ": " + _formatValue(v[k], indent + 1);
      });
      return "{\n" + items.join(",\n") + "\n" + pad + "}";
    }
    return String(v);
  }

  function _formatObject(obj, order, indent) {
    var pad = new Array(indent + 1).join("  ");
    var keys = _orderKeys(obj, order);
    var items = keys.map(function (k) {
      return pad + JSON.stringify(k) + ": " + _formatValue(obj[k], indent);
    });
    return "{\n" + items.join(",\n") + "\n" + new Array(indent).join("  ") + "}";
  }

  /** 序列化整份数据 */
  function serialize(data) {
    var lines = [];
    lines.push("{");

    // meta
    lines.push('  "meta": ' + _formatObject(data.meta || {}, META_ORDER, 1) + ",");

    // modes
    var modeStr = (data.modes || []).map(function (m) { return _formatObject(m, MODE_ORDER, 2); });
    lines.push('  "modes": [\n' + modeStr.map(function (s) {
      return s.split("\n").map(function (l, i) { return i === 0 ? "    " + l : l; }).join("\n");
    }).join(",\n") + "\n  ],");

    // groups
    var grpStr = (data.groups || []).map(function (g) { return _formatObject(g, GROUP_ORDER, 2); });
    lines.push('  "groups": [\n' + grpStr.map(function (s) {
      return s.split("\n").map(function (l, i) { return i === 0 ? "    " + l : l; }).join("\n");
    }).join(",\n") + "\n  ],");

    // nodes
    var nodeStr = (data.nodes || []).map(function (n) { return _formatObject(n, NODE_ORDER, 2); });
    lines.push('  "nodes": [\n' + nodeStr.map(function (s) {
      return s.split("\n").map(function (l, i) { return i === 0 ? "    " + l : l; }).join("\n");
    }).join(",\n") + "\n  ],");

    // edges
    var edgeStr = (data.edges || []).map(function (e) { return _formatObject(e, EDGE_ORDER, 2); });
    lines.push('  "edges": [\n' + edgeStr.map(function (s) {
      return s.split("\n").map(function (l, i) { return i === 0 ? "    " + l : l; }).join("\n");
    }).join(",\n") + "\n  ]");

    lines.push("}");
    return lines.join("\n");
  }

  /** 导出 JSON */
  function exportJson() {
    var data = PT.store.rawData;
    if (!data) return;
    var clean = PT.util.deepClone(data);
    // 清洗运行时字段
    (clean.nodes || []).forEach(function (n) {
      delete n.__in; delete n.__out; delete n.__calc;
    });
    var str = serialize(clean);
    PT.util.download("power_tree.json", str, "application/json;charset=utf-8");
  }

  /** 导出 data.js */
  function exportDataJs() {
    var data = PT.store.rawData;
    if (!data) return;
    var clean = PT.util.deepClone(data);
    (clean.nodes || []).forEach(function (n) {
      delete n.__in; delete n.__out; delete n.__calc;
    });
    var str = serialize(clean);
    var out = "/* Auto-generated by PowerTree editor — " + new Date().toISOString() + " */\n" +
      "PT.registerData(\"power_tree\", " + str + ");\n";
    PT.util.download("power_tree.data.js", out, "text/javascript;charset=utf-8");
  }

  PT.exportJson = {
    serialize: serialize,
    exportJson: exportJson,
    exportDataJs: exportDataJs
  };
})();
