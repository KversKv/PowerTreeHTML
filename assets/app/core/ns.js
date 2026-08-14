/* ============================================================
 * ns.js — 全局命名空间与基础工具
 * 所有模块统一挂载在 window.PT 下, 禁止使用 ESM / import
 * ============================================================ */
(function () {
  "use strict";

  // 单一全局命名空间
  var PT = window.PT = window.PT || {};

  // 数据登记表: data/*.data.js 通过 PT.registerData(name, obj) 注入
  var _dataRegistry = {};
  var _effRegistry = {};

  /**
   * 注册主数据 (power_tree / config / parts-lib 等)
   * @param {string} name 数据名
   * @param {object} obj 纯 JSON 结构
   */
  PT.registerData = function (name, obj) {
    _dataRegistry[name] = obj;
  };

  /** 取回已注册的数据 */
  PT.getData = function (name) {
    return _dataRegistry[name] || null;
  };

  /** 列出全部已注册数据名 */
  PT.listData = function () {
    return Object.keys(_dataRegistry);
  };

  /**
   * 注册效率表 (data/eff/*.data.js)
   * @param {string} partId 器件型号
   * @param {object} table { unit, conditions: [{vin,vout,i_start,i_step,eff:[...]}] }
   */
  PT.registerEff = function (partId, table) {
    _effRegistry[partId] = table;
  };

  PT.getEff = function (partId) {
    return _effRegistry[partId] || null;
  };

  // 允许脚本注入已注册的效率表清单 (用于 file:// 下懒加载判断)
  PT._effRegistered = function () {
    return Object.keys(_effRegistry);
  };

  /* ---------------- 事件总线 ---------------- */
  var _listeners = {};

  /**
   * 订阅事件
   * @param {string} ev 事件名
   * @param {Function} fn 回调
   */
  PT.on = function (ev, fn) {
    (_listeners[ev] = _listeners[ev] || []).push(fn);
  };

  /** 退订 */
  PT.off = function (ev, fn) {
    var arr = _listeners[ev];
    if (!arr) return;
    var i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  };

  /** 触发事件 */
  PT.emit = function (ev, payload) {
    var arr = _listeners[ev];
    if (!arr) return;
    // 复制一份防止回调内退订导致漏遍历
    arr.slice().forEach(function (fn) {
      try { fn(payload); } catch (e) { console.error("[PT event]", ev, e); }
    });
  };

  /* ---------------- 小工具 ---------------- */
  PT.util = {

    /** 深拷贝 (仅 JSON 可序列化对象) */
    deepClone: function (o) {
      return o == null ? o : JSON.parse(JSON.stringify(o));
    },

    /** 是否为对象 */
    isObj: function (o) {
      return o != null && typeof o === "object" && !Array.isArray(o);
    },

    /** 数字格式化, 保留 n 位小数并去尾零 */
    fmt: function (v, n) {
      if (v == null || isNaN(v)) return "—";
      if (n == null) n = 3;
      var s = Number(v).toFixed(n);
      // 去尾零: 1.200 -> 1.2 ; 1.000 -> 1
      if (s.indexOf(".") >= 0) {
        s = s.replace(/0+$/, "").replace(/\.$/, "");
      }
      return s;
    },

    /** 百分比格式化 */
    pct: function (v, n) {
      if (v == null || isNaN(v)) return "—";
      if (n == null) n = 1;
      return (v * 100).toFixed(n) + "%";
    },

    /** 节流 */
    throttle: function (fn, ms) {
      var last = 0, timer = null;
      return function () {
        var now = Date.now();
        var args = arguments, self = this;
        if (now - last >= ms) {
          last = now;
          fn.apply(self, args);
        } else if (!timer) {
          timer = setTimeout(function () {
            timer = null;
            last = Date.now();
            fn.apply(self, args);
          }, ms - (now - last));
        }
      };
    },

    /** 防抖 */
    debounce: function (fn, ms) {
      var timer = null;
      return function () {
        var args = arguments, self = this;
        clearTimeout(timer);
        timer = setTimeout(function () { fn.apply(self, args); }, ms);
      };
    },

    /** 生成简短唯一 id */
    uid: function (prefix) {
      return (prefix || "id") + "_" + Math.random().toString(36).slice(2, 9);
    },

    /** 下载文本文件 */
    download: function (filename, content, mime) {
      var blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 50);
    },

    /** HTML 转义 */
    esc: function (s) {
      if (s == null) return "";
      return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    },

    /** 文本截断为省略号 */
    ellipsize: function (s, max) {
      if (s == null) return "";
      s = String(s);
      return s.length <= max ? s : s.slice(0, Math.max(0, max - 1)) + "…";
    },

    /** 数值是否在 [min,max] 区间 (含边界) */
    inRange: function (v, range) {
      if (!Array.isArray(range) || range.length < 2) return true;
      return v >= range[0] && v <= range[1];
    },

    /** 两区间是否有交集 */
    rangeOverlap: function (a, b) {
      if (!Array.isArray(a) || a.length < 2) return true;
      if (!Array.isArray(b) || b.length < 2) return true;
      return a[0] <= b[1] && b[0] <= a[1];
    }
  };

  // 版本戳 (打包时由 pack.py 可替换)
  PT.BUILD = { version: "dev", date: "2026-08-14" };
})();
