/* ============================================================
 * schema.js — 数据模型校验与默认值填充
 * 目标: 所有字段缺失都有缺省行为, 绝不因缺字段抛异常;
 *       校验错误必须指明 节点 id + 字段名 + 期望类型
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;

  var CURRENT_SCHEMA_VERSION = "1.0";

  // 节点类型枚举
  var NODE_TYPES = [
    "source", "buck", "boost", "buck_boost", "ldo", "load_switch",
    "efuse", "ideal_diode", "divider", "level_shifter",
    "passive_r", "passive_l", "passive_c",
    "load", "domain", "virtual", "seq_ctrl"
  ];

  // 边类型与子类
  var EDGE_TYPES = ["power", "control"];
  var EDGE_SUBS = ["EN", "PG", "I2C", "RESET", "ISO", "SENSE", "IRQ"];

  // 分组类型
  var GROUP_KINDS = ["board", "pmic", "chip", "domain"];

  /**
   * 单字段校验描述
   *  - t: 期望类型 ("number" | "string" | "boolean" | "array" | "object")
   *  - required: 是否必填
   *  - def: 缺省值 (函数或字面量)
   */
  var NODE_FIELDS = {
    id:            { t: "string", required: true },
    type:          { t: "string", required: true },
    name:          { t: "string", def: "" },
    group:         { t: "string" },
    part:          { t: "string" },
    vout:          { t: "number" },
    vout_range:    { t: "array" },
    vout_tol_pct:  { t: "number", def: 3 },
    vin_range:     { t: "array" },
    imax:          { t: "number" },
    iq_ua:         { t: "number" },
    efficiency:    { t: "number" },
    eff_ref:       { t: "string" },
    dropout_mv:    { t: "number" },
    rds_on_mohm:   { t: "number" },
    dcr_mohm:      { t: "number" },
    r_mohm:        { t: "number" },
    l_uh:          { t: "number" },
    isat:          { t: "number" },
    c_uf:          { t: "number" },
    esr_mohm:      { t: "number" },
    volt_rating:   { t: "number" },
    power_mw:      { t: "number" },
    tol_pct:       { t: "number" },
    vf_mv:         { t: "number" },
    soft_start_ms: { t: "number" },
    theta_ja:      { t: "number" },
    dvfs:          { t: "object" },
    enable:        { t: "object" },
    on_in_modes:   { t: "array" },
    sense:         { t: "string" },
    parallel_group:{ t: "string" },
    cascade:       { t: "object" },
    tags:          { t: "array", def: function () { return []; } },
    note:          { t: "string", def: "" },
    refdes:        { t: "string" },
    sheet:         { t: "string" },
    domain:        { t: "string" },
    voltage:       { t: "number" },
    always_on:     { t: "boolean", def: false },
    retention:     { t: "boolean", def: false },
    current:       { t: "object" },
    vtol_pct:      { t: "number", def: 5 },
    iso_signal:    { t: "string" },
    reset_signal:  { t: "string" },
    ratio:         { t: "number" },          // divider 分压比
    ratio_str:     { t: "string" },          // divider 文本比例
    vin_fixed:     { t: "number" },          // source 固定输入 (用于 boost 等的上游)
    side:          { t: "string" }           // 布局 hint: left/right
  };

  var EDGE_FIELDS = {
    from:         { t: "string", required: true },
    to:           { t: "string", required: true },
    type:         { t: "string", required: true },
    sub:          { t: "string" },
    net:          { t: "string" },
    signal:       { t: "string" },
    trace_r_mohm: { t: "number", def: 0 },
    inline:       { t: "array" }
  };

  /**
   * 校验单个对象的字段
   * @returns {Array} 错误数组 [{id, field, expect, actual, message}]
   */
  function _validateFields(obj, spec, ctxLabel) {
    var errors = [];
    if (!PT.util.isObj(obj)) {
      errors.push({ id: ctxLabel, field: "(root)", expect: "object", actual: typeof obj,
        message: ctxLabel + " 必须是对象" });
      return errors;
    }
    Object.keys(spec).forEach(function (key) {
      var rule = spec[key];
      var v = obj[key];
      var missing = (v === undefined || v === null);
      if (missing && rule.required) {
        errors.push({ id: obj.id || ctxLabel, field: key, expect: rule.t, actual: "undefined",
          message: (obj.id || ctxLabel) + "." + key + " 缺失 (必填, 期望 " + rule.t + ")" });
      } else if (!missing) {
        var ok = true;
        switch (rule.t) {
          case "number":  ok = typeof v === "number" && isFinite(v); break;
          case "string":  ok = typeof v === "string"; break;
          case "boolean": ok = typeof v === "boolean"; break;
          case "array":   ok = Array.isArray(v); break;
          case "object":  ok = PT.util.isObj(v); break;
        }
        if (!ok) {
          errors.push({ id: obj.id || ctxLabel, field: key, expect: rule.t, actual: Array.isArray(v) ? "array" : typeof v,
            message: (obj.id || ctxLabel) + "." + key + " 类型错误: 期望 " + rule.t + ", 实际 " + (Array.isArray(v) ? "array" : typeof v) });
        }
      }
    });
    return errors;
  }

  /** 填充缺省值 */
  function _applyDefaults(obj, spec) {
    Object.keys(spec).forEach(function (key) {
      var rule = spec[key];
      if (obj[key] === undefined && rule.def !== undefined) {
        obj[key] = (typeof rule.def === "function") ? rule.def() : rule.def;
      }
    });
  }

  /**
   * 校验整份 power_tree 数据
   * @param {object} raw 原始数据
   * @returns {{ ok:boolean, errors:Array, warnings:Array, migrated:boolean, data:object }}
   */
  PT.schema = {
    NODE_TYPES: NODE_TYPES,
    EDGE_TYPES: EDGE_TYPES,
    EDGE_SUBS: EDGE_SUBS,
    GROUP_KINDS: GROUP_KINDS,
    CURRENT_SCHEMA_VERSION: CURRENT_SCHEMA_VERSION,

    validate: function (raw) {
      var errors = [];
      var warnings = [];
      var migrated = false;

      if (!PT.util.isObj(raw)) {
        return { ok: false, errors: [{ id: "(root)", field: "(root)", expect: "object", actual: typeof raw, message: "数据必须是对象" }], warnings: [], migrated: false, data: null };
      }

      var data = PT.util.deepClone(raw);

      // ---- meta ----
      if (!PT.util.isObj(data.meta)) data.meta = {};
      var sv = data.meta.schema_version;
      if (sv === undefined) {
        warnings.push({ id: "meta", field: "schema_version", message: "缺少 schema_version, 按 " + CURRENT_SCHEMA_VERSION + " 处理" });
        data.meta.schema_version = CURRENT_SCHEMA_VERSION;
      } else if (sv !== CURRENT_SCHEMA_VERSION) {
        warnings.push({ id: "meta", field: "schema_version", message: "schema_version=" + sv + " 与当前 " + CURRENT_SCHEMA_VERSION + " 不一致, 请用 tools/validate.py 迁移" });
        migrated = true;
      }

      // ---- modes ----
      if (!Array.isArray(data.modes) || data.modes.length === 0) {
        data.modes = [{ id: "active", name_zh: "全速运行", name_en: "Active", default: true }];
        warnings.push({ id: "modes", field: "modes", message: "modes 缺失, 使用默认单模式 active" });
      }
      var hasDefault = data.modes.some(function (m) { return m && m.default; });
      if (!hasDefault) data.modes[0].default = true;

      // ---- groups ----
      if (!Array.isArray(data.groups)) data.groups = [];
      var groupIds = {};
      data.groups.forEach(function (g) {
        if (!g || !g.id) {
          errors.push({ id: "(group)", field: "id", expect: "string", actual: "undefined", message: "分组缺少 id" });
          return;
        }
        if (groupIds[g.id]) {
          errors.push({ id: g.id, field: "id", expect: "unique", actual: "duplicate", message: "分组 id 重复: " + g.id });
        }
        groupIds[g.id] = true;
        if (g.kind && GROUP_KINDS.indexOf(g.kind) < 0) {
          warnings.push({ id: g.id, field: "kind", message: "未知分组 kind: " + g.kind });
        }
      });

      // ---- nodes ----
      if (!Array.isArray(data.nodes)) {
        errors.push({ id: "nodes", field: "nodes", expect: "array", actual: typeof data.nodes, message: "nodes 必须是数组" });
        data.nodes = [];
      }
      var nodeIds = {};
      data.nodes.forEach(function (n, idx) {
        if (!PT.util.isObj(n)) {
          errors.push({ id: "nodes[" + idx + "]", field: "(root)", expect: "object", actual: typeof n, message: "nodes[" + idx + "] 必须是对象" });
          return;
        }
        // 字段类型校验
        errors = errors.concat(_validateFields(n, NODE_FIELDS, "nodes[" + idx + "]"));
        // id 重复
        if (n.id) {
          if (nodeIds[n.id]) {
            errors.push({ id: n.id, field: "id", expect: "unique", actual: "duplicate", message: "节点 id 重复: " + n.id });
          }
          nodeIds[n.id] = true;
        }
        // type 枚举
        if (n.type && NODE_TYPES.indexOf(n.type) < 0) {
          warnings.push({ id: n.id, field: "type", message: "未知节点类型: " + n.type + ", 将按 virtual 渲染" });
        }
        // group 引用
        if (n.group && !groupIds[n.group]) {
          warnings.push({ id: n.id, field: "group", message: "引用了不存在的分组: " + n.group });
        }
        // 缺省
        _applyDefaults(n, NODE_FIELDS);
      });

      // ---- edges ----
      if (!Array.isArray(data.edges)) data.edges = [];
      data.edges.forEach(function (e, idx) {
        if (!PT.util.isObj(e)) {
          errors.push({ id: "edges[" + idx + "]", field: "(root)", expect: "object", actual: typeof e, message: "edges[" + idx + "] 必须是对象" });
          return;
        }
        errors = errors.concat(_validateFields(e, EDGE_FIELDS, "edges[" + idx + "]"));
        if (e.from && !nodeIds[e.from]) {
          warnings.push({ id: "edges[" + idx + "]", field: "from", message: "边 from 引用不存在节点: " + e.from });
        }
        if (e.to && !nodeIds[e.to]) {
          warnings.push({ id: "edges[" + idx + "]", field: "to", message: "边 to 引用不存在节点: " + e.to });
        }
        if (e.type && EDGE_TYPES.indexOf(e.type) < 0) {
          warnings.push({ id: "edges[" + idx + "]", field: "type", message: "未知边类型: " + e.type + ", 按 power 处理" });
        }
        if (e.sub && EDGE_SUBS.indexOf(e.sub) < 0) {
          warnings.push({ id: "edges[" + idx + "]", field: "sub", message: "未知控制边子类: " + e.sub });
        }
        _applyDefaults(e, EDGE_FIELDS);
        // 给每条边分配稳定 id
        if (!e.id) e.id = "e_" + idx + "_" + (e.from || "?") + "_" + (e.to || "?");
      });

      return { ok: errors.length === 0, errors: errors, warnings: warnings, migrated: migrated, data: data };
    }
  };
})();
