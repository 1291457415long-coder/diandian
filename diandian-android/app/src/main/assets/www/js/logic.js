/* 点点 — 业务逻辑核心
   依赖：DD.store（统一存储接口）、DD.units
   本文件不依赖 DOM，可在 Node 中直接运行（供测试） */
(function () {
  'use strict';
  const S = DD.store;
  const U = DD.units;

  const SCENARIOS = {
    fasting: '空腹',
    premeal: '餐前',
    post30: '餐后30分钟',
    post60: '餐后1小时',
    post120: '餐后2小时',
    random: '随机'
  };
  const SCENARIO_ORDER = ['fasting', 'premeal', 'post30', 'post60', 'post120', 'random'];
  const POST_MINUTES = { post30: 30, post60: 60, post120: 120 };
  const REMINDER_CHOICES = [30, 60, 120]; // 分钟

  function isPost(scenario) { return !!POST_MINUTES[scenario]; }

  /* ---------- 时间工具 ---------- */
  const p2 = n => String(n).padStart(2, '0');
  function startOfDay(ts) { const d = new Date(ts); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
  function fmtTime(ts) { const d = new Date(ts); return p2(d.getHours()) + ':' + p2(d.getMinutes()); }
  function fmtDate(ts) { const d = new Date(ts); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function fmtDateCN(ts) { const d = new Date(ts); return d.getMonth() + 1 + '月' + d.getDate() + '日'; }
  function fmtDateFull(ts) { const d = new Date(ts); return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日'; }
  function dayKey(ts) { return fmtDate(ts); }
  function dayLabel(ts, nowTs) {
    const t0 = startOfDay(nowTs || Date.now());
    const t = startOfDay(ts);
    if (t === t0) return '今天';
    if (t === t0 - 86400000) return '昨天';
    const d = new Date(ts);
    const wd = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + wd;
  }
  function todayRecords(list, nowTs) {
    const t0 = startOfDay(nowTs || Date.now());
    return list.filter(r => r.time >= t0 && r.time < t0 + 86400000);
  }
  function groupByDay(list, nowTs) {
    const groups = [];
    const map = {};
    for (const r of list) {
      const k = dayKey(r.time);
      if (!map[k]) { map[k] = { key: k, label: dayLabel(r.time, nowTs), items: [] }; groups.push(map[k]); }
      map[k].items.push(r);
    }
    for (const g of groups) g.items.sort((a, b) => b.time - a.time); // 每天内部 最新→最旧
    groups.sort((a, b) => a.key < b.key ? 1 : -1); // 日期倒序
    return groups;
  }

  /* ---------- 餐前/餐后自动关联 ---------- */
  function gapWindow(scenario) {
    const exp = POST_MINUTES[scenario];
    return { min: Math.max(10, exp * 0.5), max: exp * 2.2 };
  }
  function isReasonableGap(premealTime, postTime, scenario) {
    const gapMin = (postTime - premealTime) / 60000;
    if (gapMin <= 0) return false;
    const w = gapWindow(scenario);
    return gapMin >= w.min && gapMin <= w.max;
  }
  // 寻找 postTime 之前最近且时间关系合理的餐前记录
  async function findPremealCandidate(store, postTime, scenario, excludeId) {
    const all = await store.list('glucose');
    const premeals = all
      .filter(g => g.scenario === 'premeal' && g.time < postTime && g.id !== excludeId)
      .sort((a, b) => b.time - a.time);
    for (const p of premeals) {
      if (isReasonableGap(p.time, postTime, scenario)) return p;
    }
    return null;
  }

  /* ---------- 提醒引擎 ---------- */
  async function _allPending(store) {
    const list = await store.list('reminders');
    return list.filter(r => !r.canceled && !r.triggered);
  }
  async function cancelReminder(store, id) {
    const r = await store.get('reminders', id);
    if (!r || r.canceled) return false;
    r.canceled = true; r.canceledAt = Date.now();
    await store.put('reminders', r);
    return true;
  }
  // 取消指定餐前记录的全部未触发提醒；minutes 非空时仅取消对应类型
  async function cancelPendingFor(store, premealId, minutes) {
    const pending = await _allPending(store);
    const ids = [];
    for (const r of pending) {
      if (r.premealGlucoseId === premealId && (minutes == null || r.minutes === minutes)) {
        await cancelReminder(store, r.id);
        ids.push(r.id);
      }
    }
    return ids;
  }
  // 取消所有未触发提醒（新餐前提醒独占）
  async function cancelAllPending(store) {
    const pending = await _allPending(store);
    const ids = [];
    for (const r of pending) { await cancelReminder(store, r.id); ids.push(r.id); }
    return ids;
  }
  async function createReminder(store, premealRecord, minutes) {
    const r = {
      id: undefined,
      premealGlucoseId: premealRecord.id,
      minutes,
      targetTime: premealRecord.time + minutes * 60000,
      canceled: false, triggered: false
    };
    await store.add('reminders', r);
    await store.settingsSet('lastReminderMinutes', minutes);
    return r;
  }
  async function getPendingReminder(store) {
    const pending = await _allPending(store);
    return pending.sort((a, b) => a.targetTime - b.targetTime)[0] || null;
  }
  async function getDueReminders(store, now) {
    const pending = await _allPending(store);
    return pending.filter(r => r.targetTime <= now);
  }
  async function markTriggered(store, id) {
    const r = await store.get('reminders', id);
    if (!r || r.triggered || r.canceled) return;
    r.triggered = true; r.triggeredAt = Date.now();
    await store.put('reminders', r);
  }
  async function getLastReminderMinutes(store) {
    return (await store.settingsGet('lastReminderMinutes', null)) || null;
  }

  /* ---------- 新增血糖记录 ---------- */
  // input: { time, mmol, scenario, foods:[{id,name}], premealId?, reminderMinutes? }
  async function addGlucose(store, input) {
    const rec = {
      id: undefined,
      time: input.time,
      mmol: input.mmol,
      scenario: input.scenario,
      foods: input.foods || [],
      premealId: null
    };
    let associated = false;

    // 餐后自动关联
    if (isPost(rec.scenario)) {
      if (input.premealId) {
        const p = await store.get('glucose', input.premealId);
        if (p && p.scenario === 'premeal' && isReasonableGap(p.time, rec.time, rec.scenario)) {
          rec.premealId = p.id; associated = true;
        }
      }
      if (!rec.premealId) {
        const cand = await findPremealCandidate(store, rec.time, rec.scenario);
        if (cand) { rec.premealId = cand.id; associated = true; }
      }
    }

    const saved = await store.add('glucose', rec);
    let reminderCreated = null;
    let canceledReminders = [];

    if (rec.scenario === 'premeal') {
      if (input.reminderMinutes != null && input.reminderMinutes > 0) {
        canceledReminders = await cancelAllPending(store);
        reminderCreated = await createReminder(store, saved, input.reminderMinutes);
      }
    } else if (rec.premealId && isPost(rec.scenario)) {
      // 提前记录餐后血糖 → 取消对应未触发提醒（同类型）
      canceledReminders = await cancelPendingFor(store, rec.premealId, POST_MINUTES[rec.scenario]);
    }

    return { record: saved, associated, reminderCreated, canceledReminders };
  }

  /* ---------- 修改血糖记录 ---------- */
  // changes: { time?, mmol?, scenario?, foods?, reminderMinutes? }
  // reminderMinutes: undefined=不动；0=取消本条提醒；>0=创建（先取消其它）
  // 返回 { record, reminderRecalculated, unreasonableLinks:[postId] }
  async function updateGlucose(store, id, changes) {
    const old = await store.get('glucose', id);
    if (!old) return null;
    const rec = Object.assign({}, old, changes);
    rec.updatedAt = Date.now();
    if (rec.id !== id) rec.id = id;
    const wasPremeal = old.scenario === 'premeal';
    const nowIsPremeal = rec.scenario === 'premeal';
    const linked = (await store.list('glucose')).filter(g => g.premealId === id && g.id !== id);
    const timeChanged = changes.time !== undefined && changes.time !== old.time;
    const reminderRecalculated = [];

    // 提醒处理
    if (wasPremeal || nowIsPremeal) {
      if (nowIsPremeal) {
        if (timeChanged) {
          const pend = (await store.list('reminders')).filter(r => r.premealGlucoseId === id && !r.canceled && !r.triggered);
          for (const r of pend) {
            r.targetTime = rec.time + r.minutes * 60000;
            await store.put('reminders', r);
            reminderRecalculated.push(r.id);
          }
        }
        if (changes.reminderMinutes === 0) {
          await cancelPendingFor(store, id, null);
        } else if (changes.reminderMinutes != null && changes.reminderMinutes > 0) {
          await cancelAllPending(store);
          const created = await createReminder(store, rec, changes.reminderMinutes);
          reminderRecalculated.push(created.id);
        }
      } else if (wasPremeal) {
        await cancelPendingFor(store, id, null);
      }
    }

    // 关联合理性：时间或场景变化导致关联不合理时，不自动解除，交给 UI 弹窗
    let unreasonableLinks = [];
    if ((timeChanged || !nowIsPremeal) && linked.length) {
      for (const g of linked) {
        if (!isPost(g.scenario)) continue;
        const ok = nowIsPremeal && isReasonableGap(rec.time, g.time, g.scenario);
        if (!ok) unreasonableLinks.push(g.id);
      }
      if (!nowIsPremeal) {
        // 场景不再是餐前，全部餐后关联视为不合理
        for (const g of linked) if (!unreasonableLinks.includes(g.id)) unreasonableLinks.push(g.id);
      }
    }

    await store.put('glucose', rec);
    return { record: rec, reminderRecalculated, unreasonableLinks };
  }

  // 解除指定餐后记录的关联（弹窗选「解除关联」时调用）
  async function unlinkPostMeals(store, postIds) {
    for (const pid of postIds) {
      const g = await store.get('glucose', pid);
      if (g && g.premealId) { g.premealId = null; await store.put('glucose', g); }
    }
  }

  /* ---------- 删除血糖记录 ---------- */
  async function deleteGlucose(store, id) {
    const rec = await store.get('glucose', id);
    if (!rec) return null;
    const canceledReminders = await cancelPendingFor(store, id, null);
    const all = await store.list('glucose');
    const linked = all.filter(g => g.premealId === id && g.id !== id);
    for (const g of linked) { g.premealId = null; await store.put('glucose', g); }
    await store.remove('glucose', id);
    return { canceledReminders, unlinked: linked.map(g => g.id) };
  }

  /* ---------- 体重 ---------- */
  async function addWeight(store, input) {
    const rec = { id: undefined, time: input.time, kg: input.kg };
    return store.add('weight', rec);
  }
  async function updateWeight(store, id, changes) {
    const old = await store.get('weight', id);
    if (!old) return null;
    const rec = Object.assign({}, old, changes);
    rec.updatedAt = Date.now();
    rec.id = id;
    await store.put('weight', rec);
    return rec;
  }
  async function deleteWeight(store, id) { await store.remove('weight', id); }

  // 最近一次体重 + 较上次变化（全部记录按时间最新的一条）
  async function latestWeight(store) {
    const all = await store.list('weight');
    if (!all.length) return null;
    const latest = all[all.length - 1];
    let delta = null;
    if (all.length > 1) {
      const prev = all[all.length - 2];
      delta = Math.round((latest.kg - prev.kg) * 1000) / 1000;
    }
    return { record: latest, delta };
  }

  /* ---------- 导出（CSV，UTF-8 BOM） ---------- */
  function csvCell(v) {
    const s = String(v == null ? '' : v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  async function buildExportCSV(store, settings) {
    const gluUnit = settings.glucoseUnit || 'mmol';
    const wtUnit = settings.weightUnit || 'kg';
    const lines = [];
    lines.push('点点数据导出');
    lines.push('导出时间,' + new Date().toLocaleString('zh-CN'));
    lines.push('血糖单位,' + U.glucoseUnitLabel(gluUnit));
    lines.push('体重单位,' + U.weightUnitLabel(wtUnit));
    lines.push('');

    // 血糖
    const glucose = await store.list('glucose');
    lines.push('[血糖记录]');
    lines.push('日期,时间,血糖值,单位,测量场景,吃了什么');
    for (const g of glucose) {
      const foods = (g.foods || []).map(f => f.name).join('、');
      lines.push([
        csvCell(fmtDate(g.time)),
        csvCell(fmtTime(g.time)),
        csvCell(U.glucoseToDisplay(g.mmol, gluUnit)),
        csvCell(U.glucoseUnitLabel(gluUnit)),
        csvCell(SCENARIOS[g.scenario] || g.scenario),
        csvCell(foods)
      ].join(','));
    }
    lines.push('');

    // 体重
    const weights = await store.list('weight');
    lines.push('[体重记录]');
    lines.push('日期,时间,体重,单位');
    for (const w of weights) {
      lines.push([
        csvCell(fmtDate(w.time)),
        csvCell(fmtTime(w.time)),
        csvCell(U.weightToDisplay(w.kg, wtUnit)),
        csvCell(U.weightUnitLabel(wtUnit))
      ].join(','));
    }
    lines.push('');

    return '\ufeff' + lines.join('\r\n');
  }

  window.DD = window.DD || {};
  DD.logic = {
    SCENARIOS, SCENARIO_ORDER, POST_MINUTES, REMINDER_CHOICES, isPost,
    startOfDay, fmtTime, fmtDate, fmtDateCN, fmtDateFull, dayKey, dayLabel,
    todayRecords, groupByDay,
    gapWindow, isReasonableGap, findPremealCandidate,
    cancelReminder, cancelPendingFor, cancelAllPending, createReminder,
    getPendingReminder, getDueReminders, markTriggered, getLastReminderMinutes,
    addGlucose, updateGlucose, unlinkPostMeals, deleteGlucose,
    addWeight, updateWeight, deleteWeight, latestWeight,
    buildExportCSV, csvCell
  };
})();
