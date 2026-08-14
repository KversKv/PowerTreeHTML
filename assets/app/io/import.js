/* ============================================================
 * import.js — 数据导入
 * 支持 .json / .data.js 拖入或选择
 * 沙箱化解析 + schema 校验 + 错误清单
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;

  function _showErrors(title, errors, warnings) {
    var overlay = document.createElement("div");
    overlay.className = "pt-modal-overlay";
    var box = document.createElement("div");
    box.className = "pt-modal-box";
    var h = document.createElement("h3");
    h.textContent = title;
    box.appendChild(h);

    function renderList(list, cls, icon) {
      if (!list || !list.length) return;
      var ul = document.createElement("ul");
      ul.className = "pt-import-list " + cls;
      list.forEach(function (e) {
        var li = document.createElement("li");
        li.textContent = icon + " " + (e.message || JSON.stringify(e));
        ul.appendChild(li);
      });
      box.appendChild(ul);
    }
    renderList(errors, "pt-import-errors", "✗");
    renderList(warnings, "pt-import-warnings", "⚠");

    var close = document.createElement("button");
    close.className = "pt-btn";
    close.textContent = "关闭";
    close.onclick = function () { document.body.removeChild(overlay); };
    box.appendChild(close);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  /**
   * 解析 .data.js 文本: 提取 PT.registerData("power_tree", {...})
   * 沙箱化: 用 Function 包装, 替换全局 PT
   */
  function parseDataJs(text) {
    var captured = null;
    var fakePT = {
      registerData: function (name, obj) {
        if (name === "power_tree") captured = obj;
      },
      registerEff: function () {}
    };
    try {
      var fn = new Function("PT", "window", "document", "self", text);
      fn(fakePT, {}, {}, {});
    } catch (e) {
      return { ok: false, error: "解析失败: " + e.message };
    }
    if (!captured) return { ok: false, error: "未找到 PT.registerData(\"power_tree\", ...)" };
    return { ok: true, data: captured };
  }

  /**
   * 解析 .json
   */
  function parseJson(text) {
    try {
      return { ok: true, data: JSON.parse(text) };
    } catch (e) {
      return { ok: false, error: "JSON 解析失败: " + e.message };
    }
  }

  /**
   * 导入文件
   */
  function importFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var text = reader.result;
      var result;
      if (/\.data\.js$/i.test(file.name)) {
        result = parseDataJs(text);
      } else {
        result = parseJson(text);
      }
      if (!result.ok) {
        _showErrors("导入失败", [{ message: result.error }], []);
        return;
      }
      // schema 校验
      var check = PT.schema.validate(result.data);
      if (!check.ok) {
        _showErrors("数据校验失败 (" + check.errors.length + " 错误)", check.errors, check.warnings);
        return;
      }
      if (check.warnings.length) {
        _showErrors("导入成功 (含 " + check.warnings.length + " 警告)", [], check.warnings);
      }
      PT.store.setData(check.data);
      PT.app.recalc();
    };
    reader.readAsText(file, "utf-8");
  }

  /** 触发文件选择 */
  function doImport() {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.js,.data.js";
    input.onchange = function () {
      if (input.files && input.files[0]) {
        importFile(input.files[0]);
      }
    };
    input.click();
  }

  /** 恢复内置样例 */
  function restoreSample() {
    var sample = PT.getData("power_tree");
    if (!sample) {
      alert("未找到内置样例");
      return;
    }
    var check = PT.schema.validate(sample);
    PT.store.setData(check.data);
    PT.app.recalc();
  }

  /** 绑定拖拽到容器 */
  function bindDropZone(el) {
    el.addEventListener("dragover", function (ev) {
      ev.preventDefault();
      el.classList.add("pt-drag-over");
    });
    el.addEventListener("dragleave", function () {
      el.classList.remove("pt-drag-over");
    });
    el.addEventListener("drop", function (ev) {
      ev.preventDefault();
      el.classList.remove("pt-drag-over");
      if (ev.dataTransfer.files && ev.dataTransfer.files[0]) {
        importFile(ev.dataTransfer.files[0]);
      }
    });
  }

  PT.importer = {
    doImport: doImport,
    importFile: importFile,
    restoreSample: restoreSample,
    bindDropZone: bindDropZone,
    parseDataJs: parseDataJs,
    parseJson: parseJson
  };
})();
