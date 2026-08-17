/* ============================================================
 * panel-detail.js — 节点属性面板 (核心)
 * 分区: ①基本 ②电气 ③计算 ④效率曲线 ⑤各模式电流
 *       ⑥供电链路 ⑦时序 ⑧相关问题 ⑨原始 JSON
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;

  function DetailPanel(container) {
    this.container = container;
    this.nodeId = null;
    this.editorMode = false;
    this._build();
    PT.on("state:changed", this._onStateChange.bind(this));
  }

  DetailPanel.prototype._onStateChange = function (ev) {
    if (ev.keys.indexOf("selectedNodeId") >= 0 || ev.keys.indexOf("mode") >= 0 ||
        ev.keys.indexOf("stat") >= 0 || ev.keys.indexOf("*") >= 0) {
      this.refresh();
    }
  };

  DetailPanel.prototype._build = function () {
    this.container.classList.add("pt-detail-panel");
    // 初始无选中 → 隐藏 (refresh 会在 state:changed 时纠正)
    this.container.style.display = "none";
    var sidebar = this.container.parentNode;
    if (sidebar) sidebar.classList.add("pt-detail-hidden");
  };

  function _section(title) {
    var s = document.createElement("div");
    s.className = "pt-detail-section";
    var h = document.createElement("div");
    h.className = "pt-detail-section-title";
    h.textContent = title;
    s.appendChild(h);
    return s;
  }

  function _row(label, value) {
    var r = document.createElement("div");
    r.className = "pt-detail-row";
    r.innerHTML = "<span class='pt-detail-label'>" + PT.util.esc(label) + "</span>" +
      "<span class='pt-detail-value'>" + (value == null ? "—" : PT.util.esc(String(value))) + "</span>";
    return r;
  }

  DetailPanel.prototype.refresh = function () {
    var id = PT.store.get("selectedNodeId");
    this.nodeId = id;
    var graph = PT.store.graph;
    // 未选中模块时自动隐藏属性面板 (问题清单借 flex 布局自动占满侧栏)
    var sidebar = this.container.parentNode;
    if (!id || !graph || !graph.node(id)) {
      this.container.style.display = "none";
      this.container.innerHTML = "";
      if (sidebar) sidebar.classList.add("pt-detail-hidden");
      return;
    }
    this.container.style.display = "";
    if (sidebar) sidebar.classList.remove("pt-detail-hidden");
    var node = graph.node(id);
    var modeId = PT.store.get("mode");
    var statKey = PT.store.statKey();
    var lang = PT.store.get("lang") || "zh";

    this.container.innerHTML = "";

    // 头部
    var header = document.createElement("div");
    header.className = "pt-detail-header";
    header.innerHTML = "<div class='pt-detail-title'>" + PT.util.esc(node.name || node.id) + "</div>" +
      "<div class='pt-detail-subtitle'>" + PT.util.esc(node.id) + " · " + PT.util.esc(node.type) + "</div>";
    this.container.appendChild(header);

    /* ① 基本信息 */
    var s1 = _section(PT.i18n.t("panel_basic"));
    s1.appendChild(_row("ID", node.id));
    s1.appendChild(_row("名称", node.name));
    if (node.part) s1.appendChild(_row("型号", node.part));
    if (node.refdes) s1.appendChild(_row("RefDes", node.refdes));
    if (node.sheet) s1.appendChild(_row("原理图页", node.sheet));
    if (node.group) s1.appendChild(_row("分组", node.group));
    if (node.domain) s1.appendChild(_row("电源域", node.domain));
    if (node.tags && node.tags.length) s1.appendChild(_row("Tag", node.tags.join(", ")));
    if (node.note) s1.appendChild(_row("备注", node.note));
    this.container.appendChild(s1);

    /* ② 电气参数 */
    var s2 = _section(PT.i18n.t("panel_elec"));
    if (node.vin_range) s2.appendChild(_row("Vin 范围", node.vin_range[0] + " ~ " + node.vin_range[1] + " V"));
    var vout = PT.engine.nodeVout(node, modeId);
    if (vout != null) {
      var tol = node.vout_tol_pct || 3;
      s2.appendChild(_row("Vout", PT.util.fmt(vout) + " V ±" + tol + "%"));
    }
    if (node.vout_range) s2.appendChild(_row("Vout 范围", node.vout_range[0] + " ~ " + node.vout_range[1] + " V"));
    if (node.imax != null) s2.appendChild(_row("imax", node.imax + " mA"));
    if (node.iq_ua != null) s2.appendChild(_row("Iq", node.iq_ua + " µA"));
    if (node.dropout_mv != null) s2.appendChild(_row("Dropout", node.dropout_mv + " mV"));
    if (node.rds_on_mohm != null) s2.appendChild(_row("Rds_on", node.rds_on_mohm + " mΩ"));
    if (node.dcr_mohm != null) s2.appendChild(_row("DCR", node.dcr_mohm + " mΩ"));
    if (node.vf_mv != null) s2.appendChild(_row("Vf", node.vf_mv + " mV"));
    if (node.theta_ja != null) s2.appendChild(_row("θja", node.theta_ja + " ℃/W"));
    if (node.efficiency != null) s2.appendChild(_row("效率(标量)", PT.util.pct(node.efficiency)));
    if (node.eff_ref) s2.appendChild(_row("效率表", node.eff_ref));
    if (node.sense) s2.appendChild(_row("采样", node.sense));
    if (node.parallel_group) s2.appendChild(_row("并联组", node.parallel_group));
    if (node.cascade) s2.appendChild(_row("级联", node.cascade.chain_id + " 第" + node.cascade.stage + "级"));
    if (node.always_on) s2.appendChild(_row("常开", "是"));
    if (node.retention) s2.appendChild(_row("Retention", "是"));
    if (node.iso_signal) s2.appendChild(_row("ISO 信号", node.iso_signal));
    if (node.reset_signal) s2.appendChild(_row("RESET 信号", node.reset_signal));
    this.container.appendChild(s2);

    /* ③ 计算结果 */
    var s3 = _section(PT.i18n.t("panel_calc") + " (" + modeId + " / " + statKey + ")");
    if (node.__calc) {
      if (node.__calc.i_in_ma != null) s3.appendChild(_row("I_in", PT.util.fmt(node.__calc.i_in_ma) + " mA"));
      if (node.__calc.i_out_sum_ma != null) s3.appendChild(_row("I_out Σ", PT.util.fmt(node.__calc.i_out_sum_ma) + " mA"));
      if (node.__calc.utilization != null) {
        var u = node.__calc.utilization;
        var r = _row("利用率", PT.util.pct(u));
        if (u > 1) r.classList.add("pt-val-err");
        else if (u > 0.8) r.classList.add("pt-val-warn");
        s3.appendChild(r);
      }
      if (node.__calc.end_voltage != null) s3.appendChild(_row("末端电压", PT.util.fmt(node.__calc.end_voltage) + " V"));
      if (node.__calc.end_dev_pct != null) s3.appendChild(_row("末端偏差", PT.util.pct(node.__calc.end_dev_pct)));
      if (node.__calc.cascade_drop_v != null) s3.appendChild(_row("级联累计压降", PT.util.fmt(node.__calc.cascade_drop_v * 1000) + " mV"));
      if (node.__calc.loss_mw != null) s3.appendChild(_row("损耗", PT.util.fmt(node.__calc.loss_mw) + " mW"));
      if (node.__calc.delta_t != null) s3.appendChild(_row("估算温升", PT.util.fmt(node.__calc.delta_t) + " ℃"));
      if (node.__calc.dropout_ok === false) {
        var rr = _row("Dropout", "不足");
        rr.classList.add("pt-val-warn");
        s3.appendChild(rr);
      }
    }
    this.container.appendChild(s3);

    /* ④ 效率曲线 */
    if (node.eff_ref) {
      var s4 = _section(PT.i18n.t("panel_eff"));
      var effWrap = document.createElement("div");
      effWrap.className = "pt-eff-canvas";
      s4.appendChild(effWrap);
      this._renderEffCurve(effWrap, node, modeId);
      this.container.appendChild(s4);
    }

    /* ⑤ 各模式电流 */
    if (node.current) {
      var s5 = _section(PT.i18n.t("panel_modes"));
      var tbl = document.createElement("table");
      tbl.className = "pt-modes-table";
      var thead = "<tr><th>模式</th><th>typ</th><th>max</th></tr>";
      var tbody = "";
      (PT.store.rawData.modes || []).forEach(function (m) {
        var cur = node.current[m.id];
        var typ = "—", max = "—";
        if (typeof cur === "number") { typ = PT.util.fmt(cur); max = "—"; }
        else if (cur) {
          typ = cur.typ != null ? PT.util.fmt(cur.typ) : "—";
          max = cur.max != null ? PT.util.fmt(cur.max) : "—";
        }
        var cls = m.id === modeId ? " class='active'" : "";
        tbody += "<tr" + cls + "><td>" + PT.util.esc(m.name_zh || m.id) + "</td><td>" + typ + "</td><td>" + max + "</td></tr>";
      });
      tbl.innerHTML = thead + tbody;
      s5.appendChild(tbl);
      this.container.appendChild(s5);
    }

    /* ⑥ 供电链路 */
    var s6 = _section(PT.i18n.t("panel_path"));
    var pathWrap = document.createElement("div");
    pathWrap.className = "pt-path-breadcrumb";
    var ancestors = graph.powerAncestors(id);
    var sources = ancestors.filter(function (aid) {
      var an = graph.node(aid);
      return an && an.type === "source";
    });
    // source → ... → 本节点
    function renderPath(ids, separator) {
      ids.forEach(function (aid, idx) {
        var an = graph.node(aid);
        if (!an) return;
        var link = document.createElement("span");
        link.className = "pt-path-link" + (aid === id ? " current" : "");
        link.textContent = an.name || aid;
        link.onclick = (function (targetId) {
          return function () { PT.store.set({ selectedNodeId: targetId }); };
        })(aid);
        pathWrap.appendChild(link);
        if (idx < ids.length - 1) {
          var sep = document.createElement("span");
          sep.className = "pt-path-sep";
          sep.textContent = separator || " → ";
          pathWrap.appendChild(sep);
        }
      });
    }
    if (sources.length) {
      // 找一条从 source 到本节点的路径
      var pathFromSource = this._findPath(graph, sources[0], id);
      if (pathFromSource.length) {
        renderPath(pathFromSource);
      } else {
        renderPath(ancestors.concat([id]));
      }
    } else {
      pathWrap.textContent = "未追溯到 source";
    }
    // 直连负载
    var downWrap = document.createElement("div");
    downWrap.className = "pt-path-downstream";
    var downIds = graph.downstreamPowerIds(id);
    if (downIds.length) {
      var lbl = document.createElement("div");
      lbl.className = "pt-path-subtitle";
      lbl.textContent = "直接下游:";
      downWrap.appendChild(lbl);
      downIds.forEach(function (did) {
        var dn = graph.node(did);
        if (!dn) return;
        var link = document.createElement("span");
        link.className = "pt-path-link";
        link.textContent = dn.name || did;
        link.onclick = (function (targetId) {
          return function () { PT.store.set({ selectedNodeId: targetId }); };
        })(did);
        downWrap.appendChild(link);
      });
    }
    s6.appendChild(pathWrap);
    s6.appendChild(downWrap);
    this.container.appendChild(s6);

    /* ⑦ 时序信息 */
    if (node.enable) {
      var s7 = _section(PT.i18n.t("panel_seq"));
      if (node.enable.src) s7.appendChild(_row("EN 源", node.enable.src));
      if (node.enable.signal) s7.appendChild(_row("信号", node.enable.signal));
      if (node.enable.order != null) s7.appendChild(_row("Order", node.enable.order));
      if (node.enable.delay_ms != null) s7.appendChild(_row("Delay", node.enable.delay_ms + " ms"));
      if (node.enable.ramp_ms != null) s7.appendChild(_row("Ramp", node.enable.ramp_ms + " ms"));
      if (node.enable.pg != null) s7.appendChild(_row("PG", node.enable.pg ? "是" : "否"));
      this.container.appendChild(s7);
    }

    /* ⑧ 相关问题 */
    var myIssues = PT.rules.issuesForNode(PT.store.issues, id);
    if (myIssues.length) {
      var s8 = _section(PT.i18n.t("panel_issues") + " (" + myIssues.length + ")");
      myIssues.forEach(function (iss) {
        var div = document.createElement("div");
        div.className = "pt-issue-item pt-issue-" + iss.level;
        div.innerHTML = "<div class='pt-issue-head'><span class='pt-issue-level'>" + iss.level + "</span>" +
          "<span class='pt-issue-rule'>" + PT.util.esc(iss.ruleId) + "</span></div>" +
          "<div class='pt-issue-msg'>" + PT.util.esc(iss.message_zh) + "</div>";
        s8.appendChild(div);
      });
      this.container.appendChild(s8);
    }

    /* ⑨ 原始 JSON */
    var s9 = _section(PT.i18n.t("panel_json"));
    var jsonPre = document.createElement("pre");
    jsonPre.className = "pt-json-view";
    var cleanNode = PT.util.deepClone(node);
    delete cleanNode.__in;
    delete cleanNode.__out;
    delete cleanNode.__calc;
    jsonPre.textContent = JSON.stringify(cleanNode, null, 2);
    s9.appendChild(jsonPre);

    if (this.editorMode || PT.store.get("editorMode")) {
      var editBtn = document.createElement("button");
      editBtn.className = "pt-btn";
      editBtn.textContent = "编辑 JSON";
      var self = this;
      editBtn.onclick = function () { self._editNodeJson(node); };
      s9.appendChild(editBtn);
    }
    this.container.appendChild(s9);
  };

  /** BFS 找路径 */
  DetailPanel.prototype._findPath = function (graph, fromId, toId) {
    if (fromId === toId) return [fromId];
    var visited = {};
    var prev = {};
    var queue = [fromId];
    visited[fromId] = true;
    while (queue.length) {
      var cur = queue.shift();
      var downs = graph.downstreamPowerIds(cur);
      for (var i = 0; i < downs.length; i++) {
        var n = downs[i];
        if (visited[n]) continue;
        visited[n] = true;
        prev[n] = cur;
        if (n === toId) {
          var path = [n];
          while (prev[path[0]]) path.unshift(prev[path[0]]);
          return path;
        }
        queue.push(n);
      }
    }
    return [];
  };

  /** 效率曲线绘制 */
  DetailPanel.prototype._renderEffCurve = function (wrap, node, modeId) {
    var graph = PT.store.graph;
    var vin = null;
    var ups = graph.upstreamPowerIds(node.id);
    if (ups.length) {
      var upNode = graph.node(ups[0]);
      if (upNode) vin = PT.engine.nodeVout(upNode, modeId);
    }
    var vout = PT.engine.nodeVout(node, modeId);
    var curve = PT.effTable.curve(node.eff_ref, vin || 3.8, vout || 0.9);
    if (!curve || !curve.i.length) {
      wrap.innerHTML = "<div class='pt-empty'>无效率数据</div>";
      return;
    }

    var w = 320, h = 160;
    var pad = { l: 36, r: 8, t: 8, b: 24 };
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", h);
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);

    var iArr = curve.i, eArr = curve.eff;
    var iMax = iArr[iArr.length - 1];
    var eMax = Math.max.apply(null, eArr);
    var eMin = Math.min.apply(null, eArr);

    var SVG_NS = "http://www.w3.org/2000/svg";
    function _el(tag, attrs, parent) {
      var e = document.createElementNS(SVG_NS, tag);
      if (attrs) for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
      if (parent) parent.appendChild(e);
      return e;
    }

    _el("line", { x1: pad.l, y1: h - pad.b, x2: w - pad.r, y2: h - pad.b, stroke: "#b0bec5" }, svg);
    _el("line", { x1: pad.l, y1: pad.t, x2: pad.l, y2: h - pad.b, stroke: "#b0bec5" }, svg);

    var path = "M";
    for (var k = 0; k < iArr.length; k++) {
      var x = pad.l + (iArr[k] / iMax) * (w - pad.l - pad.r);
      var y = h - pad.b - ((eArr[k] - eMin) / Math.max(1e-6, eMax - eMin)) * (h - pad.t - pad.b);
      path += (k === 0 ? "" : " L") + x.toFixed(1) + " " + y.toFixed(1);
    }
    _el("path", { d: path, fill: "none", stroke: "#1e88e5", "stroke-width": 1.5 }, svg);

    // 当前工作点
    var iCur = (node.__calc && node.__calc.i_out_sum_ma) || 0;
    var interp = PT.effTable.interpolate(node.eff_ref, vin || 3.8, vout || 0.9, iCur);
    if (interp && interp.eff != null) {
      var cx = pad.l + (iCur / iMax) * (w - pad.l - pad.r);
      var cy = h - pad.b - ((interp.eff - eMin) / Math.max(1e-6, eMax - eMin)) * (h - pad.t - pad.b);
      _el("circle", { cx: cx, cy: cy, r: 4, fill: "#e53935", stroke: "#fff", "stroke-width": 1.5 }, svg);
      var t = _el("text", { x: Math.min(w - 90, cx + 6), y: cy - 4, "font-size": 9, fill: "#c62828" }, svg);
      t.textContent = PT.util.fmt(iCur) + "mA → " + PT.util.pct(interp.eff);
    }

    wrap.appendChild(svg);
  };

  /** 编辑节点 JSON (Author 模式) */
  DetailPanel.prototype._editNodeJson = function (node) {
    var cleanNode = PT.util.deepClone(node);
    delete cleanNode.__in;
    delete cleanNode.__out;
    delete cleanNode.__calc;

    var overlay = document.createElement("div");
    overlay.className = "pt-modal-overlay";
    var box = document.createElement("div");
    box.className = "pt-modal-box pt-json-editor";
    var h = document.createElement("h3");
    h.textContent = "编辑节点: " + node.id;
    box.appendChild(h);

    var ta = document.createElement("textarea");
    ta.value = JSON.stringify(cleanNode, null, 2);
    ta.spellcheck = false;
    box.appendChild(ta);

    var btnRow = document.createElement("div");
    btnRow.className = "pt-modal-btns";
    var saveBtn = document.createElement("button");
    saveBtn.className = "pt-btn pt-btn-primary";
    saveBtn.textContent = "保存";
    saveBtn.onclick = function () {
      try {
        var newNode = JSON.parse(ta.value);
        // 替换 store 中的节点
        var data = PT.store.rawData;
        var idx = -1;
        for (var i = 0; i < data.nodes.length; i++) {
          if (data.nodes[i].id === node.id) { idx = i; break; }
        }
        if (idx >= 0) {
          data.nodes[idx] = newNode;
          PT.store.setData(data);
          PT.app.recalc();
          document.body.removeChild(overlay);
        }
      } catch (e) {
        alert("JSON 解析失败: " + e.message);
      }
    };
    var cancelBtn = document.createElement("button");
    cancelBtn.className = "pt-btn";
    cancelBtn.textContent = "取消";
    cancelBtn.onclick = function () { document.body.removeChild(overlay); };
    btnRow.appendChild(saveBtn);
    btnRow.appendChild(cancelBtn);
    box.appendChild(btnRow);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  };

  PT.DetailPanel = DetailPanel;
})();
