/* ============================================================
 * export-svg.js — 导出 SVG
 * 样式内联, 无外链, 可再编辑
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;

  function exportSvg(svgEl, filename) {
    if (!svgEl) return;
    // 克隆并内联样式
    var clone = svgEl.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

    // 内联基础样式
    var style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = `
      .pt-node-card { stroke-width: 1.5; }
      .pt-node-title { font-family: system-ui, sans-serif; }
      .pt-node-sub { font-family: system-ui, sans-serif; }
      text { font-family: system-ui, sans-serif; }
      .pt-edge { fill: none; }
      .pt-edge-hit { display: none; }
      .pt-pair-link { stroke-dasharray: 6,3; opacity: 0.9; }
      .pt-pair-link-dot { stroke: #fff; stroke-width: 1; }
      .pt-watermark { font-family: system-ui, sans-serif; }
    `;
    clone.insertBefore(style, clone.firstChild);

    // 设置背景
    var bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("width", "100%");
    bg.setAttribute("height", "100%");
    bg.setAttribute("fill", "#ffffff");
    clone.insertBefore(bg, clone.firstChild);

    // 计算 viewBox
    var bbox = null;
    try {
      bbox = svgEl.getBBox();
    } catch (e) {
      // getBBox 在未挂载时失败, 用 viewBox 兜底
    }
    if (bbox && bbox.width > 0) {
      var pad = 40;
      clone.setAttribute("viewBox",
        (bbox.x - pad) + " " + (bbox.y - pad) + " " +
        (bbox.width + pad * 2) + " " + (bbox.height + pad * 2));
      clone.setAttribute("width", bbox.width + pad * 2);
      clone.setAttribute("height", bbox.height + pad * 2);
    }

    // 页脚保密声明
    var cfg = PT.store.config || {};
    var legal = cfg.legal || {};
    var lang = PT.store.get("lang") || "zh";
    var footerText = (legal.footer && legal.footer[lang]) || PT.i18n.t("footer_legal");
    if (bbox && footerText) {
      var footer = document.createElementNS("http://www.w3.org/2000/svg", "text");
      footer.setAttribute("x", bbox.x);
      footer.setAttribute("y", bbox.y + bbox.height + 60);
      footer.setAttribute("font-size", 10);
      footer.setAttribute("fill", "#c62828");
      footer.textContent = footerText;
      clone.appendChild(footer);
    }

    var serializer = new XMLSerializer();
    var str = serializer.serializeToString(clone);
    PT.util.download(filename || "power_tree.svg", str, "image/svg+xml;charset=utf-8");
  }

  PT.exportSvg = exportSvg;
})();
