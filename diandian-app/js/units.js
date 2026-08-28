/* 点点 — 单位换算（核心：内部永远保存标准值，展示时换算，保证切换不丢精度）
   血糖：mmol/L（标准）↔ mg/dL
   体重：公斤（标准）↔ 斤（1 公斤 = 2 斤）；已彻底移除 lb/磅 */
(function () {
  'use strict';

  const MGDL_PER_MMOL = 18.0182;   // 血糖 mmol/L -> mg/dL
  const JIN_PER_KG = 2;            // 体重 公斤 -> 斤

  function round1(n) { return Math.round(n * 10) / 10; }
  function round3(n) { return Math.round(n * 1000) / 1000; }

  /* ---- 血糖 ---- */
  function glucoseToDisplay(mmol, unit) {
    if (unit === 'mgdl') return Math.round(mmol * MGDL_PER_MMOL);
    return round1(mmol);
  }
  function glucoseUnitLabel(unit) { return unit === 'mgdl' ? 'mg/dL' : 'mmol/L'; }
  function parseGlucoseInput(text, unit) {
    const v = parseFloat(String(text).replace(/[^\d.]/g, ''));
    if (!isFinite(v) || v <= 0) return null;
    if (unit === 'mgdl') return round3(v / MGDL_PER_MMOL);
    return round3(v);
  }
  // 明显异常（防止误输入，非诊断）
  function isAbnormalGlucose(mmol) { return mmol < 1.5 || mmol > 30; }

  /* ---- 体重（公斤 / 斤） ---- */
  // unit: 'kg'（公斤，默认）| 'jin'（斤）
  function weightToDisplay(kg, unit) {
    if (unit === 'jin') return round1(kg * JIN_PER_KG);
    return round1(kg);
  }
  function weightUnitLabel(unit) { return unit === 'jin' ? '斤' : '公斤'; }
  function parseWeightInput(text, unit) {
    const v = parseFloat(String(text).replace(/[^\d.]/g, ''));
    if (!isFinite(v) || v <= 0) return null;
    if (unit === 'jin') return round3(v / JIN_PER_KG);
    return round3(v);
  }
  function isAbnormalWeight(kg) { return kg < 20 || kg > 300; }

  function deltaText(kg, unit) {
    // 返回 {dir: 'up'|'down'|'flat', text, value}
    const d = kg;
    if (Math.abs(d) < 0.05) return { dir: 'flat', text: '0', value: 0 };
    const v = weightToDisplay(Math.abs(d), unit);
    return { dir: d < 0 ? 'down' : 'up', text: String(v), value: d };
  }

  window.DD = window.DD || {};
  DD.units = {
    MGDL_PER_MMOL, JIN_PER_KG,
    round1, round3,
    glucoseToDisplay, glucoseUnitLabel, parseGlucoseInput, isAbnormalGlucose,
    weightToDisplay, weightUnitLabel, parseWeightInput, isAbnormalWeight,
    deltaText
  };
})();
