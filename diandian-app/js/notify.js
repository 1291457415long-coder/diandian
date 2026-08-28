/* 点点 — 本地通知
   浏览器：Service Worker + 调度器
   Android 原生容器（WebView）：通过 NativeBridge 读取系统真实通知权限 */
(function () {
  'use strict';

  const SW_URL = 'sw.js';
  let _reg = null;
  let _ticker = null;
  let _lastCheck = 0;

  function nativeBridge() {
    try {
      if (window.__nativeApp && window.NativeBridge) return window.NativeBridge;
    } catch (e) { /* 忽略 */ }
    return null;
  }
  // Android 系统真实权限：'granted' | 'denied'（同步 JS 桥）
  function nativePerm() {
    const nb = nativeBridge();
    if (nb && typeof nb.getNotificationPermission === 'function') {
      try {
        const r = nb.getNotificationPermission();
        if (r === 'granted' || r === 'denied') return r;
      } catch (e) { /* 忽略 */ }
    }
    return null;
  }
  function isNative() { return !!window.__nativeApp; }

  function supported() {
    if (isNative()) return true; // 原生容器：通知能力由 Android 系统决定（见 permission()）
    return 'Notification' in window;
  }

  // 统一权限状态：'granted' | 'denied' | 'default' | 'unsupported'
  function permission() {
    const np = nativePerm();
    if (np) return np;
    if (!supported()) return 'unsupported';
    return Notification.permission;
  }

  async function registerSW() {
    try {
      if (!isNative() && 'serviceWorker' in navigator &&
          (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
        _reg = await navigator.serviceWorker.register(SW_URL, { scope: './' });
      }
    } catch (e) {
      console.warn('SW 注册失败（WebView/预览环境常见）：', e);
    }
    return _reg;
  }

  // 请求权限（首次使用时 / 用户主动开启）
  async function requestPermission() {
    const nb = nativeBridge();
    if (nb && typeof nb.requestNotificationPermission === 'function') {
      try {
        nb.requestNotificationPermission(); // 原生发起系统弹窗，结果通过 appresume 事件回流
        return 'requesting';
      } catch (e) { return permission(); }
    }
    if (!supported()) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    try {
      return await Notification.requestPermission();
    } catch (e) {
      return Notification.permission;
    }
  }

  // 打开系统通知设置（原生容器）；Web 环境返回 false
  function openSettings() {
    const nb = nativeBridge();
    if (nb && typeof nb.openNotificationSettings === 'function') {
      try { nb.openNotificationSettings(); return true; } catch (e) { /* 忽略 */ }
    }
    return false;
  }

  function reminderLabel(minutes) {
    if (minutes === 30) return '餐后30分钟';
    if (minutes === 60) return '餐后1小时';
    if (minutes === 120) return '餐后2小时';
    return '餐后提醒';
  }

  // 展示一条通知；优先走 SW（点击可路由回 App），否则页面直接弹
  async function showNotif(reminder, premeal) {
    const scenarioKey = 'post' + reminder.minutes;
    const route = '#/quick/glucose?scenario=' + scenarioKey + '&premeal=' + encodeURIComponent(reminder.premealGlucoseId);
    const title = '点点提醒：该测' + reminderLabel(reminder.minutes) + '血糖了';
    const body = premeal
      ? (DD.logic.fmtTime(premeal.time) + ' 餐前 ' + DD.units.glucoseToDisplay(premeal.mmol, 'mmol') + ' mmol/L')
      : '请测量并记录血糖';
    const opts = { body, tag: 'diandian-reminder-' + reminder.id, renotify: true, data: { route } };
    try {
      if (_reg && _reg.showNotification) {
        await _reg.showNotification(title, opts);
        return true;
      }
    } catch (e) { /* 继续降级 */ }
    try {
      if (Notification.permission === 'granted') {
        const n = new Notification(title, opts);
        n.onclick = () => { location.hash = route; window.focus(); };
        return true;
      }
    } catch (e) { /* 忽略 */ }
    return false;
  }

  // 检查并触发到期提醒（幂等：已触发/已取消的跳过）
  async function fireDue(now) {
    if (!supported()) return 0;
    if (isNative()) return 0; // 原生容器：浏览器通知不可用，提醒由 Android 原生实现（后续版本）
    if (Notification.permission !== 'granted') return 0;
    const due = await DD.logic.getDueReminders(DD.db, now);
    let fired = 0;
    for (const r of due) {
      const premeal = await DD.db.get('glucose', r.premealGlucoseId);
      const ok = await showNotif(r, premeal);
      await DD.logic.markTriggered(DD.db, r.id); // 只发一次，自动结束
      if (ok) fired++;
    }
    return fired;
  }

  // 主动调度：页面打开期间每 30 秒检查；后台由 SW 尽力恢复
  function startTicker() {
    if (_ticker) return;
    const tick = async () => {
      const now = Date.now();
      if (now - _lastCheck < 15000) return; // 节流
      _lastCheck = now;
      try {
        await fireDue(now);
        if (_reg && _reg.active) _reg.active.postMessage({ type: 'check-due', now });
      } catch (e) { /* 忽略 */ }
    };
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    _ticker = setInterval(tick, 30000);
    tick();
  }

  async function init() {
    await registerSW();
    if (supported()) startTicker();
    return permission();
  }

  window.DD = window.DD || {};
  DD.notify = { init, registerSW, requestPermission, permission, supported, openSettings, fireDue, startTicker, reminderLabel };
})();
