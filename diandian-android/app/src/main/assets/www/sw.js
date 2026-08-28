/* 点点 — Service Worker
   职责：
   1. 离线缓存（App 安装后完全离线可用）
   2. 本地餐后提醒：手机重启 / App 被清理后，尽可能恢复未触发的提醒
   3. 通知点击 → 直达快速记录页（自动带出场景与食物） */
'use strict';

const CACHE = 'diandian-v2';
const CORE = ['./', './index.html', './css/app.css', './js/icons.js', './js/units.js', './js/store.js', './js/logic.js', './js/notify.js', './js/chart.js', './js/ui.js', './js/app.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => checkDue())
  );
});

/* ---------- 提醒数据库（SW 独立访问同一 IndexedDB） ---------- */
const DB_NAME = 'diandian-db';
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function getPendingReminders() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('reminders', 'readonly');
    const req = tx.objectStore('reminders').getAll();
    req.onsuccess = () => resolve((req.result || []).filter(r => !r.canceled && !r.triggered));
    req.onerror = () => reject(req.error);
  });
}
async function getGlucose(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('glucose', 'readonly');
    const req = tx.objectStore('glucose').get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
async function markTriggered(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('reminders', 'readwrite');
    const store = tx.objectStore('reminders');
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const r = getReq.result;
      if (r && !r.canceled && !r.triggered) { r.triggered = true; r.triggeredAt = Date.now(); store.put(r); }
      resolve();
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

function fmtTime(ts) {
  const d = new Date(ts);
  const p2 = n => String(n).padStart(2, '0');
  return p2(d.getHours()) + ':' + p2(d.getMinutes());
}
function label(min) {
  if (min === 30) return '餐后30分钟';
  if (min === 60) return '餐后1小时';
  if (min === 120) return '餐后2小时';
  return '餐后提醒';
}

// 触发所有到期的未触发提醒（幂等，只发一次）
async function checkDue() {
  try {
    if (!('Notification' in self) || Notification.permission !== 'granted') return;
    const now = Date.now();
    const pending = await getPendingReminders();
    for (const r of pending) {
      if (r.targetTime > now) continue;
      const premeal = r.premealGlucoseId ? await getGlucose(r.premealGlucoseId) : null;
      const route = '#/quick/glucose?scenario=post' + r.minutes + '&premeal=' + encodeURIComponent(r.premealGlucoseId || '');
      const title = '点点提醒：该测' + label(r.minutes) + '血糖了';
      const body = premeal ? (fmtTime(premeal.time) + ' 餐前 ' + premeal.mmol.toFixed(1) + ' mmol/L') : '请测量并记录血糖';
      try {
        self.registration.showNotification(title, { body, tag: 'diandian-reminder-' + r.id, renotify: true, data: { route } });
      } catch (e) { /* 忽略 */ }
      await markTriggered(r.id);
    }
  } catch (e) { /* IndexedDB 暂不可用时静默 */ }
}
self.checkDue = checkDue;

// 页面通知 SW 检查（如页面在前台且到期未发）
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'check-due') checkDue();
});

// 通知点击 → 直达快速记录页（预选餐后场景，自动带出食物）
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const route = (e.notification.data && e.notification.data.route) || '#/quick/glucose';
  const url = self.location.origin + self.location.pathname + route;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (list) => {
      for (const c of list) {
        if ('focus' in c) { c.focus(); }
        try { await c.navigate(url); } catch (err) { /* 同源限制时忽略 */ }
        return;
      }
      return self.clients.openWindow(url);
    })
  );
});

/* ---------- 离线缓存策略 ---------- */
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
