/* ============================================================
 * eff-table.js — 效率表查询与双线性插值
 * 支持多工况 (vin/vout 网格), 1mA step, 范围外夹取并告警
 * 一期仅用于属性面板绘制效率曲线, 不参与汇总
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;

  /**
   * 在某一工况 (condition) 下按电流 i 查询效率
   * @param {object} cond { i_start, i_step, eff: [..] }
   * @param {number} iMa 电流 (mA)
   * @returns {{ eff:number, clamped:boolean }}
   */
  function _lookupInCondition(cond, iMa) {
    var arr = cond.eff || [];
    if (!arr.length) return { eff: null, clamped: true };
    var idx = (iMa - (cond.i_start || 0)) / (cond.i_step || 1);
    var lo = Math.floor(idx);
    var hi = Math.ceil(idx);
    var clamped = false;
    if (lo < 0) { lo = 0; hi = 0; clamped = true; }
    if (hi > arr.length - 1) { hi = arr.length - 1; lo = hi; clamped = true; }
    if (lo === hi) return { eff: arr[lo], clamped: clamped };
    var frac = idx - lo;
    var e = arr[lo] * (1 - frac) + arr[hi] * frac;
    return { eff: e, clamped: clamped };
  }

  /**
   * 在 (vin, vout, i) 处对效率做双线性插值
   * @param {string} partId 器件型号
   * @param {number} vin V
   * @param {number} vout V
   * @param {number} iOutMa mA
   * @returns {{ eff:number, clamped:boolean, usedVin:[lo,hi], usedVout:[lo,hi] } | null}
   */
  function interpolate(partId, vin, vout, iOutMa) {
    var table = PT.getEff(partId);
    if (!table || !Array.isArray(table.conditions) || !table.conditions.length) return null;

    // 收集全部 vin / vout 档位
    var vins = [];
    var vouts = [];
    table.conditions.forEach(function (c) {
      if (vins.indexOf(c.vin) < 0) vins.push(c.vin);
      if (vouts.indexOf(c.vout) < 0) vouts.push(c.vout);
    });
    vins.sort(function (a, b) { return a - b; });
    vouts.sort(function (a, b) { return a - b; });

    // 夹取 vin
    var vinClamped = false;
    var vinLo, vinHi;
    if (vin <= vins[0]) { vinLo = vinHi = vins[0]; vinClamped = vin < vins[0]; }
    else if (vin >= vins[vins.length - 1]) { vinLo = vinHi = vins[vins.length - 1]; vinClamped = vin > vins[vins.length - 1]; }
    else {
      for (var i = 0; i < vins.length - 1; i++) {
        if (vin >= vins[i] && vin <= vins[i + 1]) { vinLo = vins[i]; vinHi = vins[i + 1]; break; }
      }
    }

    // 夹取 vout
    var voutClamped = false;
    var voutLo, voutHi;
    if (vout <= vouts[0]) { voutLo = voutHi = vouts[0]; voutClamped = vout < vouts[0]; }
    else if (vout >= vouts[vouts.length - 1]) { voutLo = voutHi = vouts[vouts.length - 1]; voutClamped = vout > vouts[vouts.length - 1]; }
    else {
      for (var j = 0; j < vouts.length - 1; j++) {
        if (vout >= vouts[j] && vout <= vouts[j + 1]) { voutLo = vouts[j]; voutHi = vouts[j + 1]; break; }
      }
    }

    // 取 4 个角点的工况
    function findCond(v, o) {
      for (var k = 0; k < table.conditions.length; k++) {
        var c = table.conditions[k];
        if (c.vin === v && c.vout === o) return c;
      }
      // 若没有完全匹配, 找 vin 最接近的
      var best = null, bestD = Infinity;
      table.conditions.forEach(function (c) {
        var d = Math.abs(c.vin - v) + Math.abs(c.vout - o);
        if (d < bestD) { bestD = d; best = c; }
      });
      return best;
    }

    var cLL = findCond(vinLo, voutLo);
    var cLH = findCond(vinLo, voutHi);
    var cHL = findCond(vinHi, voutLo);
    var cHH = findCond(vinHi, voutHi);

    var rLL = cLL ? _lookupInCondition(cLL, iOutMa) : { eff: null };
    var rLH = cLH ? _lookupInCondition(cLH, iOutMa) : { eff: null };
    var rHL = cHL ? _lookupInCondition(cHL, iOutMa) : { eff: null };
    var rHH = cHH ? _lookupInCondition(cHH, iOutMa) : { eff: null };

    // 任何一角缺数据则退化为单点
    if (rLL.eff == null) rLL = rLH = rHL = rHH = (rLL.eff != null ? rLL : rLH.eff != null ? rLH : rHL.eff != null ? rHL : rHH);

    var vinT = (vinHi === vinLo) ? 0 : (vin - vinLo) / (vinHi - vinLo);
    var voutT = (voutHi === voutLo) ? 0 : (vout - voutLo) / (voutHi - voutLo);

    var eLo = rLL.eff * (1 - voutT) + rLH.eff * voutT;
    var eHi = rHL.eff * (1 - voutT) + rHH.eff * voutT;
    var eff = eLo * (1 - vinT) + eHi * vinT;

    return {
      eff: eff,
      clamped: vinClamped || voutClamped || rLL.clamped || rLH.clamped || rHL.clamped || rHH.clamped,
      usedVin: [vinLo, vinHi],
      usedVout: [voutLo, voutHi]
    };
  }

  /**
   * 取某工况下整条效率曲线 (用于面板绘图)
   * @returns {{ i:[], eff:[], clamped:boolean } | null}
   */
  function curve(partId, vin, vout) {
    var table = PT.getEff(partId);
    if (!table || !Array.isArray(table.conditions)) return null;
    // 找最接近的工况
    var best = null, bestD = Infinity;
    table.conditions.forEach(function (c) {
      var d = Math.abs(c.vin - vin) * 2 + Math.abs(c.vout - vout);
      if (d < bestD) { bestD = d; best = c; }
    });
    if (!best) return null;
    var iArr = [];
    for (var k = 0; k < (best.eff || []).length; k++) {
      iArr.push((best.i_start || 0) + k * (best.i_step || 1));
    }
    return { i: iArr, eff: best.eff || [], cond: best };
  }

  PT.effTable = {
    interpolate: interpolate,
    curve: curve
  };
})();
