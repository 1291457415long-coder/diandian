/* 点点 — 数据层
   统一存储接口（Memory / IndexedDB 两种实现，接口一致，供逻辑层与 Node 测试使用）
   集合：glucose / weight / reminders / settings（食物库已移除，改为记录内手动输入「吃了什么」） */
(function () {
  'use strict';

  /* ================= 内存实现（用于 Node 测试 / 降级） ================= */
  class MemoryStore {
    constructor() {
      this._data = { glucose: [], weight: [], reminders: [] };
      this._settings = {};
      this._seq = 1;
    }
    _nextId() { return 'r' + (this._seq++); }
    _coll(name) { return this._data[name]; }

    async ready() {}

    async list(name) { return this._coll(name).slice().sort((a, b) => a.time - b.time); }
    async get(name, id) { return this._coll(name).find(x => x.id === id) || null; }
    async add(name, rec) {
      if (!rec.id) rec.id = this._nextId();
      const now = Date.now();
      if (!rec.createdAt) rec.createdAt = now;
      rec.updatedAt = now;
      this._coll(name).push(rec);
      return rec;
    }
    async put(name, rec) {
      rec.updatedAt = Date.now();
      const arr = this._coll(name);
      const i = arr.findIndex(x => x.id === rec.id);
      if (i >= 0) arr[i] = rec; else arr.push(rec);
      return rec;
    }
    async remove(name, id) {
      const arr = this._coll(name);
      const i = arr.findIndex(x => x.id === id);
      if (i >= 0) arr.splice(i, 1);
    }
    async settingsGet(key, def) { return key in this._settings ? this._settings[key] : def; }
    async settingsSet(key, val) { this._settings[key] = val; }
  }

  /* ================= IndexedDB 实现（浏览器） ================= */
  const DB_NAME = 'diandian-db';
  // v2：移除食物库（不再使用预置食物库，改为在记录页手动输入「吃了什么」）
  const DB_VER = 2;
  const STORES = ['glucose', 'weight', 'reminders', 'settings'];

  class IDBStore {
    constructor() { this._db = null; }
    _open() {
      return new Promise((resolve, reject) => {
        if (this._db) return resolve(this._db);
        const req = indexedDB.open(DB_NAME, DB_VER);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          // v2 迁移：删除食物库（若存在）。记录内的 foods 快照不受影响（名称已内联保存）
          if (db.objectStoreNames.contains('foods')) db.deleteObjectStore('foods');
          if (!db.objectStoreNames.contains('glucose')) {
            const s = db.createObjectStore('glucose', { keyPath: 'id' });
            s.createIndex('time', 'time');
            s.createIndex('premealId', 'premealId');
            s.createIndex('scenario', 'scenario');
          }
          if (!db.objectStoreNames.contains('weight')) {
            const s = db.createObjectStore('weight', { keyPath: 'id' });
            s.createIndex('time', 'time');
          }
          if (!db.objectStoreNames.contains('reminders')) {
            const s = db.createObjectStore('reminders', { keyPath: 'id' });
            s.createIndex('premealGlucoseId', 'premealGlucoseId');
          }
          if (!db.objectStoreNames.contains('settings')) {
            db.createObjectStore('settings', { keyPath: 'key' });
          }
        };
        req.onsuccess = () => { this._db = req.result; resolve(this._db); };
        req.onerror = () => reject(req.error);
      });
    }
    _tx(store, mode, fn) {
      return this._open().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const s = tx.objectStore(store);
        const out = fn(s);
        tx.oncomplete = () => resolve(out.result !== undefined ? out.result : null);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }));
    }
    async ready() { await this._open(); }

    async list(name) {
      return this._tx(name, 'readonly', s => {
        const req = s.getAll();
        return req;
      }).then(arr => (arr || []).sort((a, b) => (a.time || 0) - (b.time || 0)));
    }
    async get(name, id) {
      return this._tx(name, 'readonly', s => s.get(id)).then(r => r || null);
    }
    async add(name, rec) {
      if (!rec.id) rec.id = 'r' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      const now = Date.now();
      if (!rec.createdAt) rec.createdAt = now;
      rec.updatedAt = now;
      await this._tx(name, 'readwrite', s => s.put(rec));
      return rec;
    }
    async put(name, rec) {
      rec.updatedAt = Date.now();
      await this._tx(name, 'readwrite', s => s.put(rec));
      return rec;
    }
    async remove(name, id) {
      await this._tx(name, 'readwrite', s => s.delete(id));
    }
    async settingsGet(key, def) {
      const row = await this._tx('settings', 'readonly', s => s.get(key));
      return row ? row.value : def;
    }
    async settingsSet(key, val) {
      await this._tx('settings', 'readwrite', s => s.put({ key, value: val }));
    }
  }

  /* 工厂：'memory' 内存实现（测试），其它用 IndexedDB（浏览器） */
  function createStore(kind) {
    return kind === 'memory' ? new MemoryStore() : new IDBStore();
  }

  window.DD = window.DD || {};
  DD.store = { createStore };
  DD.MemoryStore = MemoryStore;
  DD.IDBStore = IDBStore;
})();
