/* ============================================================
 * store.js — 应用状态中心
 * 持有: 原始数据 / 图 / 当前模式 / typ-max 切换 / 选中 / 折叠 /
 *       过滤 / 配色语义 / 语言 / 主题 / 视图 / 控制边显隐 等
 * 任何变更统一通过 store.set(...), 触发 PT.emit("state:changed")
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;

  var DEFAULT_STATE = {
    view: "board",           // board | soc | table | sequence | dashboard
    mode: "active",          // 当前功耗模式 id
    stat: "typ",             // typ | max
    selectedNodeId: null,
    collapsedGroups: {},     // groupId -> true
    focusNodeId: null,       // 聚焦模式中心
    focusHops: 2,
    controlEdgeVisible: false,
    issueCheckEnabled: false,   // Error/Warning 规则检测总开关 (默认关闭, 图面太乱时先关掉)
    controlSubFilter: { EN: true, PG: true, I2C: true, RESET: true, ISO: true, SENSE: true, IRQ: true },
    colorBy: "util",         // util | voltage | domain | type | issue | pmic
    lang: "zh",              // zh | en
    theme: "light",          // light | dark
    filter: {                // 搜索过滤条件
      text: "",
      types: [],
      groups: [],
      tags: [],
      vMin: null,
      vMax: null,
      issueLevel: ""         // "" | E | W | I
    },
    showInlinePassive: false,
    showSwimlane: false,
    showDecap: false,        // 叶子噪声节点抽屉
    editorMode: false        // Author 模式
  };

  function Store() {
    this.state = PT.util.deepClone(DEFAULT_STATE);
    this.rawData = null;      // 校验后的原始数据
    this.graph = null;        // PT.Graph 实例
    this.config = null;       // config.data.js
    this.issues = [];         // 校核结果
    this.calcVersion = 0;     // 计算版本号 (每次重算递增)
  }

  /** 初始化: 装载数据 + 配置 */
  Store.prototype.init = function (rawData, config) {
    this.config = config || {};
    this.rawData = rawData;

    // 应用 config 默认
    var d = this.config.defaults || {};
    if (d.lang) this.state.lang = d.lang;
    if (d.theme) this.state.theme = d.theme;
    if (d.view) this.state.view = d.view;
    if (d.mode) this.state.mode = d.mode;
    if (d.colorBy) this.state.colorBy = d.colorBy;
    if (d.focusHops != null) this.state.focusHops = d.focusHops;
    if (d.controlEdgeVisible != null) this.state.controlEdgeVisible = d.controlEdgeVisible;
    if (d.showSwimlane != null) this.state.showSwimlane = d.showSwimlane;

    // 数据默认 mode
    var modes = rawData.modes || [];
    var defMode = modes.filter(function (m) { return m.default; })[0];
    if (!this.state.mode || !modes.some(function (m) { return m.id === this.state.mode; }, this)) {
      this.state.mode = defMode ? defMode.id : (modes[0] && modes[0].id) || "active";
    }

    this.graph = new PT.Graph(rawData);
    PT.emit("data:loaded", { graph: this.graph });
  };

  /** 替换数据 (导入或编辑后) */
  Store.prototype.setData = function (rawData) {
    this.rawData = rawData;
    this.graph = new PT.Graph(rawData);
    this.calcVersion++;
    PT.emit("data:loaded", { graph: this.graph });
  };

  /** 更新状态字段 */
  Store.prototype.set = function (patch) {
    var changed = [];
    for (var k in patch) {
      if (!patch.hasOwnProperty(k)) continue;
      var old = this.state[k];
      var nw = patch[k];
      if (JSON.stringify(old) !== JSON.stringify(nw)) {
        this.state[k] = nw;
        changed.push(k);
      }
    }
    if (changed.length) {
      PT.emit("state:changed", { keys: changed, state: this.state });
    }
    return changed;
  };

  Store.prototype.get = function (key) {
    return this.state[key];
  };

  /** 重置为默认 */
  Store.prototype.reset = function () {
    this.state = PT.util.deepClone(DEFAULT_STATE);
    PT.emit("state:changed", { keys: ["*"], state: this.state });
  };

  /** 当前模式对象 */
  Store.prototype.currentMode = function () {
    var id = this.state.mode;
    return (this.rawData && this.rawData.modes || []).filter(function (m) {
      return m.id === id;
    })[0] || null;
  };

  /** 当前 stat (typ/max) */
  Store.prototype.statKey = function () {
    return this.state.stat === "max" ? "max" : "typ";
  };

  // 全局单例
  PT.store = new Store();
})();
