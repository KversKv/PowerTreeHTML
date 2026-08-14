/* ============================================================
 * export-png.js — 导出 PNG
 * SVG → data URL → canvas → PNG (2x/4x)
 * 禁用 foreignObject 保证不被污染
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;

  function exportPng(svgEl, scale, filename) {
    if (!svgEl) return;
    scale = scale || 2;

    // 克隆并准备
    var clone = svgEl.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

    // 内联样式
    var style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = "text { font-family: system-ui, -apple-system, sans-serif; }";
    clone.insertBefore(style, clone.firstChild);

    // 计算尺寸
    var bbox = null;
    try { bbox = svgEl.getBBox(); } catch (e) {}
    var width = 800, height = 600;
    if (bbox && bbox.width > 0) {
      var pad = 40;
      width = bbox.width + pad * 2;
      height = bbox.height + pad * 2;
      clone.setAttribute("viewBox",
        (bbox.x - pad) + " " + (bbox.y - pad) + " " + width + " " + height);
    }
    clone.setAttribute("width", width * scale);
    clone.setAttribute("height", height * scale);

    // 白底
    var bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("x", bbox ? bbox.x - 40 : 0);
    bg.setAttribute("y", bbox ? bbox.y - 40 : 0);
    bg.setAttribute("width", width);
    bg.setAttribute("height", height);
    bg.setAttribute("fill", "#ffffff");
    clone.insertBefore(bg, clone.firstChild);

    var serializer = new XMLSerializer();
    var svgStr = serializer.serializeToString(clone);
    var svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    var url = URL.createObjectURL(svgBlob);

    var img = new Image();
    img.onload = function () {
      var canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      var ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      canvas.toBlob(function (blob) {
        if (!blob) return;
        var dlUrl = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = dlUrl;
        a.download = filename || ("power_tree_" + scale + "x.png");
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
          document.body.removeChild(a);
          URL.revokeObjectURL(dlUrl);
        }, 50);
      }, "image/png");
    };
    img.onerror = function (e) {
      URL.revokeObjectURL(url);
      alert("PNG 导出失败: SVG 序列化或渲染出错");
      console.error(e);
    };
    img.src = url;
  }

  PT.exportPng = exportPng;
})();
