/* ============================================================
 * toolbar.js — 顶栏
 * 视图切换 / 语言 / 主题 / 模式 / typ-max / 控制边 / 配色 / 导出 / 帮助
 * 快捷键速查弹层
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;

  var VIEWS = [
    { id: "board",     icon: "▦", key: "1" },
    { id: "soc",       icon: "◈", key: "2" },
    { id: "table",     icon: "≡", key: "3" },
    { id: "sequence",  icon: "∿", key: "4" },
    { id: "dashboard", icon: "▤", key: "5" }
  ];

  var COLOR_BY = [
    { id: "util",    zh: "利用率",   en: "Util" },
    { id: "voltage", zh: "电压",     en: "Voltage" },
    { id: "domain",  zh: "电源域",   en: "Domain" },
    { id: "type",    zh: "类型",     en: "Type" },
    { id: "issue",   zh: "问题",     en: "Issue" },
    { id: "pmic",    zh: "PMIC",     en: "PMIC" }
  ];

  function Toolbar(container, opts) {
    this.container = container;
    this.opts = opts || {};
    this._build();
    PT.on("state:changed", this.refresh.bind(this));
    PT.on("rules:done", this.refreshIssueCount.bind(this));
  }

  Toolbar.prototype._build = function () {
    var self = this;
    this.container.classList.add("pt-toolbar");

    // ---- Logo ----
    var logo = document.createElement("div");
    logo.className = "pt-logo";
    logo.innerHTML = "<span class='pt-logo-icon'>⚡</span><span class='pt-logo-text'>PowerTree</span>";
    this.container.appendChild(logo);

    // ---- 视图切换 ----
    var viewSwitch = document.createElement("div");
    viewSwitch.className = "pt-view-switch";
    VIEWS.forEach(function (v) {
      var btn = document.createElement("button");
      btn.className = "pt-view-btn";
      btn.setAttribute("data-view", v.id);
      btn.title = v.key;
      btn.innerHTML = "<span class='pt-view-icon'>" + v.icon + "</span><span class='pt-view-label' data-i18n='view_" + v.id + "'></span>";
      btn.onclick = function () { PT.store.set({ view: v.id }); };
      viewSwitch.appendChild(btn);
    });
    this.container.appendChild(viewSwitch);

    // ---- 搜索 ----
    var searchWrap = document.createElement("div");
    searchWrap.className = "pt-search-wrap";
    this.searchUI = new PT.SearchUI(searchWrap);
    this.container.appendChild(searchWrap);

    // ---- 右侧控件组 ----
    var right = document.createElement("div");
    right.className = "pt-toolbar-right";

    // 模式
    var modeSel = document.createElement("select");
    modeSel.className = "pt-select pt-mode-select";
    modeSel.title = "模式";
    modeSel.onchange = function () { PT.store.set({ mode: modeSel.value }); };
    right.appendChild(modeSel);
    this.modeSel = modeSel;

    // typ/max
    var statSel = document.createElement("select");
    statSel.className = "pt-select";
    statSel.innerHTML = "<option value='typ'>typ</option><option value='max'>max</option>";
    statSel.onchange = function () { PT.store.set({ stat: statSel.value }); };
    right.appendChild(statSel);
    this.statSel = statSel;

    // 配色
    var colorSel = document.createElement("select");
    colorSel.className = "pt-select";
    COLOR_BY.forEach(function (c) {
      var o = document.createElement("option");
      o.value = c.id;
      o.textContent = c.zh;
      colorSel.appendChild(o);
    });
    colorSel.onchange = function () { PT.store.set({ colorBy: colorSel.value }); };
    right.appendChild(colorSel);
    this.colorSel = colorSel;

    // 控制边
    var ctlBtn = document.createElement("button");
    ctlBtn.className = "pt-btn pt-toggle";
    ctlBtn.textContent = "控制边";
    ctlBtn.onclick = function () {
      PT.store.set({ controlEdgeVisible: !PT.store.get("controlEdgeVisible") });
    };
    right.appendChild(ctlBtn);
    this.ctlBtn = ctlBtn;

    // 问题检测 (Error/Warning 规则总开关, 默认关闭)
    var issBtn = document.createElement("button");
    issBtn.className = "pt-btn pt-toggle";
    issBtn.textContent = "问题检测";
    issBtn.title = "开启后按规则检查 Error/Warning 并在节点上标注";
    issBtn.onclick = function () {
      PT.store.set({ issueCheckEnabled: !PT.store.get("issueCheckEnabled") });
    };
    right.appendChild(issBtn);
    this.issBtn = issBtn;

    // Fit
    var fitBtn = document.createElement("button");
    fitBtn.className = "pt-btn";
    fitBtn.textContent = "适应";
    fitBtn.title = "f";
    fitBtn.onclick = function () {
      if (PT.app && PT.app.currentView() && PT.app.currentView().fit) {
        PT.app.currentView().fit();
      }
    };
    right.appendChild(fitBtn);

    // 折叠/展开
    var expBtn = document.createElement("button");
    expBtn.className = "pt-btn";
    expBtn.textContent = "展开";
    expBtn.title = "e";
    expBtn.onclick = function () { PT.grouping.expandAll(PT.store); };
    right.appendChild(expBtn);

    var colBtn = document.createElement("button");
    colBtn.className = "pt-btn";
    colBtn.textContent = "折叠";
    colBtn.title = "c";
    colBtn.onclick = function () { PT.grouping.collapseAll(PT.store); };
    right.appendChild(colBtn);

    // 导出菜单
    var exportWrap = document.createElement("div");
    exportWrap.className = "pt-export-menu";
    var exportBtn = document.createElement("button");
    exportBtn.className = "pt-btn";
    exportBtn.textContent = "导出 ▾";
    exportWrap.appendChild(exportBtn);
    var exportList = document.createElement("div");
    exportList.className = "pt-dropdown";
    exportList.innerHTML =
      "<div class='pt-dropdown-item' data-exp='svg'>导出 SVG</div>" +
      "<div class='pt-dropdown-item' data-exp='png2'>导出 PNG (2x)</div>" +
      "<div class='pt-dropdown-item' data-exp='png4'>导出 PNG (4x)</div>" +
      "<div class='pt-dropdown-item' data-exp='csv'>导出 CSV</div>" +
      "<div class='pt-dropdown-item' data-exp='md'>导出 Markdown</div>" +
      (PT.store.get("editorMode") ?
        "<div class='pt-dropdown-item' data-exp='json'>导出 JSON</div>" +
        "<div class='pt-dropdown-item' data-exp='datajs'>导出 data.js</div>" : "") +
      "<div class='pt-dropdown-item' data-exp='print'>打印</div>";
    exportWrap.appendChild(exportList);
    exportBtn.onclick = function (ev) {
      ev.stopPropagation();
      exportList.classList.toggle("show");
    };
    document.addEventListener("click", function () {
      exportList.classList.remove("show");
    });
    exportList.addEventListener("click", function (ev) {
      var act = ev.target.getAttribute("data-exp");
      if (!act) return;
      exportList.classList.remove("show");
      if (PT.io && PT.io.doExport) PT.io.doExport(act);
    });
    right.appendChild(exportWrap);

    // 导入
    var importBtn = document.createElement("button");
    importBtn.className = "pt-btn";
    importBtn.textContent = "导入";
    importBtn.onclick = function () { if (PT.io && PT.io.doImport) PT.io.doImport(); };
    right.appendChild(importBtn);

    // 复制链接
    var linkBtn = document.createElement("button");
    linkBtn.className = "pt-btn";
    linkBtn.textContent = "🔗";
    linkBtn.title = "复制视图链接";
    linkBtn.onclick = function () {
      var link = PT.urlState.currentLink(PT.store.state);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(function () {
          linkBtn.textContent = "✓";
          setTimeout(function () { linkBtn.textContent = "🔗"; }, 1200);
        });
      } else {
        // 兼容 file:// 无 clipboard 权限
        var ta = document.createElement("textarea");
        ta.value = link;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); } catch (e) {}
        document.body.removeChild(ta);
        linkBtn.textContent = "✓";
        setTimeout(function () { linkBtn.textContent = "🔗"; }, 1200);
      }
    };
    right.appendChild(linkBtn);

    // 主题
    var themeBtn = document.createElement("button");
    themeBtn.className = "pt-btn pt-toggle";
    themeBtn.textContent = "🌙";
    themeBtn.title = "t";
    themeBtn.onclick = function () {
      PT.store.set({ theme: PT.store.get("theme") === "dark" ? "light" : "dark" });
    };
    right.appendChild(themeBtn);
    this.themeBtn = themeBtn;

    // 语言
    var langBtn = document.createElement("button");
    langBtn.className = "pt-btn";
    langBtn.textContent = "EN";
    langBtn.onclick = function () {
      PT.store.set({ lang: PT.store.get("lang") === "zh" ? "en" : "zh" });
    };
    right.appendChild(langBtn);
    this.langBtn = langBtn;

    // 问题计数
    var issueCount = document.createElement("div");
    issueCount.className = "pt-issue-count";
    right.appendChild(issueCount);
    this.issueCount = issueCount;

    // 引导
    var tourBtn = document.createElement("button");
    tourBtn.className = "pt-btn";
    tourBtn.textContent = "?";
    tourBtn.title = "使用引导";
    tourBtn.onclick = function () {
      var t = new PT.Tour();
      t.start();
    };
    right.appendChild(tourBtn);

    // 快捷键速查
    var kbBtn = document.createElement("button");
    kbBtn.className = "pt-btn";
    kbBtn.textContent = "⌨";
    kbBtn.title = "快捷键";
    kbBtn.onclick = function () { self._showShortcuts(); };
    right.appendChild(kbBtn);

    // 关于
    var aboutBtn = document.createElement("button");
    aboutBtn.className = "pt-btn";
    aboutBtn.textContent = "ⓘ";
    aboutBtn.onclick = function () { PT.legal.showAbout(); };
    right.appendChild(aboutBtn);

    // 版本徽标
    var verBadge = document.createElement("div");
    verBadge.className = "pt-version-badge";
    var meta = (PT.store.rawData && PT.store.rawData.meta) || {};
    verBadge.textContent = meta.version || "—";
    verBadge.title = (meta.project || "") + "\n" + (meta.changelog || "");
    right.appendChild(verBadge);

    this.container.appendChild(right);
    this.refresh();
  };

  Toolbar.prototype._showShortcuts = function () {
    var shortcuts = [
      ["/", "搜索聚焦"],
      ["f", "适应整图"],
      ["e", "展开全部"],
      ["c", "折叠全部"],
      ["t", "切换主题"],
      ["1~5", "切换视图"],
      ["Esc", "清除选中"],
      ["Shift+拖", "框选"],
      ["双击节点", "聚焦"],
      ["双击空白", "清除聚焦"]
    ];
    var overlay = document.createElement("div");
    overlay.className = "pt-modal-overlay";
    var box = document.createElement("div");
    box.className = "pt-modal-box";
    var h = document.createElement("h3");
    h.textContent = "快捷键";
    box.appendChild(h);
    var tbl = document.createElement("table");
    tbl.className = "pt-shortcut-table";
    shortcuts.forEach(function (s) {
      var tr = document.createElement("tr");
      tr.innerHTML = "<td><kbd>" + PT.util.esc(s[0]) + "</kbd></td><td>" + PT.util.esc(s[1]) + "</td>";
      tbl.appendChild(tr);
    });
    box.appendChild(tbl);
    var close = document.createElement("button");
    close.className = "pt-btn";
    close.textContent = "关闭";
    close.onclick = function () { document.body.removeChild(overlay); };
    box.appendChild(close);
    overlay.appendChild(box);
    overlay.onclick = function (ev) { if (ev.target === overlay) document.body.removeChild(overlay); };
    document.body.appendChild(overlay);
  };

  Toolbar.prototype.refresh = function () {
    var state = PT.store.state;
    // 视图按钮激活态
    var btns = this.container.querySelectorAll(".pt-view-btn");
    btns.forEach(function (b) {
      if (b.getAttribute("data-view") === state.view) b.classList.add("active");
      else b.classList.remove("active");
    });

    // i18n 标签
    var labels = this.container.querySelectorAll("[data-i18n]");
    labels.forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      el.textContent = PT.i18n.t(key);
    });

    // 模式下拉
    var modes = (PT.store.rawData && PT.store.rawData.modes) || [];
    if (this.modeSel.options.length !== modes.length) {
      this.modeSel.innerHTML = "";
      modes.forEach(function (m) {
        var o = document.createElement("option");
        o.value = m.id;
        o.textContent = m.name_zh || m.id;
        this.modeSel.appendChild(o);
      }, this);
    }
    this.modeSel.value = state.mode;
    this.statSel.value = state.stat;
    this.colorSel.value = state.colorBy;

    // 主题/控制边按钮
    this.themeBtn.textContent = state.theme === "dark" ? "☀" : "🌙";
    document.body.classList.toggle("pt-theme-dark", state.theme === "dark");
    if (state.controlEdgeVisible) this.ctlBtn.classList.add("active");
    else this.ctlBtn.classList.remove("active");
    if (state.issueCheckEnabled) this.issBtn.classList.add("active");
    else this.issBtn.classList.remove("active");
    this.langBtn.textContent = state.lang === "zh" ? "EN" : "中";

    this.refreshIssueCount();
  };

  Toolbar.prototype.refreshIssueCount = function () {
    var counts = PT.rules.countByLevel(PT.store.issues);
    this.issueCount.innerHTML =
      "<span class='pt-issue-badge pt-issue-E'>E " + counts.E + "</span>" +
      "<span class='pt-issue-badge pt-issue-W'>W " + counts.W + "</span>" +
      "<span class='pt-issue-badge pt-issue-I'>I " + counts.I + "</span>";
  };

  PT.Toolbar = Toolbar;
})();
