/* ============================================================
 * view-table.js — 视图三: 表格视图
 * 排序 / 多条件筛选 / 列显隐 / 行选中同步高亮 / 导出 CSV
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;

  var COLS = [
    { key: "id",        label_zh: "Rail",       label_en: "Rail",       w: 140 },
    { key: "name",      label_zh: "名称",       label_en: "Name",       w: 160 },
    { key: "type",      label_zh: "类型",       label_en: "Type",       w: 90 },
    { key: "part",      label_zh: "器件",       label_en: "Part",       w: 130 },
    { key: "vout",      label_zh: "Vout(V)",    label_en: "Vout(V)",    w: 90, num: true },
    { key: "i_typ",     label_zh: "I typ(mA)",  label_en: "I typ(mA)",  w: 100, num: true },
    { key: "i_max",     label_zh: "I max(mA)",  label_en: "I max(mA)",  w: 100, num: true },
    { key: "imax",      label_zh: "imax(mA)",   label_en: "imax(mA)",   w: 90, num: true },
    { key: "util",      label_zh: "利用率",     label_en: "Util",       w: 90, num: true },
    { key: "vdrop_mv",  label_zh: "Vdrop(mV)",  label_en: "Vdrop(mV)",  w: 100, num: true },
    { key: "loss_mw",   label_zh: "损耗(mW)",   label_en: "Loss(mW)",   w: 90, num: true },
    { key: "loads",     label_zh: "负载列表",   label_en: "Loads",      w: 200 },
    { key: "issues",    label_zh: "问题数",     label_en: "Issues",     w: 90, num: true },
    { key: "tags",      label_zh: "Tag",        label_en: "Tag",        w: 120 }
  ];

  function TableView(container) {
    this.container = container;
    this.sortKey = "util";
    this.sortDesc = true;
    this.visibleCols = {};
    COLS.forEach(function (c) { this.visibleCols[c.key] = true; }, this);
    this._build();
  }

  TableView.prototype._build = function () {
    var self = this;
    this.toolbar = document.createElement("div");
    this.toolbar.className = "pt-table-toolbar";

    // 列显隐
    var colBtn = document.createElement("button");
    colBtn.className = "pt-btn";
    colBtn.textContent = "列显隐";
    colBtn.onclick = function () { self._toggleColPanel(); };
    this.toolbar.appendChild(colBtn);

    // 导出 CSV
    var csvBtn = document.createElement("button");
    csvBtn.className = "pt-btn";
    csvBtn.textContent = "导出 CSV";
    csvBtn.onclick = function () { self._exportCsv(); };
    this.toolbar.appendChild(csvBtn);

    this.container.appendChild(this.toolbar);

    // 列显隐面板
    this.colPanel = document.createElement("div");
    this.colPanel.className = "pt-col-panel";
    this.colPanel.style.display = "none";
    COLS.forEach(function (c) {
      var label = document.createElement("label");
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = true;
      cb.onchange = function () {
        self.visibleCols[c.key] = cb.checked;
        self.refresh();
      };
      label.appendChild(cb);
      label.appendChild(document.createTextNode(" " + c.label_zh));
      self.colPanel.appendChild(label);
    });
    this.container.appendChild(this.colPanel);

    // 表格容器
    this.tableWrap = document.createElement("div");
    this.tableWrap.className = "pt-table-wrap";
    this.container.appendChild(this.tableWrap);
  };

  TableView.prototype._toggleColPanel = function () {
    this.colPanel.style.display = this.colPanel.style.display === "none" ? "block" : "none";
  };

  TableView.prototype._rowData = function () {
    var graph = PT.store.graph;
    if (!graph) return [];
    var modeId = PT.store.get("mode");
    var rows = [];
    graph.nodeList().forEach(function (n) {
      if (n.type === "passive_r" || n.type === "passive_l" || n.type === "passive_c") return;
      if (n.type === "seq_ctrl") return;
      var vout = PT.engine.nodeVout(n, modeId);
      var iTyp = (n.__calc && n.__calc.i_out_sum_ma) || 0;
      // typ 和 max 分别算
      var iMax = 0;
      var savedCalc = n.__calc;
      // 简化: max = i_typ × (max/typ 比例), 这里直接取 __calc (已是当前 stat)
      // 为了让表更精确, 我们重新分别计算
      var i_typ = 0, i_max = 0;
      var outs = graph.powerOutEdges(n.id);
      outs.forEach(function (e) {
        var toNode = graph.node(e.to);
        if (!toNode) return;
        if (!PT.engine.isOnInMode(toNode, modeId)) return;
        i_typ += PT.engine.loadCurrent(toNode, modeId, "typ");
        i_max += PT.engine.loadCurrent(toNode, modeId, "max");
      });
      // 加上自身负载
      if (n.type === "load" || n.type === "domain") {
        i_typ += PT.engine.loadCurrent(n, modeId, "typ");
        i_max += PT.engine.loadCurrent(n, modeId, "max");
      }

      // 负载列表
      var loadNames = [];
      outs.forEach(function (e) {
        var tn = graph.node(e.to);
        if (tn) loadNames.push(tn.name || tn.id);
      });

      var issues = PT.rules.issuesForNode(PT.store.issues, n.id);

      rows.push({
        id: n.id,
        name: n.name || "",
        type: n.type,
        part: n.part || n.refdes || "",
        vout: vout,
        i_typ: i_typ,
        i_max: i_max,
        imax: n.imax,
        util: (n.__calc && n.__calc.utilization) || null,
        vdrop_mv: n.__calc && n.__calc.end_voltage != null ?
          ((PT.engine.nodeVout(n, modeId) || 0) - n.__calc.end_voltage) * 1000 : null,
        loss_mw: (n.__calc && n.__calc.loss_mw) || null,
        loads: loadNames.join(", "),
        issues: issues.length,
        issueLevel: issues.reduce(function (m, i) {
          return i.level === "E" ? "E" : (i.level === "W" && m !== "E" ? "W" : m);
        }, null),
        tags: (n.tags || []).join(","),
        _node: n
      });
    });
    return rows;
  };

  TableView.prototype.refresh = function () {
    var self = this;
    var rows = this._rowData();

    // 排序
    var key = this.sortKey;
    var desc = this.sortDesc;
    rows.sort(function (a, b) {
      var va = a[key], vb = b[key];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") {
        return desc ? vb - va : va - vb;
      }
      return desc ? String(vb).localeCompare(String(va)) : String(va).localeCompare(String(vb));
    });

    // 渲染
    var html = "<table class='pt-table'><thead><tr>";
    COLS.forEach(function (c) {
      if (!self.visibleCols[c.key]) return;
      var cls = c.num ? " class='num'" : "";
      var arrow = (self.sortKey === c.key) ? (desc ? " ▼" : " ▲") : "";
      html += "<th data-key='" + c.key + "'" + cls + " style='min-width:" + c.w + "px'>" +
        PT.util.esc(c.label_zh) + arrow + "</th>";
    });
    html += "</tr></thead><tbody>";

    var selectedId = PT.store.get("selectedNodeId");
    rows.forEach(function (r) {
      var trCls = [];
      if (r.id === selectedId) trCls.push("selected");
      if (r.issueLevel === "E") trCls.push("row-err");
      else if (r.issueLevel === "W") trCls.push("row-warn");
      html += "<tr data-id='" + PT.util.esc(r.id) + "' class='" + trCls.join(" ") + "'>";
      COLS.forEach(function (c) {
        if (!self.visibleCols[c.key]) return;
        var v = r[c.key];
        var txt;
        if (c.num) {
          if (c.key === "util") txt = v != null ? PT.util.pct(v) : "—";
          else txt = v != null ? PT.util.fmt(v) : "—";
        } else {
          txt = v != null && v !== "" ? PT.util.esc(String(v)) : "—";
        }
        html += "<td" + (c.num ? " class='num'" : "") + ">" + txt + "</td>";
      });
      html += "</tr>";
    });
    html += "</tbody></table>";

    this.tableWrap.innerHTML = html;

    // 绑定排序
    var ths = this.tableWrap.querySelectorAll("th");
    ths.forEach(function (th) {
      th.onclick = function () {
        var k = th.getAttribute("data-key");
        if (self.sortKey === k) self.sortDesc = !self.sortDesc;
        else { self.sortKey = k; self.sortDesc = true; }
        self.refresh();
      };
    });

    // 绑定行点击
    var trs = this.tableWrap.querySelectorAll("tbody tr");
    trs.forEach(function (tr) {
      tr.onclick = function () {
        var id = tr.getAttribute("data-id");
        PT.store.set({ selectedNodeId: id });
        self.refresh();
      };
      tr.ondblclick = function () {
        var id = tr.getAttribute("data-id");
        PT.store.set({ view: "board", selectedNodeId: id, focusNodeId: id });
      };
    });
  };

  TableView.prototype._exportCsv = function () {
    var rows = this._rowData();
    var header = COLS.map(function (c) { return c.label_zh; });
    var lines = [header.join(",")];
    rows.forEach(function (r) {
      var line = COLS.map(function (c) {
        var v = r[c.key];
        if (v == null) return "";
        if (c.key === "util") return PT.util.pct(v);
        if (typeof v === "number") return PT.util.fmt(v);
        return '"' + String(v).replace(/"/g, '""') + '"';
      });
      lines.push(line.join(","));
    });
    var csv = "﻿" + lines.join("\r\n");  // BOM
    PT.util.download("power_tree_" + (PT.store.get("mode")) + ".csv", csv, "text/csv;charset=utf-8");
  };

  TableView.prototype.onShow = function () { this.refresh(); };
  TableView.prototype.onHide = function () {};

  PT.TableView = TableView;
})();
