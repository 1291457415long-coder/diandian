/* 点点 — 应用入口（启动 / 路由 / 底部导航 / 设置加载） */
(function () {
  'use strict';

  // 用 IndexedDB（浏览器）；不可用时降级内存存储
  let store;
  try {
    if (window.indexedDB) store = DD.store.createStore('idb');
    else store = DD.store.createStore('memory');
  } catch (e) { store = DD.store.createStore('memory'); }
  DD.db = store; // 存储实例（DD.store 保留为命名空间）

  async function loadSettings() {
    let weightUnit = await store.settingsGet('weightUnit', 'kg');
    if (weightUnit === 'lb') weightUnit = 'jin'; // 旧版本 lb 迁移 → 斤
    DD.settings = {
      glucoseUnit: await store.settingsGet('glucoseUnit', 'mmol'),
      weightUnit
    };
  }

  function bindNav() {
    // 填充底部导航图标
    const iconMap = { home: 'home', trend: 'insights', record: 'add_circle', history: 'history', settings: 'person' };
    document.querySelectorAll('.bottom-nav .ms[data-icon]').forEach(sp => {
      sp.outerHTML = DD.icon(iconMap[sp.dataset.icon] || sp.dataset.icon);
    });
    const nav = document.querySelector('.bottom-nav');
    // 注意：＋ 按钮的 class 是 .nav-fab（不在 .nav-item 内），必须一并绑定，否则点击无反应
    nav.querySelectorAll('.nav-item, .nav-fab').forEach(item => {
      item.addEventListener('click', () => {
        const t = item.dataset.nav;
        if (t === 'record') openRecordSheet();
        else DD.ui.navigate(t === 'home' ? 'home' : t);
      });
    });
  }

  function openRecordSheet() {
    DD.ui.openSheet({
      title: '快速记录',
      bodyHTML: '<div class="record-sheet-grid">' +
        '<button class="quick-btn primary-action" data-go="quick/glucose">' + DD.icon('add') + '<span>记录血糖</span></button>' +
        '<button class="quick-btn secondary-action" data-go="quick/weight">' + DD.icon('add') + '<span>记录体重</span></button></div>'
    });
    document.querySelectorAll('.sheet-body [data-go]').forEach(b =>
      b.addEventListener('click', () => { DD.ui.closeSheet(); DD.ui.navigate(b.dataset.go); }));
  }

  function initTopbarScroll() {
    const tb = document.getElementById('topbar');
    const onScroll = () => tb.classList.toggle('scrolled', window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  async function boot() {
    await store.ready();
    await loadSettings();

    bindNav();
    initTopbarScroll();

    // 通知：注册 SW + 调度器（本地通知）
    DD.notify.init();

    // 路由
    const route = () => DD.ui.route(location.hash.replace(/^#\/?/, ''));
    window.addEventListener('hashchange', route);
    route();

    // 从系统设置返回 App（focus / visibilitychange）时：
    // 立即重新读取系统通知权限并刷新当前视图（权限状态同步）
    const refreshOnReturn = () => {
      const h = location.hash.replace(/^#\/?/, '');
      const seg = h.split('?')[0].split('/');
      if (!seg[0] || seg[0] === 'home' || seg[0] === 'settings' || seg[0] === 'reminder') {
        DD.ui.route(h);
      }
    };
    window.addEventListener('focus', refreshOnReturn);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshOnReturn(); });
    // Android 原生：从系统通知设置返回 / 权限弹窗回调 → 立即刷新（onResume 触发）
    window.addEventListener('appresume', refreshOnReturn);
  }

  window.addEventListener('DOMContentLoaded', boot);
})();
