/* ============================================================
 * export.js — 导出统一入口
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;

  function doExport(kind) {
    var view = PT.app && PT.app.currentView && PT.app.currentView();
    var svgEl = null;
    if (view && view.renderer && view.renderer.svg) {
      svgEl = view.renderer.svg;
    }

    switch (kind) {
      case "svg":
        if (svgEl) PT.exportSvg(svgEl, "power_tree.svg");
        break;
      case "png2":
        if (svgEl) PT.exportPng(svgEl, 2, "power_tree_2x.png");
        break;
      case "png4":
        if (svgEl) PT.exportPng(svgEl, 4, "power_tree_4x.png");
        break;
      case "csv":
        PT.exportCsv.budget();
        break;
      case "csv_issues":
        PT.exportCsv.issues();
        break;
      case "md":
        PT.exportCsv.issuesMd();
        break;
      case "json":
        PT.exportJson.exportJson();
        break;
      case "datajs":
        PT.exportJson.exportDataJs();
        break;
      case "print":
        window.print();
        break;
    }
  }

  function doImport() {
    PT.importer.doImport();
  }

  PT.io = {
    doExport: doExport,
    doImport: doImport
  };
})();
