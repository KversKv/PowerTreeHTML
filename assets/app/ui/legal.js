/* ============================================================
 * legal.js — NDA 弹窗 / 水印文案 / 关于弹层
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;

  var NDA_KEY = "pt_nda_accepted_v1";

  function _meta() {
    return (PT.store.rawData && PT.store.rawData.meta) || {};
  }

  function _cfg() {
    return PT.store.config || {};
  }

  /** 是否需要弹 NDA */
  function needNda() {
    var cfg = _cfg();
    if (cfg.nda && cfg.nda.force) return true;
    try {
      return !localStorage.getItem(NDA_KEY);
    } catch (e) {
      return true;
    }
  }

  function acceptNda() {
    try { localStorage.setItem(NDA_KEY, "1"); } catch (e) {}
  }

  /** 显示 NDA 弹窗 */
  function showNda(onAccept) {
    var cfg = _cfg();
    var meta = _meta();
    var lang = PT.store.get("lang") || "zh";
    var ndaCfg = cfg.nda || {};

    var overlay = document.createElement("div");
    overlay.className = "pt-nda-overlay";
    var box = document.createElement("div");
    box.className = "pt-nda-box";

    var title = document.createElement("h2");
    title.textContent = (ndaCfg.title && ndaCfg.title[lang]) || PT.i18n.t("nda_title");
    box.appendChild(title);

    var body = document.createElement("div");
    body.className = "pt-nda-body";
    var bodyText = (ndaCfg.body && ndaCfg.body[lang]) || PT.i18n.t("nda_body");
    // 支持 \n\n 分段
    bodyText.split(/\n\s*\n/).forEach(function (p) {
      var para = document.createElement("p");
      para.textContent = p;
      body.appendChild(para);
    });
    // 附加项目信息
    var info = document.createElement("p");
    info.className = "pt-nda-meta";
    info.textContent = (meta.project || "") + "  ·  " + (meta.version || "") + "  ·  " + (meta.date || "");
    body.appendChild(info);
    box.appendChild(body);

    var btn = document.createElement("button");
    btn.className = "pt-btn pt-btn-primary";
    btn.textContent = PT.i18n.t("nda_agree");
    btn.onclick = function () {
      acceptNda();
      document.body.removeChild(overlay);
      if (onAccept) onAccept();
    };
    box.appendChild(btn);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  /** 关于弹层 */
  function showAbout() {
    var meta = _meta();
    var cfg = _cfg();
    var lang = PT.store.get("lang") || "zh";
    var legal = cfg.legal || {};

    var overlay = document.createElement("div");
    overlay.className = "pt-modal-overlay";
    var box = document.createElement("div");
    box.className = "pt-modal-box";

    var h = document.createElement("h3");
    h.textContent = PT.i18n.t("about");
    box.appendChild(h);

    function row(label, value) {
      var div = document.createElement("div");
      div.className = "pt-about-row";
      div.innerHTML = "<span class='pt-about-label'>" + PT.util.esc(label) + "</span>" +
        "<span class='pt-about-value'>" + PT.util.esc(value || "—") + "</span>";
      box.appendChild(div);
    }

    row("项目 / Project", meta.project);
    row("数据版本 / Data Version", meta.version);
    row("数据日期 / Date", meta.date);
    row("Schema", meta.schema_version);
    row("Commit", meta.commit);
    row("作者 / Author", meta.author);
    row("构建 / Build", (PT.BUILD && PT.BUILD.version) + " · " + (PT.BUILD && PT.BUILD.date));
    row("联系人 / Contact", (legal.contact && legal.contact[lang]) || (legal.contact || {}).zh);

    if (meta.changelog) {
      var ch = document.createElement("div");
      ch.className = "pt-about-changelog";
      ch.textContent = meta.changelog;
      box.appendChild(ch);
    }

    var disclaimer = document.createElement("div");
    disclaimer.className = "pt-about-disclaimer";
    disclaimer.textContent = (legal.disclaimer && legal.disclaimer[lang]) || "";
    box.appendChild(disclaimer);

    var closeBtn = document.createElement("button");
    closeBtn.className = "pt-btn";
    closeBtn.textContent = "×";
    closeBtn.onclick = function () { document.body.removeChild(overlay); };
    box.appendChild(closeBtn);

    overlay.appendChild(box);
    overlay.addEventListener("click", function (ev) {
      if (ev.target === overlay) document.body.removeChild(overlay);
    });
    document.body.appendChild(overlay);
  }

  /** 页脚 */
  function renderFooter(el) {
    var cfg = _cfg();
    var lang = PT.store.get("lang") || "zh";
    var legal = cfg.legal || {};
    var text = (legal.footer && legal.footer[lang]) || PT.i18n.t("footer_legal");
    el.textContent = text;
  }

  PT.legal = {
    needNda: needNda,
    showNda: showNda,
    showAbout: showAbout,
    renderFooter: renderFooter
  };
})();
