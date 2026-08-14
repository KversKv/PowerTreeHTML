/* ============================================================
 * boot.js — 应用引导
 * 加载顺序: vendor → core → engine → rules → layout → render → views → ui → io → data → boot
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;

  var views = {};
  var toolbar = null;
  var detailPanel = null;
  var issuesPanel = null;

  function currentView() {
    return views[PT.store.get("view")] || views.board;
  }

  /** 重算 + 重校核 + 重渲染 */
  function recalc() {
    var graph = PT.store.graph;
    if (!graph) return;
    var modeId = PT.store.get("mode");
    var statKey = PT.store.statKey();
    PT.engine.runAll(graph, modeId, { statKey: statKey });
    PT.rules.runAll(graph, modeId, PT.store.config || {});
    renderCurrentView();
  }

  /** 渲染当前视图 */
  function renderCurrentView() {
    var viewId = PT.store.get("view");
    Object.keys(views).forEach(function (k) {
      var el = document.getElementById("pt-view-" + k);
      if (el) el.style.display = (k === viewId) ? "" : "none";
    });
    var v = currentView();
    if (v && v.onShow) v.onShow();
    if (detailPanel) detailPanel.refresh();
    if (issuesPanel) issuesPanel.refresh();
  }

  /** 应用 URL hash 状态 */
  function applyUrlState() {
    var patch = PT.urlState.load();
    if (Object.keys(patch).length) {
      PT.store.set(patch);
    }
  }

  /** 订阅状态变更, 写入 URL */
  function bindUrlPersist() {
    var save = PT.util.debounce(function () {
      PT.urlState.save(PT.store.state);
    }, 300);
    PT.on("state:changed", save);
  }

  /** 快捷键 */
  function bindShortcuts() {
    document.addEventListener("keydown", function (ev) {
      // 输入框中不响应
      var tag = (ev.target && ev.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        if (ev.key === "Escape") ev.target.blur();
        return;
      }
      var view = currentView();
      switch (ev.key) {
        case "/":
          ev.preventDefault();
          if (toolbar && toolbar.searchUI) toolbar.searchUI.focus();
          break;
        case "f":
          if (view && view.fit) view.fit();
          break;
        case "e":
          PT.grouping.expandAll(PT.store);
          break;
        case "c":
          PT.grouping.collapseAll(PT.store);
          break;
        case "t":
          PT.store.set({ theme: PT.store.get("theme") === "dark" ? "light" : "dark" });
          break;
        case "1": PT.store.set({ view: "board" }); break;
        case "2": PT.store.set({ view: "soc" }); break;
        case "3": PT.store.set({ view: "table" }); break;
        case "4": PT.store.set({ view: "sequence" }); break;
        case "5": PT.store.set({ view: "dashboard" }); break;
        case "Escape":
          PT.store.set({ selectedNodeId: null, focusNodeId: null });
          if (view && view.renderer) {
            view.renderer.selectedNodeIds.clear();
            view.renderer.highlightNodeIds = null;
            view.renderer._refreshSelection();
            view.renderer.highlightPath(null);
          }
          break;
      }
    });
  }

  /** 状态变化 → 重渲染 */
  function bindStateWatch() {
    var renderKeys = ["view", "mode", "stat", "colorBy", "controlEdgeVisible",
      "collapsedGroups", "focusNodeId", "focusHops", "filter",
      "showSwimlane", "showInlinePassive", "lang"];
    PT.on("state:changed", function (ev) {
      var needRender = ev.keys.some(function (k) {
        return renderKeys.indexOf(k) >= 0 || k === "*";
      });
      if (needRender) {
        if (ev.keys.indexOf("mode") >= 0 || ev.keys.indexOf("stat") >= 0) {
          recalc();
        } else {
          renderCurrentView();
        }
      } else if (ev.keys.indexOf("selectedNodeId") >= 0) {
        var v = currentView();
        if (v && v.renderer) {
          var sel = PT.store.get("selectedNodeId");
          v.renderer.selectedNodeIds.clear();
          if (sel) v.renderer.selectedNodeIds.add(sel);
          v.renderer._refreshSelection();
          v.renderer.highlightPath(sel);
        }
        if (detailPanel) detailPanel.refresh();
      } else if (ev.keys.indexOf("theme") >= 0) {
        // 仅切换 css class
        document.body.classList.toggle("pt-theme-dark", PT.store.get("theme") === "dark");
      }
    });

    PT.on("data:loaded", function () {
      recalc();
    });

    PT.on("engine:done", function () {
      // engine 完成后重算规则
    });
  }

  /** 构建 DOM 骨架 */
  function buildSkeleton(rootId) {
    var root = document.getElementById(rootId || "pt-app");
    if (!root) {
      root = document.createElement("div");
      root.id = rootId || "pt-app";
      document.body.appendChild(root);
    }
    root.innerHTML = "";

    // 顶栏
    var toolbarEl = document.createElement("div");
    toolbarEl.id = "pt-toolbar";
    root.appendChild(toolbarEl);

    // 主体
    var main = document.createElement("div");
    main.className = "pt-main";
    root.appendChild(main);

    // 视图容器
    var viewWrap = document.createElement("div");
    viewWrap.className = "pt-view-wrap";
    main.appendChild(viewWrap);

    ["board", "soc", "table", "sequence", "dashboard"].forEach(function (v) {
      var el = document.createElement("div");
      el.id = "pt-view-" + v;
      el.className = "pt-view-container";
      el.style.display = "none";
      viewWrap.appendChild(el);
    });

    // 右侧栏
    var sidebar = document.createElement("div");
    sidebar.className = "pt-sidebar";
    main.appendChild(sidebar);

    // 属性面板
    var detailEl = document.createElement("div");
    detailEl.id = "pt-detail";
    sidebar.appendChild(detailEl);

    // 问题清单
    var issuesEl = document.createElement("div");
    issuesEl.id = "pt-issues";
    issuesEl.className = "pt-issues-panel";
    sidebar.appendChild(issuesEl);

    // 页脚
    var footer = document.createElement("div");
    footer.className = "pt-footer";
    footer.id = "pt-footer";
    root.appendChild(footer);

    return { toolbarEl: toolbarEl, detailEl: detailEl, issuesEl: issuesEl, footerEl: footer };
  }

  /** 启动 */
  function start(opts) {
    opts = opts || {};
    var rootId = opts.rootId || "pt-app";

    // 1. 装载数据
    var config = PT.getData("config") || {};
    var rawTree = PT.getData("power_tree");
    if (!rawTree) {
      document.body.innerHTML = "<div style='padding:40px;color:#c62828;font-family:sans-serif'>错误: 未找到 data/power_tree.data.js</div>";
      return;
    }

    // 2. Schema 校验
    var check = PT.schema.validate(rawTree);
    if (!check.ok) {
      document.body.innerHTML = "<div style='padding:40px;font-family:sans-serif'><h3 style='color:#c62828'>数据校验失败</h3><pre>" +
        PT.util.esc(JSON.stringify(check.errors, null, 2)) + "</pre></div>";
      return;
    }
    if (check.warnings.length) {
      console.warn("[PT] 数据警告:", check.warnings);
    }

    // 3. store 初始化
    PT.store.init(check.data, config);
    PT.store.set({ editorMode: !!opts.editorMode });

    // 4. URL 状态恢复 (优先于 config 默认)
    applyUrlState();

    // 5. 构建 DOM
    var sk = buildSkeleton(rootId);
    PT.legal.renderFooter(sk.footerEl);

    // 6. 工具栏
    toolbar = new PT.Toolbar(sk.toolbarEl);

    // 7. 属性面板 + 问题面板
    detailPanel = new PT.DetailPanel(sk.detailEl);
    issuesPanel = new PT.IssuesPanel(sk.issuesEl);

    // 8. 视图
    views.board = new PT.BoardView(document.getElementById("pt-view-board"));
    views.soc = new PT.SocView(document.getElementById("pt-view-soc"));
    views.table = new PT.TableView(document.getElementById("pt-view-table"));
    views.sequence = new PT.SequenceView(document.getElementById("pt-view-sequence"));
    views.dashboard = new PT.DashboardView(document.getElementById("pt-view-dashboard"));

    // 9. 快捷键 + URL + 状态
    bindShortcuts();
    bindUrlPersist();
    bindStateWatch();

    // 10. 拖拽导入
    PT.importer.bindDropZone(document.body);

    // 11. 初次计算 + 渲染
    recalc();

    // 12. NDA → Tour
    if (PT.legal.needNda()) {
      PT.legal.showNda(function () {
        var tour = new PT.Tour();
        if (tour.shouldShow()) tour.start();
      });
    } else {
      var tour = new PT.Tour();
      if (tour.shouldShow()) tour.start();
    }

    // 暴露
    PT.app = {
      currentView: currentView,
      recalc: recalc,
      renderCurrentView: renderCurrentView,
      views: views
    };
  }

  PT.start = start;
})();
