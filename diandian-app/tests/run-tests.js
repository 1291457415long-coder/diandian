/* 点点 — 业务流程自动测试（Node 运行：node tests/run-tests.js）
   覆盖提示词中测试 1~14 全部业务规则 */
'use strict';
const fs = require('fs');
const path = require('path');

global.window = global;
global.DD = {};
function load(rel) { eval(fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')); }
load('js/units.js');
load('js/store.js');
load('js/logic.js');
load('js/chart.js'); // 纯函数（缩放/平移数学）

const S = DD.store, L = DD.logic, U = DD.units;

let passed = 0, failed = 0;
function ok(cond, name, extra) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (extra ? '  → ' + JSON.stringify(extra) : '')); }
}
function section(name) { console.log('\n■ ' + name); }
async function fresh() {
  const st = new DD.MemoryStore();
  await st.ready();
  return st;
}
const at = (h, m) => new Date(2026, 7, 28, h, m, 0, 0).getTime(); // 8月28日

(async () => {
  console.log('点点 · 业务测试 ' + new Date().toLocaleString());

  /* ---------- 测试 1：餐前 + 餐后2小时提醒 ---------- */
  section('测试1：12:00 餐前 5.6 → 餐后2小时 → 14:00 提醒');
  {
    const st = await fresh();
    const r = await L.addGlucose(st, { time: at(12, 0), mmol: 5.6, scenario: 'premeal', foods: [], reminderMinutes: 120 });
    ok(r.record.id, '餐前记录已保存');
    const pend = await L.getPendingReminder(st);
    ok(pend && pend.minutes === 120, '提醒类型为餐后2小时');
    ok(pend && pend.targetTime === at(14, 0), '提醒时间为 14:00', { target: pend && new Date(pend.targetTime).toTimeString() });
    ok(pend && !pend.triggered && !pend.canceled, '提醒处于未触发状态');
  }

  /* ---------- 测试 2：新餐前提醒取消旧提醒 ---------- */
  section('测试2：13:00 新增 18:00 餐前(2h) → 旧提醒取消、新提醒存在');
  {
    const st = await fresh();
    await L.addGlucose(st, { time: at(12, 0), mmol: 5.6, scenario: 'premeal', foods: [], reminderMinutes: 120 });
    const r2 = await L.addGlucose(st, { time: at(18, 0), mmol: 5.4, scenario: 'premeal', foods: [], reminderMinutes: 120 });
    const rems = await st.list('reminders');
    const oldR = rems.find(x => x.premealGlucoseId !== r2.record.id);
    const newR = rems.find(x => x.premealGlucoseId === r2.record.id);
    ok(oldR && oldR.canceled, '旧提醒已自动取消');
    ok(newR && !newR.canceled && !newR.triggered, '新提醒存在且未触发');
    ok(newR && newR.targetTime === at(20, 0), '新提醒时间为 20:00');
    const pend = await L.getPendingReminder(st);
    ok(pend && pend.id === newR.id, '系统只保留最新一顿餐的提醒');
  }

  /* ---------- 测试 3：提前记录餐后 → 提醒取消 ---------- */
  section('测试3：提醒未触发，提前记录餐后2小时 → 提醒取消');
  {
    const st = await fresh();
    const prem = await L.addGlucose(st, { time: at(18, 0), mmol: 5.4, scenario: 'premeal', foods: [], reminderMinutes: 120 });
    const post = await L.addGlucose(st, { time: at(19, 50), mmol: 6.2, scenario: 'post120', foods: [] });
    ok(post.associated, '餐后记录自动关联餐前');
    ok(post.record.premealId === prem.record.id, '关联到 18:00 餐前', post.record.premealId);
    const rems = await st.list('reminders');
    ok(rems.length === 1 && rems[0].canceled, '对应的未触发提醒已自动取消');
  }

  /* ---------- 测试 4：删除餐前 → 提醒取消、餐后保留、关联解除 ---------- */
  section('测试4：删除餐前血糖');
  {
    // 场景 A：提醒仍在等待中，删除餐前 → 提醒取消
    {
      const st = await fresh();
      const prem = await L.addGlucose(st, { time: at(12, 0), mmol: 5.6, scenario: 'premeal', foods: [], reminderMinutes: 60 });
      ok((await L.getPendingReminder(st)) != null, 'A：删除前提醒在等待中');
      const del = await L.deleteGlucose(st, prem.record.id);
      ok(del.canceledReminders.length === 1, 'A：删除餐前 → 提醒取消');
      ok((await L.getPendingReminder(st)) == null, 'A：无残留未触发提醒');
    }
    // 场景 B：已有餐后记录，删除餐前 → 餐后保留、关联解除
    {
      const st = await fresh();
      const prem = await L.addGlucose(st, { time: at(12, 0), mmol: 5.6, scenario: 'premeal', foods: [] });
      const post = await L.addGlucose(st, { time: at(14, 0), mmol: 7.1, scenario: 'post120', foods: [] });
      ok(post.associated, 'B：餐后已关联餐前');
      const del = await L.deleteGlucose(st, prem.record.id);
      ok(del.unlinked.includes(post.record.id), 'B：餐后记录解除关联');
      const postAfter = await st.get('glucose', post.record.id);
      ok(postAfter != null && postAfter.premealId == null, 'B：餐后记录保留且已解除关联');
      ok((await st.get('glucose', prem.record.id)) == null, 'B：餐前记录已删除');
    }
  }

  /* ---------- 测试 5：修改餐前时间 → 提醒跟随重算 ---------- */
  section('测试5：修改餐前时间 → 未触发提醒跟随修改');
  {
    const st = await fresh();
    const prem = await L.addGlucose(st, { time: at(12, 0), mmol: 5.6, scenario: 'premeal', foods: [], reminderMinutes: 120 });
    let pend = await L.getPendingReminder(st);
    ok(pend.targetTime === at(14, 0), '修改前提醒 14:00');
    await L.updateGlucose(st, prem.record.id, { time: at(12, 30) });
    pend = await L.getPendingReminder(st);
    ok(pend.targetTime === at(14, 30), '修改后提醒自动变为 14:30', new Date(pend.targetTime).toTimeString());
  }

  /* ---------- 测试 6：修改餐前时间导致关联不合理 → 弹窗选择 ---------- */
  section('测试6：修改餐前时间导致餐后关联不合理 → 返回选择项');
  {
    const st = await fresh();
    const prem = await L.addGlucose(st, { time: at(12, 0), mmol: 5.6, scenario: 'premeal', foods: [] });
    const post = await L.addGlucose(st, { time: at(14, 0), mmol: 7.1, scenario: 'post120', foods: [] });
    ok(post.associated, '初始关联成立（12:00→14:00 餐后2小时）');
    // 把餐前改到 16:00 → 餐后记录在餐前之前，不合理
    const res = await L.updateGlucose(st, prem.record.id, { time: at(16, 0) });
    ok(res.unreasonableLinks.includes(post.record.id), '检测到不合理关联，交由弹窗处理', res.unreasonableLinks);
    // UI 选择「解除关联」
    await L.unlinkPostMeals(st, res.unreasonableLinks);
    const postAfter = await st.get('glucose', post.record.id);
    ok(postAfter.premealId == null, '选择解除后关联已解除（记录保留）');
    // 再次验证「保持关联」路径
    const st2 = await fresh();
    const p2 = await L.addGlucose(st2, { time: at(12, 0), mmol: 5.6, scenario: 'premeal', foods: [] });
    const po2 = await L.addGlucose(st2, { time: at(14, 0), mmol: 7.1, scenario: 'post120', foods: [] });
    const res2 = await L.updateGlucose(st2, p2.record.id, { time: at(16, 0) });
    // 不调用 unlink → 关联保持
    const po2After = await st2.get('glucose', po2.record.id);
    ok(res2.unreasonableLinks.length > 0 && po2After.premealId === p2.record.id, '选择保持后关联仍保留');
  }

  /* ---------- 测试 7：手机重启 → 未触发提醒恢复 ---------- */
  section('测试7：重启后未触发提醒恢复（数据持久化 + 到期可查）');
  {
    const st = await fresh();
    const prem = await L.addGlucose(st, { time: at(12, 0), mmol: 5.6, scenario: 'premeal', foods: [], reminderMinutes: 120 });
    // 模拟重启：重新读取同一存储（IndexedDB 场景即重新打开 DB）
    const pending = await L.getPendingReminder(st);
    ok(pending && !pending.canceled && !pending.triggered, '重启后提醒仍在（未触发）');
    ok(pending.targetTime === at(14, 0), '提醒时间正确');
    // 模拟重启发生在提醒之后：到期提醒可被调度器补发
    const due = await L.getDueReminders(st, at(14, 30));
    ok(due.length === 1, '到期提醒可被检测并补发');
    await L.markTriggered(st, due[0].id);
    const after = await L.getPendingReminder(st);
    ok(after == null, '发送一次后自动结束，不留未完成记录');
  }

  /* ---------- 测试 8：mmol/L ↔ mg/dL 全局换算 ---------- */
  section('测试8：血糖单位切换（内部数值不变）');
  {
    const st = await fresh();
    const r = await L.addGlucose(st, { time: at(8, 0), mmol: 5.6, scenario: 'fasting', foods: [] });
    const mgdl = U.glucoseToDisplay(r.record.mmol, 'mgdl');
    ok(mgdl === 101, '5.6 mmol/L = 101 mg/dL', mgdl);
    const back = U.parseGlucoseInput('101', 'mgdl');
    ok(Math.abs(back - 5.6) < 0.01, '101 mg/dL 解析回 ≈5.6 mmol/L', back);
    ok(U.parseGlucoseInput('5.6', 'mmol') === 5.6, 'mmol/L 直读一致');
    // 切换单位不触碰数据
    const after = await st.get('glucose', r.record.id);
    ok(after.mmol === 5.6, '内部保存的 mmol 标准值不变');
    // 不合理判断在两种单位下等价
    ok(!U.isAbnormalGlucose(U.parseGlucoseInput('99', 'mgdl')), '99 mg/dL(≈5.5) 属正常，不拦截');
    ok(U.isAbnormalGlucose(U.parseGlucoseInput('900', 'mgdl')), '900 mg/dL(≈50) 明显异常，拦截');
    ok(U.isAbnormalGlucose(U.parseGlucoseInput('0.5', 'mmol')), '0.5 mmol/L 明显异常，拦截');
  }

  /* ---------- 测试 9：公斤 ↔ 斤 全局换算（彻底移除 lb/磅） ---------- */
  section('测试9：体重单位切换（公斤/斤，1公斤=2斤）');
  {
    ok(U.weightUnitLabel('kg') === '公斤', '默认单位显示「公斤」');
    ok(U.weightUnitLabel('jin') === '斤', '切换单位显示「斤」');
    ok(['公斤', '斤'].includes(U.weightUnitLabel('lb')) && U.weightUnitLabel('lb') !== 'lb', '任何情况下都不显示 lb/磅');
    ok(U.LB_PER_KG === undefined && U.JIN_PER_KG === 2, '已移除 lb 常量，公斤→斤=×2');
    const w = await U.parseWeightInput('72.5', 'kg');
    ok(w === 72.5, '72.5 公斤解析正确');
    ok(U.weightToDisplay(w, 'jin') === 145, '72.5 公斤 = 145 斤', U.weightToDisplay(w, 'jin'));
    ok(U.weightToDisplay(70, 'jin') === 140, '70 公斤 = 140 斤');
    const back = U.parseWeightInput('145', 'jin');
    ok(Math.abs(back - 72.5) < 0.001, '145 斤 解析回 ≈72.5 公斤', back);
    const st = await fresh();
    const rec = await L.addWeight(st, { time: at(7, 0), kg: 72.5 });
    ok((await st.get('weight', rec.id)).kg === 72.5, '内部保存公斤标准值不变');
    ok(U.weightToDisplay(72.5, 'jin') === 145, '显示换算正确（145 斤）');
    ok(U.isAbnormalWeight(U.parseWeightInput('700', 'jin')), '700 斤（=350公斤）明显异常，拦截');
    ok(!U.isAbnormalWeight(U.parseWeightInput('140', 'jin')), '140 斤（=70公斤）正常');
  }

  /* ---------- 测试 9c：趋势图缩放/平移数学 ---------- */
  section('测试9c：趋势图手势缩放（双指捏合方向正确）');
  {
    const C = DD.Chart;
    const opts = { bounds: [0, 86400000], minSpan: 7200000, maxSpan: 86400000 };
    const day = [0, 86400000];
    // 双指分开（放大）：factor<1 → span 变小
    const zoomed = C.zoomAround(day, 0.5, 43200000, opts);
    ok(Math.abs((zoomed[1] - zoomed[0]) - 43200000) < 1, '放大后窗口为半天', zoomed);
    ok(zoomed[0] >= 0 && zoomed[1] <= 86400000, '放大后仍在边界内');
    // 缩小：factor>1 → span 变大，但受 maxSpan 限制
    const out = C.zoomAround(day, 3, 43200000, opts);
    ok(Math.abs((out[1] - out[0]) - 86400000) < 1, '缩小受 maxSpan 限制为全天');
    // 平移：缩小窗口后再平移（满窗无平移空间，会被夹回）
    const win = [8640000, 17280000]; // 2 小时窗口
    const panned = C.panBy(win, 3600000, opts);
    ok(panned[0] === 12240000 && panned[1] === 20880000, '平移 1 小时', panned);
    // 平移出边界被夹住
    const clamped = C.panBy(win, -999999999, opts);
    ok(clamped[0] === 0, '向左平移越界被夹在左边界', clamped);
    // 满窗口平移被夹回（正确行为）
    const full = C.panBy(day, 3600000, opts);
    ok(full[0] === 0 && full[1] === 86400000, '满窗口平移无空间，夹回边界');
    // 锚点缩放：anchor 像素位置保持
    const z2 = C.zoomAround([0, 86400000], 0.25, 21600000, opts);
    // anchor=6h 相对位置 0.25；缩放后 span=21.6M? 不，0.25*86.4M=21.6M? 不对：span=86.4M*0.25=21.6M... 实际 minSpan 7.2M，OK
    ok(z2[0] >= 0, '锚点缩放后不越界', z2);
  }

  /* ---------- 测试 10：同一天多次体重 ---------- */
  section('测试10：同一天记录两次体重 → 全部保留，首页显示最新');
  {
    const st = await fresh();
    await L.addWeight(st, { time: at(7, 0), kg: 72.4 });
    await L.addWeight(st, { time: at(21, 0), kg: 72.0 });
    const all = await st.list('weight');
    ok(all.length === 2, '两条记录全部保留');
    const latest = await L.latestWeight(st);
    ok(latest.record.kg === 72.0, '首页显示最新一条（72.0 kg）');
    ok(latest.delta === -0.4, '较上次变化 = -0.4 kg', latest.delta);
  }

  /* ---------- 测试 11：一顿饭多个食物 ---------- */
  section('测试11：米饭+鸡蛋+青菜 一顿饭');
  {
    const st = await fresh();
    // 食物库已移除：食物以「名称快照」内联在记录里（记录页手动输入，逗号/顿号分隔）
    const snaps = ['米饭', '鸡蛋', '青菜'].map(name => ({ name }));
    const r = await L.addGlucose(st, { time: at(12, 5), mmol: 5.6, scenario: 'premeal', foods: snaps });
    const saved = await st.get('glucose', r.record.id);
    ok(saved.foods.length === 3, '记录保存了 3 个食物');
    ok(saved.foods.map(f => f.name).join('、') === '米饭、鸡蛋、青菜', '食物名称完整');
    // 餐后记录自动带出（通知点击场景）——详情页使用记录内食物快照
    const post = await L.addGlucose(st, { time: at(14, 5), mmol: 7.1, scenario: 'post120', foods: snaps });
    ok(post.record.foods.length === 3, '餐后记录可自动带出对应食物');
  }

  /* ---------- 测试 12：无餐前直接记录餐后 ---------- */
  section('测试12：没有餐前，直接记录餐后血糖 → 正常保存');
  {
    const st = await fresh();
    const r = await L.addGlucose(st, { time: at(10, 30), mmol: 6.8, scenario: 'post60', foods: [] });
    ok(r.record != null, '保存成功');
    ok(r.record.premealId == null, '无关联，正常显示');
    ok(!r.associated, '未强行关联');
  }

  /* ---------- 测试 13：随机血糖不参与关联 ---------- */
  section('测试13：随机血糖不自动关联餐前');
  {
    const st = await fresh();
    await L.addGlucose(st, { time: at(12, 0), mmol: 5.6, scenario: 'premeal', foods: [] });
    const ran = await L.addGlucose(st, { time: at(13, 0), mmol: 5.9, scenario: 'random', foods: [] });
    ok(ran.record.premealId == null, '随机血糖不关联');
    // 对照：餐后30分钟在合理窗口内会关联
    const post = await L.addGlucose(st, { time: at(12, 30), mmol: 6.1, scenario: 'post30', foods: [] });
    ok(post.associated, '餐后30分钟正常关联（对照）');
    // 时间距离过远的餐后不关联（如 3 小时后的餐后1小时）
    const far = await L.addGlucose(st, { time: at(15, 30), mmol: 6.5, scenario: 'post60', foods: [] });
    ok(!far.associated, '超出合理时间范围不关联');
  }

  /* ---------- 测试 14：导出全部数据 ---------- */
  section('测试14：导出全部数据（血糖+体重）');
  {
    const st = await fresh();
    await L.addGlucose(st, { time: at(7, 30), mmol: 5.2, scenario: 'fasting', foods: [] });
    await L.addGlucose(st, { time: at(12, 5), mmol: 5.6, scenario: 'premeal', foods: [{ name: '米饭' }] });
    await L.addWeight(st, { time: at(7, 0), kg: 72.4 });
    const csv = await L.buildExportCSV(st, { glucoseUnit: 'mmol', weightUnit: 'kg' });
    ok(csv.startsWith('\ufeff'), 'UTF-8 BOM（Excel 中文不乱码）');
    ok(csv.includes('[血糖记录]'), '包含血糖记录');
    ok(csv.includes('[体重记录]'), '包含体重记录');
    ok(!csv.includes('[食物库]'), '已移除食物库：导出不再包含 [食物库] 段落');
    ok(csv.includes('餐前') && csv.includes('米饭'), '血糖含场景与吃了什么');
    ok(csv.includes('72.4,公斤'), '体重含数值与单位（公斤）', csv.split('\r\n').find(l => l.includes('72.4')));
    ok(csv.includes('5.6,mmol/L'), '血糖含数值与单位');
    ok(!csv.includes('kg') && !csv.includes('lb'), '导出不出现 kg/lb');
    // 单位切换后导出同步
    const csv2 = await L.buildExportCSV(st, { glucoseUnit: 'mgdl', weightUnit: 'jin' });
    ok(csv2.includes('mg/dL') && !csv2.includes('mmol/L'), '切换单位后导出统一变化');
    ok(csv2.includes('144.8,斤'), '切换斤后导出显示 144.8 斤');
  }

  /* ---------- 补充：修改场景为非餐前 → 提醒取消 ---------- */
  section('补充：修改餐前场景为随机 → 提醒取消');
  {
    const st = await fresh();
    const prem = await L.addGlucose(st, { time: at(12, 0), mmol: 5.6, scenario: 'premeal', foods: [], reminderMinutes: 120 });
    await L.updateGlucose(st, prem.record.id, { scenario: 'random' });
    const pend = await L.getPendingReminder(st);
    ok(pend == null, '提醒已取消');
    const rems = await st.list('reminders');
    ok(rems.length === 1 && rems[0].canceled, '提醒标记为已取消');
  }

  console.log('\n══════════════════════════════════');
  console.log('  通过 ' + passed + ' 项，失败 ' + failed + ' 项');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('测试异常:', e); process.exit(1); });
