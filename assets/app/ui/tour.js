/* ============================================================
 * tour.js — 首次使用引导 (自研轻量 Tour)
 * 遮罩 + 高亮 + 气泡分步讲解
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;

  var TOUR_KEY = "pt_tour_done_v1";

  var STEPS = [
    { sel: ".pt-view-switch",     zh: "在这里切换五个视图: 板级 / SoC 域 / 表格 / 时序 / 看板", en: "Switch views: Board / SoC / Table / Sequence / Dashboard" },
    { sel: ".pt-search-input",    zh: "按 / 键快速搜索任意 rail、器件、net、tag",              en: "Press / to search rails, parts, nets, tags" },
    { sel: ".pt-canvas-wrap",     zh: "点击任一节点查看右侧属性面板, 双击聚焦, Shift+拖框选", en: "Click node for detail, double-click to focus, Shift+drag to box-select" },
    { sel: ".pt-mode-select",     zh: "切换功耗模式查看 DVFS 与电流分布",                       en: "Switch power mode to see DVFS and current distribution" },
    { sel: ".pt-issues-panel",    zh: "问题清单一览, 点击可定位高亮",                          en: "Issues list, click to locate and highlight" },
    { sel: "[data-view=sequence]",zh: "时序视图检查上电/下电顺序违例",                          en: "Sequence view shows power-up/down violations" },
    { sel: ".pt-export-menu",     zh: "导出 SVG / PNG / CSV / Markdown / 打印",                en: "Export SVG / PNG / CSV / Markdown / Print" }
  ];

  function Tour() {
    this.step = 0;
    this.overlay = null;
    this.hole = null;
    this.bubble = null;
  }

  Tour.prototype.shouldShow = function () {
    try { return !localStorage.getItem(TOUR_KEY); } catch (e) { return true; }
  };

  Tour.prototype.markDone = function () {
    try { localStorage.setItem(TOUR_KEY, "1"); } catch (e) {}
  };

  Tour.prototype.start = function () {
    this.step = 0;
    this._render();
  };

  Tour.prototype._render = function () {
    var self = this;
    this._destroy();

    if (this.step >= STEPS.length) {
      this.markDone();
      return;
    }

    var s = STEPS[this.step];
    var target = document.querySelector(s.sel);
    if (!target) {
      // 跳过此步
      this.step++;
      this._render();
      return;
    }

    var rect = target.getBoundingClientRect();

    // 遮罩 (四周 4 块)
    this.overlay = document.createElement("div");
    this.overlay.className = "pt-tour-overlay";

    function shade(l, t, w, h) {
      var d = document.createElement("div");
      d.className = "pt-tour-shade";
      d.style.left = l + "px"; d.style.top = t + "px";
      d.style.width = w + "px"; d.style.height = h + "px";
      self.overlay.appendChild(d);
    }
    var vw = window.innerWidth, vh = window.innerHeight;
    shade(0, 0, vw, rect.top);                                                       // top
    shade(0, rect.bottom, vw, vh - rect.bottom);                                     // bottom
    shade(0, rect.top, rect.left, rect.height);                                      // left
    shade(rect.right, rect.top, vw - rect.right, rect.height);                       // right

    // 高亮框
    this.hole = document.createElement("div");
    this.hole.className = "pt-tour-hole";
    this.hole.style.left = (rect.left - 4) + "px";
    this.hole.style.top = (rect.top - 4) + "px";
    this.hole.style.width = (rect.width + 8) + "px";
    this.hole.style.height = (rect.height + 8) + "px";
    this.overlay.appendChild(this.hole);

    // 气泡
    this.bubble = document.createElement("div");
    this.bubble.className = "pt-tour-bubble";
    var lang = PT.store.get("lang") || "zh";
    this.bubble.innerHTML =
      "<div class='pt-tour-step'>" + (this.step + 1) + " / " + STEPS.length + "</div>" +
      "<div class='pt-tour-text'>" + PT.util.esc(lang === "en" ? s.en : s.zh) + "</div>" +
      "<div class='pt-tour-btns'>" +
        "<button class='pt-btn pt-btn-sm' data-act='skip'>" + (lang === "en" ? "Skip" : "跳过") + "</button>" +
        "<button class='pt-btn pt-btn-sm pt-btn-primary' data-act='next'>" + (this.step === STEPS.length - 1 ? (lang === "en" ? "Done" : "完成") : (lang === "en" ? "Next" : "下一步")) + "</button>" +
      "</div>";

    // 气泡位置: 优先下方, 不够则上方
    var bubbleW = 280, bubbleH = 130;
    var bx = rect.left, by = rect.bottom + 12;
    if (by + bubbleH > vh) by = rect.top - bubbleH - 12;
    if (bx + bubbleW > vw) bx = vw - bubbleW - 12;
    this.bubble.style.left = bx + "px";
    this.bubble.style.top = by + "px";
    this.overlay.appendChild(this.bubble);

    this.bubble.querySelector("[data-act=next]").onclick = function () {
      self.step++;
      self._render();
    };
    this.bubble.querySelector("[data-act=skip]").onclick = function () {
      self.markDone();
      self._destroy();
    };

    document.body.appendChild(this.overlay);
  };

  Tour.prototype._destroy = function () {
    if (this.overlay) {
      document.body.removeChild(this.overlay);
      this.overlay = null;
    }
  };

  PT.Tour = Tour;
})();
