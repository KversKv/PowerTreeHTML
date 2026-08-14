/* ============================================================
 * search.js — 搜索/过滤
 * 按 名称/id/net/型号/域/tag/电压区间/问题等级
 * 命中列表可跳转、可批量高亮
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;

  function SearchUI(container) {
    this.container = container;
    this._build();
  }

  SearchUI.prototype._build = function () {
    var self = this;

    this.input = document.createElement("input");
    this.input.className = "pt-search-input";
    this.input.placeholder = "搜索 / (名称 id net 型号 tag)";
    this.container.appendChild(this.input);

    this.resultPanel = document.createElement("div");
    this.resultPanel.className = "pt-search-results";
    this.resultPanel.style.display = "none";
    this.container.appendChild(this.resultPanel);

    var doSearch = PT.util.debounce(function () {
      self._run();
    }, 200);

    this.input.addEventListener("input", doSearch);
    this.input.addEventListener("focus", function () {
      if (self.input.value.trim()) self.resultPanel.style.display = "block";
    });
    this.input.addEventListener("blur", function () {
      setTimeout(function () { self.resultPanel.style.display = "none"; }, 200);
    });
    this.input.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") {
        var first = self.resultPanel.querySelector(".pt-search-item");
        if (first) first.click();
      } else if (ev.key === "Escape") {
        self.input.value = "";
        self._run();
      }
    });
  };

  SearchUI.prototype._run = function () {
    var q = this.input.value.trim().toLowerCase();
    var graph = PT.store.graph;
    this.resultPanel.innerHTML = "";
    if (!q || !graph) {
      this.resultPanel.style.display = "none";
      PT.store.set({ filter: PT.util.deepClone(PT.store.get("filter")) });  // 触发重绘
      return;
    }

    var matches = [];
    graph.nodeList().forEach(function (n) {
      var hay = [
        n.id, n.name, n.part, n.refdes, n.domain,
        (n.tags || []).join(" ")
      ].join(" ").toLowerCase();
      // net 也算 (通过出边)
      graph.powerOutEdges(n.id).forEach(function (e) {
        if (e.net) hay += " " + e.net.toLowerCase();
      });
      if (hay.indexOf(q) >= 0) matches.push(n);
    });

    if (!matches.length) {
      this.resultPanel.innerHTML = "<div class='pt-search-empty'>无匹配</div>";
      this.resultPanel.style.display = "block";
      return;
    }

    var self = this;
    matches.slice(0, 30).forEach(function (n) {
      var item = document.createElement("div");
      item.className = "pt-search-item";
      item.innerHTML = "<b>" + PT.util.esc(n.id) + "</b> " + PT.util.esc(n.name || "") +
        " <span class='pt-search-type'>" + n.type + "</span>";
      item.onclick = function () {
        PT.store.set({
          selectedNodeId: n.id,
          focusNodeId: n.id,
          view: "board"
        });
        self.resultPanel.style.display = "none";
      };
      self.resultPanel.appendChild(item);
    });

    // 批量高亮
    var btn = document.createElement("div");
    btn.className = "pt-search-highlight-all";
    btn.textContent = "高亮全部 " + matches.length + " 个";
    btn.onclick = function () {
      var ids = new Set(matches.map(function (n) { return n.id; }));
      var view = PT.app && PT.app.currentView && PT.app.currentView();
      if (view && view.renderer) {
        view.renderer.highlightNodeIds = ids;
        view.renderer.render(PT.store.graph, view.layoutData, {
          modeId: PT.store.get("mode"),
          colorBy: PT.store.get("colorBy"),
          issuesFor: function (nid) { return PT.rules.issuesForNode(PT.store.issues, nid); }
        });
      }
      self.resultPanel.style.display = "none";
    };
    this.resultPanel.appendChild(btn);

    this.resultPanel.style.display = "block";
  };

  SearchUI.prototype.focus = function () {
    this.input.focus();
    this.input.select();
  };

  PT.SearchUI = SearchUI;
})();
