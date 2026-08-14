/* ============================================================
 * thermal.js — LDO 热耗与温升估算
 * P_loss = (Vin - Vout) × Iout
 * ΔT = P_loss × theta_ja
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;

  /**
   * LDO 损耗
   * @param {number} vin V
   * @param {number} vout V
   * @param {number} ioutMa mA
   * @returns {number} mW
   */
  function ldoLossMw(vin, vout, ioutMa) {
    if (vin == null || vout == null || ioutMa == null) return 0;
    var pMw = (vin - vout) * ioutMa; // V × mA = mW
    return Math.max(0, pMw);
  }

  /**
   * 温升估算
   * @param {number} lossMw mW
   * @param {number} thetaJa ℃/W (可选)
   * @returns {number|null} ℃
   */
  function deltaT(lossMw, thetaJa) {
    if (thetaJa == null || !isFinite(thetaJa)) return null;
    return (lossMw / 1000) * thetaJa;   // mW→W
  }

  /**
   * LDO 压差是否充足
   * @param {number} vinMin 上游输出最低 (V)
   * @param {number} vout LDO 输出 (V)
   * @param {number} dropoutMv mV
   */
  function dropoutOk(vinMin, vout, dropoutMv) {
    if (vinMin == null || vout == null) return true;   // 无法判定
    if (dropoutMv == null) return true;
    return (vinMin - vout) * 1000 >= dropoutMv;
  }

  PT.thermal = {
    ldoLossMw: ldoLossMw,
    deltaT: deltaT,
    dropoutOk: dropoutOk
  };
})();
