/* ============================================================
 * issues.js — 问题清单面板
 * 点击定位并高亮
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;

  function IssuesPanel(container) {
    this.container = container;
    this._build();
    PT.on("rules:done", this.refresh.bind(this));
  }

  IssuesPanel.prototype._build = function () {
    this.header = document.createElement("div");
    this.header.className = "pt-issues-header";
    this.container.appendChild(this.header);

    this.list = document.createElement("div");
    this.list.className = "pt-issues-list";
    this.container.appendChild(this.list);
  };

  IssuesPanel.prototype.refresh = function () {
    var issues = PT.store.issues || [];
    var counts = PT.rules.countByLevel(issues);
    var lang = PT.store.get("lang") || "zh";

    this.header.innerHTML =
      "<span class='pt-issue-badge pt-issue-E'>E " + counts.E + "</span>" +
      "<span class='pt-issue-badge pt-issue-W'>W " + counts.W + "</span>" +
      "<span class='pt-issue-badge pt-issue-I'>I " + counts.I + "</span>";

    this.list.innerHTML = "";
    if (!issues.length) {
      this.list.innerHTML = "<div class='pt-empty'>无问题</div>";
      return;
    }

    // 排序: E > W > I
    var sorted = issues.slice().sort(function (a, b) {
      var lv = { E: 0, W: 1, I: 2 };
      return (lv[a.level] || 3) - (lv[b.level] || 3);
    });

    sorted.forEach(function (iss) {
      var item = document.createElement("div");
      item.className = "pt-issue-item pt-issue-" + iss.level;
      var msg = (lang === "en" ? iss.message_en : iss.message_zh) || iss.message_zh;
      var fix = (lang === "en" ? iss.fix_en : iss.fix_zh) || iss.fix_zh;
      item.innerHTML =
        "<div class='pt-issue-head'>" +
          "<span class='pt-issue-level'>" + iss.level + "</span>" +
          "<span class='pt-issue-rule'>" + PT.util.esc(iss.ruleId) + "</span>" +
          (iss.nodeId ? "<span class='pt-issue-node'>" + PT.util.esc(iss.nodeId) + "</span>" : "") +
        "</div>" +
        "<div class='pt-issue-msg'>" + PT.util.esc(msg) + "</div>" +
        (fix ? "<div class='pt-issue-fix'>→ " + PT.util.esc(fix) + "</div>" : "");
      if (iss.nodeId) {
        item.style.cursor = "pointer";
        item.onclick = function () {
          PT.store.set({
            view: "board",
            selectedNodeId: iss.nodeId,
            focusNodeId: iss.nodeId
          });
        };
      }
      this.list.appendChild(item);
    }, this);
  };

  PT.IssuesPanel = IssuesPanel;
})();
