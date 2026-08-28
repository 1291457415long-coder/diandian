/* 点点 — 视图层（全部页面渲染与交互） */
(function () {
  'use strict';
  const L = DD.logic, U = DD.units;

  /* ================= 通用工具 ================= */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function toast(msg, type) {
    const root = document.getElementById('toast-root');
    const t = el('<div class="toast ' + (type || '') + '">' + esc(msg) + '</div>');
    root.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 320); }, 2200);
  }

  function dialog(opts) {
    return new Promise(resolve => {
      const back = el('<div class="dialog-backdrop"><div class="dialog"></div></div>');
      const dlg = back.querySelector('.dialog');
      dlg.innerHTML = (opts.title ? '<h3>' + esc(opts.title) + '</h3>' : '') + (opts.html ? '<p>' + opts.html + '</p>' : '');
      const acts = el('<div class="dlg-actions"></div>');
      (opts.buttons || [{ label: '知道了', value: null }]).forEach(b => {
        const btn = el('<button class="btn ' + (b.kind === 'danger' ? 'btn-danger' : b.kind === 'ghost' ? 'btn-ghost' : 'btn-primary') + '">' + esc(b.label) + '</button>');
        btn.addEventListener('click', () => { back.remove(); resolve(b.value); });
        acts.appendChild(btn);
      });
      dlg.appendChild(acts);
      back.addEventListener('click', e => { if (e.target === back) { back.remove(); resolve(null); } });
      document.body.appendChild(back);
    });
  }
  function confirmDlg(title, html, okLabel) {
    return dialog({ title, html, buttons: [
      { label: '取消', value: false, kind: 'ghost' },
      { label: okLabel || '确定', value: true, kind: 'danger' }
    ] });
  }
  function promptDlg(title, initial) {
    return new Promise(resolve => {
      const back = el('<div class="dialog-backdrop"><div class="dialog"></div></div>');
      const dlg = back.querySelector('.dialog');
      dlg.innerHTML = '<h3>' + esc(title) + '</h3><p style="display:none"></p>';
      const input = document.createElement('input');
      input.type = 'text'; input.value = initial || '';
      input.style.cssText = 'width:100%;border:1px solid var(--outline-variant);border-radius:10px;padding:10px 14px;background:var(--surface-container);color:var(--on-surface);outline:none;font-size:16px;margin-bottom:14px';
      dlg.insertBefore(input, dlg.querySelector('p'));
      const acts = el('<div class="dlg-actions">' +
        '<button class="btn btn-ghost">取消</button>' +
        '<button class="btn btn-primary">保存</button></div>');
      const btns = acts.querySelectorAll('button');
      btns[0].addEventListener('click', () => { back.remove(); resolve(null); });
      btns[1].addEventListener('click', () => { const v = input.value.trim(); if (!v) return; back.remove(); resolve(v); });
      input.addEventListener('keydown', e => { if (e.key === 'Enter') btns[1].click(); });
      dlg.appendChild(acts);
      back.addEventListener('click', e => { if (e.target === back) { back.remove(); resolve(null); } });
      document.body.appendChild(back);
      setTimeout(() => input.focus(), 50);
    });
  }

  /* ================= 软键盘弹起适配（底部弹层不上移问题） ================= */
  // 弹层压缩：让 body 让出高度，底部操作按钮（完成/清空）始终可见。
  // 不依赖 flex 收缩（WebView 部分版本在 max-height + flex 组合下收缩不可靠）。
  function compressSheets() {
    document.querySelectorAll('.sheet').forEach(s => {
      const body = s.querySelector('.sheet-body');
      if (!body) return;
      const handleH = (s.querySelector('.sheet-handle') || { offsetHeight: 0 }).offsetHeight || 0;
      const titleH = (s.querySelector('.sheet-title') || { offsetHeight: 0 }).offsetHeight || 0;
      const acts = s.querySelector('.sheet-actions');
      const actsH = acts ? acts.offsetHeight + 16 : 0;
      const pad = 36; // 上下 padding 约 12+20+safe-bottom
      // 弹层自身当前高度（bottom 已随 --keyboard-offset 上移）减去其余部分 = body 可用高度
      const bodyMax = Math.max(100, Math.round(s.offsetHeight - handleH - titleH - actsH - pad));
      body.style.maxHeight = bodyMax + 'px';
      if (bodyMax < 120 && acts) s.style.maxHeight = (acts.offsetHeight + 170) + 'px';
    });
  }
  function initKeyboardAdapter() {
    const setOffsetFromViewport = () => {
      let offset = 0;
      if (window.visualViewport) {
        const h = window.innerHeight;
        const vh = window.visualViewport.height;
        offset = Math.max(0, h - vh - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom')) || 0));
      } else {
        offset = Math.max(0, (window.outerHeight || window.screen.height) - window.innerHeight);
      }
      document.documentElement.style.setProperty('--keyboard-offset', offset + 'px');
      compressSheets();
    };
    // 原生键盘事件：MainActivity 通过 OnApplyWindowInsetsListener 检测 IME inset 并注入 --keyboard-offset（MIUI WebView 不触发 JS resize）
    window.addEventListener('nativekbd', compressSheets);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', setOffsetFromViewport);
      window.visualViewport.addEventListener('scroll', setOffsetFromViewport);
    }
    window.addEventListener('resize', setOffsetFromViewport);
    setOffsetFromViewport();
  }
  initKeyboardAdapter();

  let _sheet = null;
  function openSheet({ title, bodyHTML, onMount }) {
    closeSheet();
    const back = el('<div class="sheet-backdrop"></div>');
    const sheet = el('<div class="sheet"><div class="sheet-handle"></div><div class="sheet-title"></div><div class="sheet-body"></div></div>');
    if (title) sheet.querySelector('.sheet-title').textContent = title;
    else sheet.querySelector('.sheet-title').style.display = 'none';
    sheet.querySelector('.sheet-body').innerHTML = bodyHTML;
    back.addEventListener('click', () => closeSheet());
    document.body.appendChild(back);
    document.body.appendChild(sheet);
    _sheet = { back, sheet, body: sheet.querySelector('.sheet-body') };
    if (onMount) onMount(_sheet);
    return _sheet;
  }
  function closeSheet() {
    if (_sheet) { _sheet.back.remove(); _sheet.sheet.remove(); _sheet = null; }
  }

  function fmtGlucose(mmol) { return { v: U.glucoseToDisplay(mmol, DD.settings.glucoseUnit), u: U.glucoseUnitLabel(DD.settings.glucoseUnit) }; }
  function fmtWeight(kg) { return { v: U.weightToDisplay(kg, DD.settings.weightUnit), u: U.weightUnitLabel(DD.settings.weightUnit) }; }

  /* ================= 顶部栏 ================= */
  // 顶栏只保留居中标题，不放任何按钮（导航统一走底部导航栏 + 系统返回手势）
  function renderTopbar() {
    const tb = document.getElementById('topbar');
    tb.innerHTML = '<span class="topbar-spacer"></span><div class="topbar-title">点点</div><span class="topbar-spacer"></span>';
    tb.classList.remove('scrolled');
    tb.classList.remove('hidden');
  }
  // 全屏记录页（血糖/体重）：隐藏顶栏，页面自带含安全区内边距的返回头，
  // 避免顶栏与页面头部各垫一次状态栏高度（视觉上「状态栏重复」）
  function hideTopbar() {
    document.getElementById('topbar').classList.add('hidden');
  }

  /* ================= 导航 ================= */
  function navigate(route) { location.hash = '#/' + route; }
  function navActive(name) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.nav === name));
  }

  /* ================= 首页 ================= */
  async function viewHome() {
    renderTopbar();
    navActive('home');
    const view = document.getElementById('view');
    view.classList.remove('no-nav');

    const render = async () => {
      clearInterval(view._cdTimer);
      view._cdTimer = null;
      const glucose = await DD.db.list('glucose');
      const weights = await DD.db.list('weight');
      const reminders = await DD.db.list('reminders');
      const now = Date.now();
      const today = L.todayRecords(glucose, now).sort((a, b) => b.time - a.time);
      const pending = reminders.filter(r => !r.canceled && !r.triggered).sort((a, b) => a.targetTime - b.targetTime)[0] || null;
      const latest = weights.length ? weights[weights.length - 1] : null;
      const prev = weights.length > 1 ? weights[weights.length - 2] : null;
      const delta = latest && prev ? Math.round((latest.kg - prev.kg) * 1000) / 1000 : null;

      const permNow = DD.notify.permission();
      const notifOff = permNow === 'denied' || permNow === 'default';

      let html = '';
      if (notifOff && pending) {
        html += '<div class="notice-banner" style="margin-bottom:16px"><span class="nb-icon">' + DD.icon('notifications_off') + '</span>' +
          '<div style="flex:1"><h3>通知已关闭</h3><p>餐后提醒可能无法正常发送</p></div>' +
          '<button class="btn btn-primary" data-act="notif" style="min-height:40px;padding:0 16px;font-size:14px">开启通知</button></div>';
      }

      // 今日血糖
      html += '<section class="view-section"><h2 class="sec-title">今日血糖</h2>';
      html += '<div class="card">' + (today.length ? '<div class="timeline">' : '<div class="empty-state" style="padding:28px 20px">' + DD.icon('water_drop') + '<p>今天还没有血糖记录</p></div>');
      today.forEach((g, idx) => {
        const disp = fmtGlucose(g.mmol);
        const isLast = idx === today.length - 1;
        const prem = g.premealId ? glucose.find(x => x.id === g.premealId) : null;
        html += '<div class="tl-item" data-goto="glucose/' + g.id + '">' +
          '<div class="tl-dot' + (idx === 0 ? '' : ' dim') + '"></div>' +
          '<div class="tl-row"><div style="display:flex;flex-direction:column;gap:1px">' +
          '<span class="tl-value num">' + disp.v + ' <span class="tl-unit">' + disp.u + '</span></span>' +
          '<span class="tl-scenario">' + (L.SCENARIOS[g.scenario] || '') + (prem ? ' · 对应餐前' : '') + '</span>' +
          (g.foods && g.foods.length ? '<span class="tl-food">' + esc(g.foods.map(f => f.name).join('、')) + '</span>' : '') +
          '</div><span class="tl-time">' + L.fmtTime(g.time) + '</span></div>';
        // 倒计时
        if (pending && pending.premealGlucoseId === g.id && g.scenario === 'premeal') {
          const left = pending.targetTime - now;
          const txt = left > 0 ? '还有 <b>' + countdownText(left) + '</b>' : '已到提醒时间，请记录';
          html += '<div class="countdown-chip' + (left <= 0 ? ' due' : '') + '" data-goto="reminder/' + pending.id + '">' +
            DD.icon('schedule') + '<span>餐后' + (pending.minutes === 30 ? '30分钟' : pending.minutes === 60 ? '1小时' : '2小时') + ' ' + txt + '</span></div>';
        }
        html += '</div>';
        if (!isLast) html += '';
      });
      html += '</div></section>';

      // 最近一次体重
      html += '<section class="view-section"><h2 class="sec-title">最近一次体重</h2>';
      if (latest) {
        const dw = fmtWeight(latest.kg);
        let deltaHtml = '<span class="wh-delta">' + DD.icon('arrow_downward') + '<span>0 较上次</span></span>';
        if (delta != null) {
          const abs = U.weightToDisplay(Math.abs(delta), DD.settings.weightUnit);
          deltaHtml = '<span class="wh-delta">' +
            DD.icon(delta < 0 ? 'arrow_downward' : delta > 0 ? 'arrow_upward' : 'check') +
            '<span>' + abs + ' ' + U.weightUnitLabel(DD.settings.weightUnit) + ' 较上次</span></span>';
        }
        html += '<div class="card weight-hero" data-goto="weight/' + latest.id + '">' +
          '<div class="wh-value num">' + dw.v + ' <span class="wh-unit">' + dw.u + '</span></div>' + deltaHtml +
          '<div class="hint-text">' + L.fmtDateFull(latest.time) + ' ' + L.fmtTime(latest.time) + ' 记录</div></div>';
      } else {
        html += '<div class="card"><div class="empty-state" style="padding:28px 20px">' + DD.icon('scale') + '<p>还没有体重记录</p></div></div>';
      }
      html += '</section>';

      // 快捷按钮
      html += '<section class="quick-grid">' +
        '<button class="quick-btn primary-action" data-act="quick-glucose">' + DD.icon('add') + '<span>记录血糖</span></button>' +
        '<button class="quick-btn secondary-action" data-act="quick-weight">' + DD.icon('add') + '<span>记录体重</span></button>' +
        '</section>';

      view.innerHTML = html;

      // 事件绑定
      view.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => navigate(b.dataset.goto)));
      view.querySelector('[data-act="quick-glucose"]')?.addEventListener('click', () => navigate('quick/glucose'));
      view.querySelector('[data-act="quick-weight"]')?.addEventListener('click', () => navigate('quick/weight'));
      view.querySelector('[data-act="notif"]')?.addEventListener('click', async () => {
        if (DD.notify.permission() === 'denied') {
          if (!DD.notify.openSettings()) { toast('请到系统设置开启通知', 'error'); }
          return;
        }
        const r = await DD.notify.requestPermission();
        if (r === 'granted') toast('通知已开启');
        else if (r === 'requesting') toast('请在系统弹窗中选择允许');
        else toast('未获得通知权限', 'error');
        render();
      });

      // 倒计时刷新
      if (pending) {
        clearInterval(view._cdTimer);
        view._cdTimer = setInterval(render, 30000);
      }
    };
    await render();
    return () => { clearInterval(view._cdTimer); };
  }
  function countdownText(ms) {
    const m = Math.floor(ms / 60000);
    if (m < 1) return '不足1分钟';
    const h = Math.floor(m / 60), mm = m % 60;
    if (h > 0) return h + '小时' + mm + '分';
    return mm + '分';
  }

  /* ================= 数字键盘 ================= */
  function keypadHTML() {
    return '<div class="keypad">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'].map(k =>
      k === 'back' ? '<button class="keypad-btn" data-k="back" aria-label="删除">' + DD.icon('backspace', 28) + '</button>'
        : '<button class="keypad-btn" data-k="' + k + '">' + k + '</button>'
    ).join('') + '</div>';
  }
  function makeKeypad(root, onValue) {
    let val = '';
    const numEl = root.querySelector('.vd-num');
    const setVal = () => { numEl.textContent = val || '0'; numEl.classList.toggle('vd-empty', !val); onValue && onValue(val); };
    root.querySelectorAll('.keypad-btn').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.k;
      if (k === 'back') { val = val.slice(0, -1); }
      else if (k === '.') { if (val && !val.includes('.')) val += '.'; }
      else { if (val.length < 6) val += k; }
      setVal();
    }));
    return { set: v => { val = v; setVal(); }, get: () => val, clear: () => { val = ''; setVal(); } };
  }

  /* ================= 时间选择（页面内嵌 24 小时面板，不弹窗） ================= */
  function timePickerHTML() {
    return '<div class="tp-panel" id="tp-panel" style="display:none"></div>';
  }
  // 长按连续步进：按下立即触发一次，按住 450ms 后每 90ms 重复。
  // 注意：步进过程中不能重建按钮 DOM（否则 pointerup 落在旧按钮上丢失，定时器失控）。
  function holdable(btn, fn) {
    let t1 = null, t2 = null;
    const stop = () => { if (t1) { clearTimeout(t1); t1 = null; } if (t2) { clearInterval(t2); t2 = null; } };
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      stop();
      fn();
      t1 = setTimeout(() => { t2 = setInterval(fn, 90); }, 450);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, stop));
    document.addEventListener('pointerup', stop); // 兜底：按钮被移出屏幕等异常时也能停
  }
  // 绑定内嵌时间面板：getT/setT 操作记录时间（毫秒时间戳），24 小时制
  function bindTimePicker(root, getT, setT) {
    const panel = root.querySelector('#tp-panel');
    const pill = root.querySelector('#tp-btn');
    const label = root.querySelector('#tp-label');
    if (!panel || !pill || !label) return;
    const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
    const p2 = n => String(n).padStart(2, '0');

    function build() {
      // 面板结构只在此构建一次性的骨架；值由 update() 写入文本节点，不重建 DOM
      panel.innerHTML =
        '<div class="tp-row">' +
        '<span class="tp-lab">日期</span>' +
        '<button class="tp-step" data-day="-1">‹</button>' +
        '<span class="tp-val" data-val="date"></span>' +
        '<button class="tp-step" data-day="1">›</button>' +
        '<button class="tp-chip" data-today="1">今天</button>' +
        '</div>' +
        '<div class="tp-row">' +
        '<span class="tp-lab">时间</span>' +
        '<button class="tp-step" data-h="-1">−</button>' +
        '<input class="tp-val num tp-in" data-val="h" inputmode="numeric" maxlength="2" autocomplete="off" aria-label="时">' +
        '<button class="tp-step" data-h="1">+</button>' +
        '<span class="tp-colon">:</span>' +
        '<button class="tp-step" data-m="-1">−</button>' +
        '<input class="tp-val num tp-in" data-val="m" inputmode="numeric" maxlength="2" autocomplete="off" aria-label="分">' +
        '<button class="tp-step" data-m="1">+</button>' +
        '<span class="tp-hint">24小时制</span>' +
        '</div>';
      const dateEl = panel.querySelector('[data-val="date"]');
      const hEl = panel.querySelector('[data-val="h"]');
      const mEl = panel.querySelector('[data-val="m"]');
      const todayBtn = panel.querySelector('[data-today]');
      function update() {
        const d = new Date(getT());
        dateEl.textContent = (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + WEEK[d.getDay()];
        // 正在打字的输入框不覆盖，避免输入到一半被刷掉
        if (document.activeElement !== hEl) hEl.value = p2(d.getHours());
        if (document.activeElement !== mEl) mEl.value = p2(d.getMinutes());
        todayBtn.classList.toggle('on', d.toDateString() === new Date().toDateString());
      }
      // 手动输入：失焦或回车时提交，非法/越界值自动钳制（时 0-23，分 0-59）
      function commitField(inp) {
        const field = inp.dataset.val;
        const max = field === 'h' ? 23 : 59;
        const digits = inp.value.replace(/\D/g, '');
        const v = digits === '' ? null : Math.min(max, Math.max(0, parseInt(digits, 10)));
        if (v !== null) {
          const nd = new Date(getT());
          if (field === 'h') nd.setHours(v); else nd.setMinutes(v);
          setT(nd.getTime());
          label.textContent = timeLabel(nd.getTime());
        }
        update();
      }
      [hEl, mEl].forEach(inp => {
        inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(0, 2); });
        inp.addEventListener('blur', () => commitField(inp));
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
        inp.addEventListener('focus', () => inp.select());
      });
      function apply(delta) {
        const nd = new Date(getT());
        if (delta.day) nd.setDate(nd.getDate() + delta.day);
        if (delta.h) nd.setHours(nd.getHours() + delta.h);
        if (delta.m) nd.setMinutes(nd.getMinutes() + delta.m);
        setT(nd.getTime());
        label.textContent = timeLabel(nd.getTime());
        update();
      }
      panel.querySelectorAll('[data-day]').forEach(b => holdable(b, () => apply({ day: Number(b.dataset.day) })));
      panel.querySelectorAll('[data-h]').forEach(b => holdable(b, () => apply({ h: Number(b.dataset.h) })));
      panel.querySelectorAll('[data-m]').forEach(b => holdable(b, () => apply({ m: Number(b.dataset.m) })));
      todayBtn.addEventListener('click', () => {
        const nd = new Date(getT());
        const now = new Date();
        nd.setFullYear(now.getFullYear(), now.getMonth(), now.getDate());
        setT(nd.getTime());
        label.textContent = timeLabel(nd.getTime());
        update();
      });
      update();
    }

    pill.addEventListener('click', () => {
      const open = panel.style.display === 'none';
      panel.style.display = open ? 'grid' : 'none';
      if (open) build(); // 每次展开重建骨架以同步当前值（此时无按下的指针，安全）
    });
  }

  /* ================= 场景选择（血糖） ================= */
  function scenarioChipsHTML(selected) {
    return '<div class="grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">' + L.SCENARIO_ORDER.map(s =>
      '<button class="chip" data-scn="' + s + '" style="width:100%">' + L.SCENARIOS[s] + '</button>').join('') + '</div>';
  }

  /* ================= 血糖快速记录 ================= */
  async function viewQuickGlucose(params) {
    hideTopbar();
    navActive(null);
    const view = document.getElementById('view');
    view.classList.add('no-nav');

    const editId = params.get('edit');
    const presetScenario = params.get('scenario') || null;
    const presetPremeal = params.get('premeal') || null;
    let editing = null;
    if (editId) editing = await DD.db.get('glucose', editId);

    // 来自通知：自动带出场景与食物
    let fromReminder = null;
    let presetFoods = [];
    if (presetScenario && presetPremeal) {
      const prem = await DD.db.get('glucose', presetPremeal);
      if (prem) { fromReminder = prem; presetFoods = prem.foods || []; }
    }

    const lastRem = await L.getLastReminderMinutes(DD.db);
    let curReminderMinutes = null; // 当前记录已有提醒（编辑时）
    if (editing && editing.scenario === 'premeal') {
      const rems = await DD.db.list('reminders');
      const r = rems.find(x => x.premealGlucoseId === editing.id && !x.canceled && !x.triggered);
      curReminderMinutes = r ? r.minutes : 0;
    }

    let selScenario = editing ? editing.scenario : (presetScenario || null);
    // 手动输入「吃了什么」：文本形式（多词用逗号/顿号分隔），保存时拆成数组
    let foodText = editing
      ? (editing.foods || []).map(f => f.name).join('、')
      : (presetFoods || []).map(f => f.name).join('、');
    let selReminder = editing ? (curReminderMinutes || null) : (lastRem || null);
    let time = editing ? editing.time : Date.now();
    let initialValue = editing ? String(U.glucoseToDisplay(editing.mmol, DD.settings.glucoseUnit)) : '';

    view.innerHTML =
      '<div class="quick-main">' +
      '<div class="quick-body">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;min-height:44px;padding-top:var(--safe-top)">' +
      '<button class="icon-btn" data-act="back2">' + DD.icon('arrow_back') + '</button>' +
      '<div style="text-align:center;font-size:18px;font-weight:600">' + (editing ? '编辑血糖' : '记录血糖') + '</div>' +
      '<span class="topbar-spacer"></span></div>' +

      (fromReminder ? '<div class="from-reminder">' + DD.icon('schedule') +
        '<span>来自餐后提醒：<b>' + L.fmtTime(fromReminder.time) + ' 餐前 ' + U.glucoseToDisplay(fromReminder.mmol, 'mmol') + ' mmol/L</b>，已自动选择场景与食物，直接输入血糖保存即可</span></div>' : '') +

      '<div class="value-display" style="padding:10px 0 8px">' +
      '<div class="vd-num num' + (initialValue ? '' : ' vd-empty') + '">' + (initialValue || '0') + '</div>' +
      '<div class="vd-unit">' + U.glucoseUnitLabel(DD.settings.glucoseUnit) + '</div>' +
      '<button class="time-pill" id="tp-btn">' + DD.icon('schedule') + '<span id="tp-label">' + timeLabel(time) + '</span></button>' +
      timePickerHTML() +
      '</div>' +

      '<div class="view-section" style="margin-bottom:10px">' +
      '<div class="sec-sub">测量场景</div>' + scenarioChipsHTML(selScenario) +
      '</div>' +
      '<div id="rem-sec"></div>' +

      '<div class="view-section" style="margin-bottom:8px">' +
      '<div class="sec-sub">吃了什么（可选）</div>' +
      '<input id="food-input" placeholder="直接输入，多个用逗号/顿号分隔，如：米饭、番茄炒蛋" value="' + esc(foodText) + '" autocomplete="off" style="width:100%;border:1px solid var(--outline-variant);border-radius:12px;padding:12px 14px;background:var(--surface-container);color:var(--on-surface);outline:none;font-size:15px">' +
      '</div>' +
      '</div>' +

      '<div class="quick-kp">' +
      keypadHTML() +
      '<div class="quick-save"><button class="btn btn-primary btn-lg btn-block" id="save-btn">' + (editing ? '保存修改' : '保存记录') + '</button></div>' +
      '</div>' +
      '</div>';

    // 绑定
    const root = view;
    const keypad = makeKeypad(root, () => {});
    if (initialValue) keypad.set(initialValue);

    const syncScenario = () => {
      root.querySelectorAll('[data-scn]').forEach(c => c.classList.toggle('selected', c.dataset.scn === selScenario));
      // 餐前场景动态渲染「餐后提醒」选项
      const remSec = root.querySelector('#rem-sec');
      if (selScenario === 'premeal') {
        remSec.innerHTML =
          '<div class="view-section" style="margin-bottom:14px">' +
          '<div class="sec-sub">餐后提醒</div>' +
          '<div class="reminder-opts">' + [30, 60, 120].map(m => {
            const label = m === 30 ? '餐后30分钟' : m === 60 ? '餐后1小时' : '餐后2小时';
            return '<button class="chip" data-rem="' + m + '">' + label + '</button>';
          }).join('') + '<button class="chip" data-rem="0">不提醒</button></div>' +
          '<div class="hint-text">提醒将从本条餐前记录的时间开始计时</div></div>';
        remSec.querySelectorAll('[data-rem]').forEach(c => c.addEventListener('click', () => {
          const v = parseInt(c.dataset.rem, 10);
          selReminder = v === 0 ? 0 : v;
          syncScenario();
        }));
      } else {
        remSec.innerHTML = '';
        selReminder = null;
      }
      root.querySelectorAll('#rem-sec [data-rem]').forEach(c => c.classList.toggle('selected', String(selReminder) === c.dataset.rem));
    };
    root.querySelectorAll('[data-scn]').forEach(c => c.addEventListener('click', () => { selScenario = c.dataset.scn; syncScenario(); }));
    // 手动输入「吃了什么」：保存时同步到 foodText（输入框为受控状态）
    const foodInput = root.querySelector('#food-input');
    if (foodInput) foodInput.addEventListener('input', () => { foodText = foodInput.value; });
    root.querySelector('[data-act="back2"]').addEventListener('click', () => history.back());
    bindTimePicker(root, () => time, t => { time = t; });

    root.querySelector('#save-btn').addEventListener('click', async () => {
      const valStr = keypad.get();
      if (!valStr) { toast('请输入血糖值', 'error'); return; }
      if (!selScenario) { toast('请选择测量场景', 'error'); return; }
      const mmol = U.parseGlucoseInput(valStr, DD.settings.glucoseUnit);
      if (!mmol) { toast('数值无效', 'error'); return; }

      const doSave = async () => {
        const foods = (foodText || '').split(/[,，、;；\s]+/).map(s => s.trim()).filter(Boolean).map(name => ({ name }));
        if (editing) {
          const changes = { time, mmol, scenario: selScenario, foods };
          // 提醒只在发生变化时传入
          const newRem = selReminder == null ? null : (selReminder === 0 ? 0 : selReminder);
          const cur = curReminderMinutes == null ? null : curReminderMinutes;
          if (newRem !== cur) changes.reminderMinutes = newRem;
          const res = await L.updateGlucose(DD.db, editing.id, changes);
          if (!res) return;
          if (res.unreasonableLinks.length) {
            const keep = await dialog({
              title: '关联需要处理', html: '修改后，部分餐后血糖与原餐前的关联已不合理。保持关联，还是解除关联？',
              buttons: [
                { label: '保持原关联', value: true, kind: 'primary' },
                { label: '解除关联', value: false, kind: 'danger' }
              ]
            });
            if (keep === false) await L.unlinkPostMeals(DD.db, res.unreasonableLinks);
          }
          toast('已保存');
          navigate('glucose/' + editing.id);
        } else {
          const res = await L.addGlucose(DD.db, {
            time, mmol, scenario: selScenario, foods,
            premealId: presetPremeal,
            reminderMinutes: selScenario === 'premeal' ? (selReminder || 0) : undefined
          });
          toast('已保存');
          navigate('home');
        }
      };

      if (U.isAbnormalGlucose(mmol)) {
        const ok = await dialog({
          title: '数值可能有误', html: '血糖 ' + valStr + ' ' + U.glucoseUnitLabel(DD.settings.glucoseUnit) + ' 明显超出常见范围，确认仍要保存？',
          buttons: [
            { label: '取消', value: false, kind: 'ghost' },
            { label: '仍然保存', value: true, kind: 'danger' }
          ]
        });
        if (!ok) return;
      }
      await doSave();
    });
    syncScenario();
  }
  function timeLabel(ts) {
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return (sameDay ? '今日 ' : L.fmtDateCN(ts) + ' ') + L.fmtTime(ts);
  }

  /* ================= 体重快速记录 ================= */
  async function viewQuickWeight(params) {
    hideTopbar();
    navActive(null);
    const view = document.getElementById('view');
    view.classList.add('no-nav');

    const editId = params.get('edit');
    let editing = null;
    if (editId) editing = await DD.db.get('weight', editId);
    let time = editing ? editing.time : Date.now();
    let initialValue = editing ? String(U.weightToDisplay(editing.kg, DD.settings.weightUnit)) : '';

    view.innerHTML =
      '<div class="quick-main">' +
      '<div class="quick-body">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;min-height:44px;padding-top:var(--safe-top)">' +
      '<button class="icon-btn" data-act="back2">' + DD.icon('arrow_back') + '</button>' +
      '<div style="text-align:center;font-size:18px;font-weight:600">' + (editing ? '编辑体重' : '记录体重') + '</div>' +
      '<span class="topbar-spacer"></span></div>' +
      '<div class="value-display" style="padding:20px 0 8px">' +
      '<div class="vd-num num' + (initialValue ? '' : ' vd-empty') + '">' + (initialValue || '0') + '</div>' +
      '<div class="vd-unit">' + U.weightUnitLabel(DD.settings.weightUnit) + '</div>' +
      '<button class="time-pill" id="tp-btn">' + DD.icon('schedule') + '<span id="tp-label">' + timeLabel(time) + '</span></button>' +
      timePickerHTML() +
      '</div>' +
      '</div>' +
      '<div class="quick-kp">' +
      keypadHTML() +
      '<div class="quick-save"><button class="btn btn-primary btn-lg btn-block" id="save-btn">' + (editing ? '保存修改' : '保存记录') + '</button></div>' +
      '</div>' +
      '</div>';

    const keypad = makeKeypad(view, () => {});
    if (initialValue) keypad.set(initialValue);

    view.querySelector('[data-act="back2"]').addEventListener('click', () => history.back());
    bindTimePicker(view, () => time, t => { time = t; });

    view.querySelector('#save-btn').addEventListener('click', async () => {
      const valStr = keypad.get();
      if (!valStr) { toast('请输入体重值', 'error'); return; }
      const kg = U.parseWeightInput(valStr, DD.settings.weightUnit);
      if (!kg) { toast('数值无效', 'error'); return; }
      const doSave = async () => {
        if (editing) { await L.updateWeight(DD.db, editing.id, { time, kg }); toast('已保存'); navigate('weight/' + editing.id); }
        else { await L.addWeight(DD.db, { time, kg }); toast('已保存'); navigate('home'); }
      };
      if (U.isAbnormalWeight(kg)) {
        const ok = await dialog({
          title: '数值可能有误', html: '体重 ' + valStr + ' ' + U.weightUnitLabel(DD.settings.weightUnit) + ' 明显超出常见范围，确认仍要保存？',
          buttons: [
            { label: '取消', value: false, kind: 'ghost' },
            { label: '仍然保存', value: true, kind: 'danger' }
          ]
        });
        if (!ok) return;
      }
      await doSave();
    });
  }

  /* ================= 历史记录 ================= */
  async function viewHistory(params) {
    renderTopbar();
    navActive(null);
    const view = document.getElementById('view');
    view.classList.remove('no-nav');
    const type = params.get('type') === 'weight' ? 'weight' : 'glucose';

    const render = async () => {
      const list = type === 'glucose' ? await DD.db.list('glucose') : await DD.db.list('weight');
      const groups = L.groupByDay(list);
      let html = '<div class="seg" style="margin-bottom:16px">' +
        '<button data-t="glucose"' + (type === 'glucose' ? ' class="active"' : '') + '>血糖</button>' +
        '<button data-t="weight"' + (type === 'weight' ? ' class="active"' : '') + '>体重</button></div>';
      if (!groups.length) {
        html += '<div class="card"><div class="empty-state">' + DD.icon('history') + '<p>暂无' + (type === 'glucose' ? '血糖' : '体重') + '记录</p></div></div>';
      } else {
        for (const g of groups) {
          html += '<div class="group-title">' + esc(g.label) + '<span class="g-sub">' + g.items.length + ' 条</span></div>';
          for (const it of g.items) {
            if (type === 'glucose') {
              const d = fmtGlucose(it.mmol);
              html += '<button class="hist-item" data-goto="glucose/' + it.id + '">' +
                '<div style="display:flex;flex-direction:column;gap:1px"><span class="hi-time">' + L.fmtTime(it.time) + '</span>' +
                '<span class="hi-scenario">' + (L.SCENARIOS[it.scenario] || '') + '</span></div>' +
                '<span class="hi-value num">' + d.v + ' <span class="hi-unit">' + d.u + '</span></span></button>';
            } else {
              const d = fmtWeight(it.kg);
              html += '<button class="hist-item" data-goto="weight/' + it.id + '">' +
                '<div style="display:flex;flex-direction:column;gap:1px"><span class="hi-time">' + L.fmtTime(it.time) + '</span>' +
                '<span class="hi-scenario">体重</span></div>' +
                '<span class="hi-value num">' + d.v + ' <span class="hi-unit">' + d.u + '</span></span></button>';
            }
          }
        }
      }
      view.innerHTML = html;
      view.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => navigate('history?type=' + b.dataset.t)));
      view.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => navigate(b.dataset.goto)));
    };
    await render();
  }

  /* ================= 血糖详情 ================= */
  async function viewGlucoseDetail(id) {
    renderTopbar();
    navActive(null);
    const view = document.getElementById('view');
    view.classList.remove('no-nav');
    const render = async () => {
      const g = await DD.db.get('glucose', id);
      if (!g) { view.innerHTML = '<div class="empty-state"><p>记录不存在</p></div>'; return; }
      const glucose = await DD.db.list('glucose');
      const prem = g.premealId ? glucose.find(x => x.id === g.premealId) : null;
      const d = fmtGlucose(g.mmol);
      const foods = g.foods && g.foods.length ? g.foods.map(f => f.name).join('、') : null;
      view.innerHTML =
        '<div class="detail-hero">' +
        '<div class="dh-value num">' + d.v + ' <span class="dh-unit">' + d.u + '</span></div>' +
        '<div class="dh-scenario">' + (L.SCENARIOS[g.scenario] || '') + '</div>' +
        '<div class="dh-time">' + L.fmtDateFull(g.time) + ' ' + L.fmtTime(g.time) + '</div></div>' +
        '<div class="card" style="margin-bottom:14px">' +
        detailRow('时间', L.fmtDateFull(g.time) + ' ' + L.fmtTime(g.time)) +
        detailRow('血糖', d.v + ' ' + d.u) +
        detailRow('场景', L.SCENARIOS[g.scenario] || '') +
        detailRow('吃了什么', foods || '—') +
        detailRow('对应餐前', prem ? '<div style="text-align:right"><div class="num" style="font-size:20px;font-weight:700">' + fmtGlucose(prem.mmol).v + ' ' + fmtGlucose(prem.mmol).u + '</div>' +
          '<div class="hint-text">' + L.fmtTime(prem.time) + (prem.foods && prem.foods.length ? ' · ' + esc(prem.foods.map(f => f.name).join('、')) : '') + '</div></div>' : '—') +
        '</div>' +
        '<div style="display:flex;gap:10px">' +
        '<button class="btn btn-primary" style="flex:1" data-act="edit">' + DD.icon('edit', 18) + '编辑</button>' +
        '<button class="btn btn-danger" style="flex:1" data-act="del">' + DD.icon('delete', 18) + '删除</button></div>';
      view.querySelector('[data-act="edit"]').addEventListener('click', () => navigate('quick/glucose?edit=' + g.id));
      view.querySelector('[data-act="del"]').addEventListener('click', async () => {
        const ok = await confirmDlg('删除这条血糖记录？', '删除后不可恢复。若为餐前记录，其餐后记录会保留并解除关联。', '删除');
        if (!ok) return;
        await L.deleteGlucose(DD.db, g.id);
        toast('已删除');
        navigate('history?type=glucose');
      });
    };
    await render();
  }
  function detailRow(label, valueHTML) {
    return '<div class="detail-row"><span class="dr-label">' + label + '</span><span class="dr-value">' + valueHTML + '</span></div>';
  }

  /* ================= 体重详情 ================= */
  async function viewWeightDetail(id) {
    renderTopbar();
    navActive(null);
    const view = document.getElementById('view');
    view.classList.remove('no-nav');
    const render = async () => {
      const w = await DD.db.get('weight', id);
      if (!w) { view.innerHTML = '<div class="empty-state"><p>记录不存在</p></div>'; return; }
      const all = await DD.db.list('weight');
      const idx = all.findIndex(x => x.id === id);
      const prev = idx > 0 ? all[idx - 1] : null;
      const delta = prev ? Math.round((w.kg - prev.kg) * 1000) / 1000 : null;
      const d = fmtWeight(w.kg);
      let deltaHtml = '—';
      if (delta != null) {
        const abs = U.weightToDisplay(Math.abs(delta), DD.settings.weightUnit);
        deltaHtml = DD.icon(delta < 0 ? 'arrow_downward' : delta > 0 ? 'arrow_upward' : 'check', 16) + ' ' + abs + ' ' + U.weightUnitLabel(DD.settings.weightUnit);
      }
      view.innerHTML =
        '<div class="detail-hero">' +
        '<div class="dh-value num">' + d.v + ' <span class="dh-unit">' + d.u + '</span></div>' +
        '<div class="dh-time">' + L.fmtDateFull(w.time) + ' ' + L.fmtTime(w.time) + '</div></div>' +
        '<div class="card" style="margin-bottom:14px">' +
        detailRow('日期', L.fmtDateFull(w.time)) +
        detailRow('时间', L.fmtTime(w.time)) +
        detailRow('体重', d.v + ' ' + d.u) +
        detailRow('较上一条变化', deltaHtml) +
        '</div>' +
        '<div style="display:flex;gap:10px">' +
        '<button class="btn btn-primary" style="flex:1" data-act="edit">' + DD.icon('edit', 18) + '编辑</button>' +
        '<button class="btn btn-danger" style="flex:1" data-act="del">' + DD.icon('delete', 18) + '删除</button></div>';
      view.querySelector('[data-act="edit"]').addEventListener('click', () => navigate('quick/weight?edit=' + w.id));
      view.querySelector('[data-act="del"]').addEventListener('click', async () => {
        const ok = await confirmDlg('删除这条体重记录？', '删除后不可恢复。', '删除');
        if (!ok) return;
        await L.deleteWeight(DD.db, w.id);
        toast('已删除');
        navigate('history?type=weight');
      });
    };
    await render();
  }

  /* ================= 趋势 ================= */
  async function viewTrend(params) {
    renderTopbar();
    navActive('trend');
    const view = document.getElementById('view');
    view.classList.remove('no-nav');
    const type = params.get('type') === 'weight' ? 'weight' : 'glucose';
    let chart = null;
    let chartDate = Date.now(); // 血糖：当前查看的日期
    const DAY = 86400000;

    const render = async () => {
      view.innerHTML =
        '<div class="seg" style="margin-bottom:16px">' +
        '<button data-t="glucose"' + (type === 'glucose' ? ' class="active"' : '') + '>血糖</button>' +
        '<button data-t="weight"' + (type === 'weight' ? ' class="active"' : '') + '>体重</button></div>' +
        '<div id="chart-area"></div>';

      view.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => navigate('trend?type=' + b.dataset.t)));

      const area = view.querySelector('#chart-area');

      if (type === 'glucose') {
        const all = await DD.db.list('glucose');
        const t0 = L.startOfDay(chartDate);
        const day = all.filter(g => g.time >= t0 && g.time < t0 + DAY);
        const avg = day.length ? (day.reduce((s, g) => s + g.mmol, 0) / day.length) : null;
        const dnLabel = dayLabel0(t0);

        area.innerHTML =
          '<div class="date-nav">' +
          '<button data-dn="prev" aria-label="前一天">' + DD.icon('chevron_left') + '</button>' +
          '<div class="dn-label">' + esc(dnLabel) + '</div>' +
          '<button data-dn="next" aria-label="后一天">' + DD.icon('chevron_right_big') + '</button></div>' +
          '<div class="chart-card">' +
          '<div class="chart-summary">' +
          '<div><div class="cs-label">今日平均</div>' +
          '<div class="cs-value num">' + (avg != null ? U.glucoseToDisplay(avg, DD.settings.glucoseUnit) : '—') +
          ' <span class="cs-unit">' + U.glucoseUnitLabel(DD.settings.glucoseUnit) + '</span></div>' +
          '<div class="hint-text" style="margin-top:2px">共 ' + day.length + ' 条记录</div></div>' +
          '<span class="cs-badge"><span class="bd-dot"></span>全部数据点</span></div>' +
          '<div id="chart-wrap"></div>' +
          '<div class="chart-hint">左右拖动平移 · 双指或按钮缩放 · 点按数据点看详情</div></div>';

        area.querySelector('[data-dn="prev"]').addEventListener('click', () => { chartDate = t0 - DAY; render(); });
        area.querySelector('[data-dn="next"]').addEventListener('click', () => { chartDate = t0 + DAY; render(); });

        const pts = day.map(g => ({
          t: g.time, v: g.mmol,
          scenario: L.SCENARIOS[g.scenario],
          foods: (g.foods || []).map(f => f.name)
        })).sort((a, b) => a.t - b.t);
        const wrap = area.querySelector('#chart-wrap');
        if (chart) { chart.destroy(); chart = null; }
        chart = DD.Chart.render(wrap, {
          points: pts,
          domain: [t0, t0 + DAY],
          bounds: [t0, t0 + DAY],
          minSpan: 2 * 3600000,
          maxSpan: DAY,
          formatX: t => L.fmtTime(t),
          formatY: v => String(U.glucoseToDisplay(v, DD.settings.glucoseUnit)),
          unit: U.glucoseUnitLabel(DD.settings.glucoseUnit),
          emptyText: '今天还没有血糖记录'
        });

        // 当日列表
        if (day.length) {
          const sorted = day.slice().sort((a, b) => b.time - a.time);
          const list = document.createElement('div');
          list.style.marginTop = '16px';
          list.innerHTML = '<div class="sec-sub">当日记录</div><div class="tl-outer">' + sorted.map(g => {
            const d = fmtGlucose(g.mmol);
            return '<div class="tl-row-item" data-goto="glucose/' + g.id + '">' +
              '<div class="dot"></div>' +
              '<div style="flex:1;display:flex;justify-content:space-between;align-items:center;background:var(--surface);border:1px solid color-mix(in srgb,var(--outline-variant) 22%,transparent);border-radius:12px;padding:12px 14px">' +
              '<div><div class="hi-time" style="font-family:var(--font-mono);font-size:13px;color:var(--outline)">' + L.fmtTime(g.time) + '</div>' +
              '<div style="font-size:14px;color:var(--on-surface-variant)">' + (L.SCENARIOS[g.scenario] || '') + '</div></div>' +
              '<div class="num" style="font-size:22px;font-weight:700">' + d.v + ' <span style="font-size:13px;color:var(--on-surface-variant);font-weight:400">' + d.u + '</span></div>' +
              '</div></div>';
          }).join('') + '</div></div>';
          area.appendChild(list);
          list.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => navigate(b.dataset.goto)));
        }
      } else {
        // 体重：默认最近30天
        const all = await DD.db.list('weight');
        const now = Date.now();
        const tEnd = L.startOfDay(now) + DAY;
        const tStart = tEnd - 30 * DAY;
        const range = all.filter(w => w.time >= tStart && w.time < tEnd);
        const avg = range.length ? range.reduce((s, w) => s + w.kg, 0) / range.length : null;
        const latestW = range.length ? range[range.length - 1] : null;

        area.innerHTML =
          '<div class="chart-card">' +
          '<div class="chart-summary">' +
          '<div><div class="cs-label">近30天平均</div>' +
          '<div class="cs-value num">' + (avg != null ? U.weightToDisplay(avg, DD.settings.weightUnit) : '—') +
          ' <span class="cs-unit">' + U.weightUnitLabel(DD.settings.weightUnit) + '</span></div>' +
          '<div class="hint-text" style="margin-top:2px">共 ' + range.length + ' 条记录</div></div>' +
          '<span class="cs-badge"><span class="bd-dot"></span>真实数据</span></div>' +
          '<div id="chart-wrap"></div>' +
          '<div class="chart-hint">左右拖动平移 · 双指或按钮缩放 · 点按数据点看详情</div></div>';

        const pts = range.map((w, i) => {
          const prevW = i > 0 ? range[i - 1] : null;
          const delta = prevW ? Math.round((w.kg - prevW.kg) * 1000) / 1000 : null;
          return { t: w.time, v: w.kg, scenario: '体重', delta, foods: [] };
        });
        const wrap = area.querySelector('#chart-wrap');
        if (chart) { chart.destroy(); chart = null; }
        const lo = Math.min(tStart, all.length ? all[0].time : tStart);
        chart = DD.Chart.render(wrap, {
          points: pts,
          domain: [tStart, tEnd],
          bounds: [lo, tEnd],
          minSpan: DAY,
          maxSpan: 90 * DAY,
          formatX: t => {
            const d = new Date(t);
            return (d.getMonth() + 1) + '/' + d.getDate();
          },
          formatY: v => String(U.weightToDisplay(v, DD.settings.weightUnit)),
          unit: U.weightUnitLabel(DD.settings.weightUnit),
          emptyText: '近30天还没有体重记录'
        });

        // 最近10条
        if (range.length) {
          const recent = range.slice(-10).reverse();
          const list = document.createElement('div');
          list.style.marginTop = '16px';
          list.innerHTML = '<div class="sec-sub">最近记录</div><div class="tl-outer">' + recent.map(w => {
            const d = fmtWeight(w.kg);
            const idx = range.findIndex(x => x.id === w.id);
            const prevW = idx > 0 ? range[idx - 1] : null;
            const delta = prevW ? Math.round((w.kg - prevW.kg) * 1000) / 1000 : null;
            const dt = delta != null ? (delta < 0 ? '↓' : delta > 0 ? '↑' : '·') + ' ' + U.weightToDisplay(Math.abs(delta), DD.settings.weightUnit) + ' ' + U.weightUnitLabel(DD.settings.weightUnit) : '';
            return '<div class="tl-row-item" data-goto="weight/' + w.id + '">' +
              '<div class="dot"></div>' +
              '<div style="flex:1;display:flex;justify-content:space-between;align-items:center;background:var(--surface);border:1px solid color-mix(in srgb,var(--outline-variant) 22%,transparent);border-radius:12px;padding:12px 14px">' +
              '<div><div class="hi-time" style="font-family:var(--font-mono);font-size:13px;color:var(--outline)">' + L.fmtDateCN(w.time) + ' ' + L.fmtTime(w.time) + '</div>' +
              '<div style="font-size:13px;color:var(--on-surface-variant)">' + dt + '</div></div>' +
              '<div class="num" style="font-size:22px;font-weight:700">' + d.v + ' <span style="font-size:13px;color:var(--on-surface-variant);font-weight:400">' + d.u + '</span></div>' +
              '</div></div>';
          }).join('') + '</div></div>';
          area.appendChild(list);
          list.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => navigate(b.dataset.goto)));
        }
      }
    };
    await render();
    return () => { if (chart) chart.destroy(); };
  }
  function dayLabel0(t0) {
    const d = new Date(t0), now = new Date();
    const wd = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    if (d.toDateString() === now.toDateString()) return '今天';
    if (d.getTime() === L.startOfDay(Date.now()) - 86400000) return '昨天';
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + wd;
  }

  /* ================= 提醒详情 ================= */
  async function viewReminderDetail(id) {
    renderTopbar();
    navActive(null);
    const view = document.getElementById('view');
    view.classList.remove('no-nav');
    const render = async () => {
      const r = await DD.db.get('reminders', id);
      if (!r || r.canceled || r.triggered) {
        view.innerHTML = '<div class="card"><div class="empty-state">' + DD.icon('schedule') + '<p>该提醒已结束</p></div></div>';
        return;
      }
      const prem = await DD.db.get('glucose', r.premealGlucoseId);
      const d = prem ? fmtGlucose(prem.mmol) : null;
      const remLabel = r.minutes === 30 ? '餐后30分钟' : r.minutes === 60 ? '餐后1小时' : '餐后2小时';
      view.innerHTML =
        '<div class="detail-hero" style="padding:20px 0 12px">' +
        '<div class="dh-scenario" style="font-size:15px">等待中 · ' + remLabel + ' 提醒</div>' +
        '<div class="dh-time" style="margin-top:6px">预计提醒：' + L.fmtDateFull(r.targetTime) + ' ' + L.fmtTime(r.targetTime) + '</div></div>' +
        '<div class="card" style="margin-bottom:14px">' +
        detailRow('对应餐前血糖', prem ? '<div style="text-align:right"><div class="num" style="font-size:22px;font-weight:700">' + d.v + ' ' + d.u + '</div>' +
          '<div class="hint-text">' + (L.SCENARIOS[prem.scenario] || '') + '</div></div>' : '记录已删除') +
        detailRow('餐前记录时间', prem ? L.fmtDateFull(prem.time) + ' ' + L.fmtTime(prem.time) : '—') +
        detailRow('当前提醒类型', remLabel) +
        detailRow('提醒时间起点', prem ? L.fmtTime(prem.time) : '—') +
        '</div>' +
        '<div style="display:flex;gap:10px">' +
        '<button class="btn btn-primary" style="flex:1" data-act="modify">' + DD.icon('edit', 18) + '修改提醒</button>' +
        '<button class="btn btn-danger" style="flex:1" data-act="cancel">' + DD.icon('close', 18) + '取消提醒</button></div>';

      view.querySelector('[data-act="cancel"]').addEventListener('click', async () => {
        const ok = await confirmDlg('取消这个餐后提醒？', '取消后不会再有通知。', '取消提醒');
        if (!ok) return;
        await L.cancelReminder(DD.db, r.id);
        toast('已取消提醒');
        navigate('home');
      });
      view.querySelector('[data-act="modify"]').addEventListener('click', async () => {
        if (!prem) { toast('对应餐前记录已删除', 'error'); return; }
        const choice = await dialog({
          title: '修改提醒', html: '选择新的提醒时间（从餐前记录时间开始计算）：',
          buttons: [
            { label: '餐后30分钟', value: 30 },
            { label: '餐后1小时', value: 60 },
            { label: '餐后2小时', value: 120 },
            { label: '不提醒', value: 0, kind: 'ghost' }
          ]
        });
        if (choice == null) return;
        if (choice === 0) {
          await L.cancelReminder(DD.db, r.id);
          toast('已取消提醒');
        } else {
          r.minutes = choice;
          r.targetTime = prem.time + choice * 60000;
          await DD.db.put('reminders', r);
          toast('已更新提醒');
        }
        render();
      });
    };
    await render();
  }

  /* ================= 设置 ================= */
  async function viewSettings() {
    renderTopbar();
    navActive('settings');
    const view = document.getElementById('view');
    view.classList.remove('no-nav');
    const render = async () => {
      const gluUnit = DD.settings.glucoseUnit;
      const wtUnit = DD.settings.weightUnit;
      const perm = DD.notify.permission(); // granted | denied | default | unsupported
      const isNative = !!window.__nativeApp;
      const permText = perm === 'granted' ? '已开启' : perm === 'denied' ? '未开启' : perm === 'default' ? '未授权' : '当前环境不支持';
      const showBanner = perm === 'denied' || perm === 'default';

      view.innerHTML =
        (showBanner ? '<div class="notice-banner">' +
          '<span class="nb-icon">' + DD.icon('notifications_off') + '</span>' +
          '<div style="flex:1"><h3>通知未开启</h3><p>餐后提醒可能无法正常发送</p></div>' +
          '<button class="btn btn-primary" data-act="open-notif" style="min-height:40px;padding:0 16px;font-size:14px">' + (perm === 'denied' ? '去设置' : '开启通知') + '</button></div>' : '') +

        '<div class="settings-card" style="margin-bottom:12px">' +
        '<button class="list-row" data-act="notif-row" style="width:100%">' +
        '<span class="list-label"><span class="ic">' + DD.icon('notifications') + '</span>通知权限</span>' +
        '<span class="list-value">' + permText +
        (isNative ? '<span class="hint-text" style="display:inline;margin-left:6px">' + DD.icon('chevron_right', 18) + '</span>' : '') +
        '</span></button>' +
        '<div class="list-row" style="padding:8px 16px 14px"><span class="hint-text" style="margin-top:0">' +
        (isNative ? '点击此行可查看/修改系统通知设置。' : '系统通知用于发送餐后提醒；权限关闭时提醒无法弹出。数据保存在手机本地，无需联网。') +
        '</span></div></div>' +

        '<div class="settings-card" style="margin-bottom:12px">' +
        '<div class="list-row"><span class="list-label"><span class="ic">' + DD.icon('water_drop') + '</span>血糖单位</span>' +
        '<span class="unit-opt" data-set="glucoseUnit">' +
        '<button data-u="mmol"' + (gluUnit === 'mmol' ? ' class="active"' : '') + '>mmol/L</button>' +
        '<button data-u="mgdl"' + (gluUnit === 'mgdl' ? ' class="active"' : '') + '>mg/dL</button></span></div>' +
        '<div class="list-row"><span class="list-label"><span class="ic">' + DD.icon('scale') + '</span>体重单位</span>' +
        '<span class="unit-opt" data-set="weightUnit">' +
        '<button data-u="kg"' + (wtUnit === 'kg' ? ' class="active"' : '') + '>公斤</button>' +
        '<button data-u="jin"' + (wtUnit === 'jin' ? ' class="active"' : '') + '>斤</button></span></div>' +
        '<div class="list-row" style="padding:8px 16px 14px"><span class="hint-text" style="margin-top:0">全局统一切换：首页、历史、趋势、详情、导出都会跟随；数据本身不受影响。</span></div></div>' +

        '<div class="settings-card" style="margin-bottom:12px">' +
        '<button class="list-row" data-act="history"><span class="list-label"><span class="ic">' + DD.icon('history') + '</span>历史记录</span><span class="list-value">' + DD.icon('chevron_right', 20) + '</span></button>' +
        '</div>' +

        '<div style="padding:10px 0 6px">' +
        '<button class="btn btn-block" style="background:var(--surface-container);color:var(--on-surface-variant);height:52px;border-radius:14px;font-family:var(--font-mono);font-size:14px;letter-spacing:0.02em" data-act="export">' +
        DD.icon('download', 18) + '导出全部数据</button>' +
        '<div class="hint-text" style="text-align:center">一次导出：全部血糖 + 全部体重（含每条记录的「吃了什么」）</div></div>' +

        '<div class="settings-card" style="margin-top:16px">' +
        '<div class="list-row"><span class="list-label"><span class="ic">' + DD.icon('info') + '</span>关于</span></div>' +
        '<div class="list-row" style="padding:8px 16px 14px"><span class="hint-text" style="margin-top:0">点点 v1.0.0 · 完全离线 · 数据仅保存在本机，无账号、无云同步。</span></div></div>';

      // 单位切换
      view.querySelectorAll('[data-set]').forEach(seg => {
        seg.querySelectorAll('button').forEach(b => b.addEventListener('click', async () => {
          const key = seg.dataset.set;
          const val = b.dataset.u;
          await DD.db.settingsSet(key, val);
          DD.settings[key] = val;
          seg.querySelectorAll('button').forEach(x => x.classList.toggle('active', x.dataset.u === val));
          toast('已切换单位');
          renderAllViews();
        }));
      });

      // 通知：真实权限状态 + 跳系统设置
      view.querySelector('[data-act="notif-row"]')?.addEventListener('click', () => {
        // 原生：直接打开系统通知设置；Web：仅提示
        if (!DD.notify.openSettings()) {
          dialog({
            title: '通知权限', html: '当前状态：' + permText + '。请在系统设置中找到「点点」允许通知权限。',
            buttons: [{ label: '知道了', value: true }]
          });
        }
      });
      view.querySelector('[data-act="open-notif"]')?.addEventListener('click', async () => {
        if (perm === 'denied') {
          // 已拒绝：跳系统设置
          if (!DD.notify.openSettings()) {
            await dialog({
              title: '通知权限已关闭', html: '请在系统设置中找到「点点」，允许通知权限后返回。',
              buttons: [{ label: '知道了', value: true }]
            });
          }
        } else if (perm === 'default') {
          const r = await DD.notify.requestPermission();
          if (r === 'granted') { toast('通知已开启'); }
          else if (r === 'requesting') { toast('请在系统弹窗中选择允许'); }
          else { toast('未获得通知权限', 'error'); }
          render();
        }
      });

      view.querySelector('[data-act="history"]')?.addEventListener('click', () => navigate('history'));
      view.querySelector('[data-act="export"]')?.addEventListener('click', exportAll);
    };
    await render();
  }

  // 全局重渲染（单位切换后）
  function renderAllViews() {
    const h = location.hash.replace(/^#\/?/, '');
    route(h);
  }

  /* ================= 导出 ================= */
  async function exportAll() {
    toast('正在生成导出文件…');
    try {
      const csv = await L.buildExportCSV(DD.db, DD.settings);
      // Android 原生容器：交给原生生成文件并调起系统分享
      if (window.NativeBridge && typeof window.NativeBridge.shareText === 'function') {
        try { window.NativeBridge.shareText(csv, '点点数据导出.csv'); return; } catch (e) { /* 降级 */ }
      }
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const file = new File([blob], '点点数据导出.csv', { type: 'text/csv;charset=utf-8' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: '点点数据导出' });
          return;
        } catch (e) { if (e.name === 'AbortError') return; }
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '点点数据导出.csv';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
      toast('已下载：点点数据导出.csv');
    } catch (e) {
      console.error(e);
      toast('导出失败', 'error');
    }
  }

  /* ================= 路由 ================= */
  async function route(hash) {
    closeSheet();
    const [pathPart, qs] = hash.split('?');
    const seg = pathPart.split('/').filter(Boolean);
    const params = new URLSearchParams(qs || '');
    const view = document.getElementById('view');
    if (view._cleanup) { try { view._cleanup(); } catch (e) { } view._cleanup = null; }

    // 快速记录页为全屏录入页：隐藏底部导航，避免键盘/保存栏被导航挤压遮挡
    const nav = document.querySelector('.bottom-nav');
    const isQuick = seg[0] === 'quick';
    nav.style.display = isQuick ? 'none' : '';
    if (isQuick) view.classList.add('no-nav'); else view.classList.remove('no-nav');

    let cleanup = null;
    try {
      if (seg.length === 0 || seg[0] === 'home') cleanup = await viewHome();
      else if (seg[0] === 'quick' && seg[1] === 'glucose') await viewQuickGlucose(params);
      else if (seg[0] === 'quick' && seg[1] === 'weight') await viewQuickWeight(params);
      else if (seg[0] === 'history') await viewHistory(params);
      else if (seg[0] === 'glucose' && seg[1]) await viewGlucoseDetail(seg[1]);
      else if (seg[0] === 'weight' && seg[1]) await viewWeightDetail(seg[1]);
      else if (seg[0] === 'trend') cleanup = await viewTrend(params);
      else if (seg[0] === 'reminder' && seg[1]) await viewReminderDetail(seg[1]);
      else if (seg[0] === 'settings') await viewSettings();
      else cleanup = await viewHome();
    } catch (e) {
      console.error(e);
      view.innerHTML = '<div class="empty-state"><p>页面出错了</p></div>';
    }
    if (typeof cleanup === 'function') view._cleanup = cleanup;
    window.scrollTo(0, 0);
  }

  window.DD = window.DD || {};
  DD.ui = {
    route, navigate, toast, dialog, confirmDlg, promptDlg, openSheet, closeSheet, renderAllViews,
    esc, el
  };
})();
