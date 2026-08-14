/* ============================================================
 * url-state.js — URL hash 状态持久化
 * 形如: #v=board&m=active&s=typ&sel=BUCK1&col=util&lang=zh&theme=dark&ctl=0
 * file:// 下同样有效
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;

  var KEY_MAP = {
    view: "v",
    mode: "m",
    stat: "s",
    selectedNodeId: "sel",
    colorBy: "col",
    lang: "lang",
    theme: "th",
    controlEdgeVisible: "ctl",
    focusNodeId: "foc",
    focusHops: "fh"
  };

  function _encode(state) {
    var parts = [];
    for (var k in KEY_MAP) {
      if (!KEY_MAP.hasOwnProperty(k)) continue;
      var v = state[k];
      if (v === undefined || v === null || v === "") continue;
      var short = KEY_MAP[k];
      if (typeof v === "boolean") v = v ? "1" : "0";
      parts.push(short + "=" + encodeURIComponent(String(v)));
    }
    // 折叠分组单独序列化
    var collapsed = state.collapsedGroups || {};
    var collapsedIds = Object.keys(collapsed).filter(function (g) { return collapsed[g]; });
    if (collapsedIds.length) {
      parts.push("cg=" + encodeURIComponent(collapsedIds.join(",")));
    }
    return parts.length ? "#" + parts.join("&") : "";
  }

  function _decode(hash) {
    var out = {};
    if (!hash || hash.charAt(0) !== "#") return out;
    var body = hash.slice(1);
    if (!body) return out;
    body.split("&").forEach(function (kv) {
      var i = kv.indexOf("=");
      if (i < 0) return;
      var k = kv.slice(0, i);
      var v = decodeURIComponent(kv.slice(i + 1));
      // 反查
      for (var key in KEY_MAP) {
        if (KEY_MAP[key] === k) {
          if (v === "1") v = true;
          else if (v === "0") v = false;
          else if (k === "fh") v = parseInt(v, 10);
          out[key] = v;
          return;
        }
      }
      if (k === "cg") {
        var obj = {};
        v.split(",").forEach(function (g) { if (g) obj[g] = true; });
        out.collapsedGroups = obj;
      }
    });
    return out;
  }

  PT.urlState = {
    /** 把当前 store.state 写入 location.hash (不触发 hashchange) */
    save: function (state) {
      var h = _encode(state);
      // 直接替换, 避免产生历史记录噪音
      if (("URL" in window) && history.replaceState) {
        var url = new URL(window.location.href);
        url.hash = h;
        history.replaceState(null, "", url.toString());
      } else {
        // 兼容老浏览器
        window.location.hash = h;
      }
    },

    /** 从 location.hash 读出状态补丁 */
    load: function () {
      return _decode(window.location.hash || "");
    },

    /** 生成"当前视图链接" */
    currentLink: function (state) {
      var h = _encode(state);
      var base = window.location.href.split("#")[0];
      return base + h;
    }
  };
})();
