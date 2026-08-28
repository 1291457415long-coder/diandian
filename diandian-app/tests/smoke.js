/* 点点 — 浏览器级冒烟测试（jsdom 模拟真实浏览器跑完整 UI 流程） */
'use strict';
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let passed = 0, failed = 0;
function ok(cond, name, extra) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (extra ? '  → ' + JSON.stringify(extra) : '')); }
}

async function main() {
  console.log('点点 · 浏览器冒烟测试（jsdom）');

  const dom = new JSDOM(html, {
    url: 'http://localhost/index.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const { window } = dom;
  const doc = window.document;

  // 浏览器 API 补丁
  window.ResizeObserver = class { observe() { } disconnect() { } unobserve() { } };
  window.URL.createObjectURL = () => 'blob:mock';
  window.URL.revokeObjectURL = () => { };
  window.__downloaded = null;
  window.HTMLAnchorElement.prototype.click = function () { window.__downloaded = this.download; };
  window.scrollTo = () => { };
  window.indexedDB = undefined; // 明确走内存存储

  // 按顺序注入脚本
  const files = ['js/icons.js', 'js/units.js', 'js/store.js', 'js/logic.js', 'js/notify.js', 'js/chart.js', 'js/ui.js', 'js/app.js'];
  for (const f of files) {
    window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  }
  // 手动触发启动
  doc.dispatchEvent(new window.Event('DOMContentLoaded'));

  // 等待启动完成
  await new Promise(res => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (window.DD && window.DD.settings && doc.querySelector('#view .sec-title')) { clearInterval(iv); res(); }
      else if (Date.now() - t0 > 10000) { clearInterval(iv); res(); }
    }, 40);
  });

  ok(window.DD && window.DD.settings, 'App 启动成功');
  ok(doc.querySelector('#view .sec-title')?.textContent.includes('今日血糖'), '首页渲染出「今日血糖」');
  ok(doc.querySelectorAll('.bottom-nav .nav-item').length === 4, '底部导航 4 个标签');
  ok(doc.querySelector('.bottom-nav .nav-fab') != null, '底部中间＋按钮存在');

  // 1) 快速记录血糖：5.6 餐前 + 餐后2小时提醒
  window.location.hash = '#/quick/glucose';
  await tick();
  ok(doc.querySelector('.vd-num') != null, '进入血糖快速记录页');
  ok(doc.querySelectorAll('[data-scn]').length === 6, '6 个场景标签（固定顺序）');
  const order = [...doc.querySelectorAll('[data-scn]')].map(b => b.textContent);
  ok(order.join(',') === '空腹,餐前,餐后30分钟,餐后1小时,餐后2小时,随机', '场景顺序正确: ' + order.join(','));
  click('[data-scn="premeal"]');
  await tick();
  ok(doc.querySelectorAll('[data-rem]').length === 4, '餐前场景出现 4 个提醒选项');
  typeKey('5'); typeKey('.'); typeKey('6');
  click('[data-rem="120"]');
  await tick();
  click('#save-btn');
  await tick(80);
  const rems = await window.DD.db.list('reminders');
  ok(rems.length === 1 && rems[0].minutes === 120 && !rems[0].canceled, '保存后创建 餐后2小时 提醒');
  ok(doc.querySelector('#view .sec-title')?.textContent.includes('今日血糖'), '保存后回到首页');

  // 2) 首页显示记录与倒计时
  ok(doc.querySelector('.tl-value')?.textContent.includes('5.6'), '首页显示血糖 5.6');
  ok(doc.querySelector('.countdown-chip') != null, '首页显示餐后提醒倒计时条');

  // 3) 记录体重
  window.location.hash = '#/quick/weight';
  await tick();
  ok(doc.querySelectorAll('.keypad-btn').length === 12, '体重页数字键盘 12 键');
  typeKey('7'); typeKey('2'); typeKey('.'); typeKey('4');
  click('#save-btn');
  await tick(80);
  ok(doc.querySelector('.weight-hero') != null, '首页显示最近一次体重卡片');
  ok(doc.querySelector('.wh-value')?.textContent.includes('72.4'), '首页体重显示 72.4');
  ok(doc.body.textContent.includes('公斤'), '体重单位显示「公斤」');

  // 4) 历史
  window.location.hash = '#/history';
  await tick();
  ok(doc.querySelector('.hist-item') != null, '历史页有血糖记录');
  click('.seg button[data-t="weight"]');
  await tick();
  ok(doc.querySelector('.hist-item .hi-value')?.textContent.includes('72.4'), '体重历史显示 72.4');

  // 5) 趋势（血糖图表）
  window.location.hash = '#/trend';
  await tick(120);
  ok(doc.querySelector('#chart-wrap svg') != null, '血糖趋势图渲染 SVG');
  ok(doc.querySelector('#chart-wrap svg')?.innerHTML.includes('circle'), '趋势图包含数据点');

  // 6) 血糖详情 + 关联
  window.location.hash = '#/history';
  await tick();
  const histItem = doc.querySelector('.hist-item[data-goto^="glucose/"]');
  const goto = histItem && histItem.dataset.goto;
  ok(!!goto, '历史记录可点击进入详情');
  if (goto) {
    window.location.hash = '#' + goto;
    await tick();
    ok(doc.querySelector('.detail-hero .dh-value') != null, '详情页渲染');
    ok(doc.body.textContent.includes('场景'), '详情显示场景');
  }

  // 7) 单位切换（全局）
  window.location.hash = '#/settings';
  await tick();
  click('[data-set="glucoseUnit"] button[data-u="mgdl"]');
  await tick(80);
  ok(window.DD.settings.glucoseUnit === 'mgdl', '血糖单位切换为 mg/dL');
  ok(doc.body.textContent.includes('mg/dL'), '设置页显示新单位');
  // 体重切斤（1公斤=2斤）
  click('[data-set="weightUnit"] button[data-u="jin"]');
  await tick(80);
  ok(window.DD.settings.weightUnit === 'jin', '体重单位切换为 斤');
  ok(!doc.body.textContent.includes('kg') && !doc.body.textContent.includes('lb'), '设置页不再出现 kg/lb');
  ok(doc.body.textContent.includes('通知权限'), '设置页显示通知权限状态');
  ok(!doc.querySelector('.notice-banner'), '不支持通知的环境不误报“通知未开启”');
  window.location.hash = '#/home';
  await tick();
  ok(doc.body.textContent.includes('mg/dL'), '首页同步显示 mg/dL');
  ok(doc.body.textContent.includes('144.8') && doc.body.textContent.includes('斤'), '首页体重同步显示 144.8 斤');

  // 8) 食物库已移除：路由失效、设置页无入口
  window.location.hash = '#/foods';
  await tick();
  ok(!doc.querySelector('.cat-scroll') && !doc.body.textContent.includes('食物库'),
    '食物库路由已移除（#/foods 不再进入食物库页）');
  window.location.hash = '#/settings';
  await tick();
  ok(!doc.body.textContent.includes('食物库'), '设置页不再显示「食物库」入口');
  ok(doc.body.textContent.includes('导出全部数据'), '设置页仍保留导出入口');

  // 9) 删除血糖记录（走详情删除）
  window.location.hash = '#/history';
  await tick();
  const h2 = doc.querySelector('.hist-item[data-goto^="glucose/"]');
  if (h2) {
    window.location.hash = '#' + h2.dataset.goto;
    await tick();
    click('[data-act="del"]');
    await tick(80);
    const dlg = doc.querySelector('.dialog-backdrop');
    if (dlg) {
      const btns = dlg.querySelectorAll('.dlg-actions .btn');
      btns[btns.length - 1].click(); // 确认删除
      await tick(100);
    }
    const glucose = await window.DD.db.list('glucose');
    ok(glucose.length === 0, '删除后血糖记录已移除');
  }

  // 10) 导出
  window.location.hash = '#/settings';
  await tick();
  click('[data-act="export"]');
  await tick(200);
  ok(window.__downloaded === '点点数据导出.csv', '导出文件已生成（分享不可用时自动下载）');

  // 11) 底部＋按钮（快速记录入口）
  window.location.hash = '#/home';
  await tick();
  const fab = doc.querySelector('.nav-fab');
  ok(!!fab, '底部＋按钮存在');
  fab.click();
  await tick(60);
  ok(!!doc.querySelector('.sheet'), '点击＋弹出快速记录入口');
  ok(doc.body.textContent.includes('记录血糖') && doc.body.textContent.includes('记录体重'), '入口显示「记录血糖 / 记录体重」');
  click('.sheet-body [data-go="quick/glucose"]');
  await tick(80);
  ok(doc.body.textContent.includes('测量场景'), '选择「记录血糖」→ 进入血糖快速记录页');
  window.location.hash = '#/home';
  await tick();
  fab.click();
  await tick(60);
  click('.sheet-body [data-go="quick/weight"]');
  await tick(80);
  ok(doc.body.textContent.includes('记录体重'), '选择「记录体重」→ 进入体重快速记录页');

  // 12) 深色模式：跟随系统且无按时间自动切换
  const css = fs.readFileSync(path.join(ROOT, 'css/app.css'), 'utf8');
  ok(css.includes('prefers-color-scheme: dark'), '深色模式跟随系统（CSS 媒体查询）');
  ok(!css.includes('getHours') && !css.includes('hour'), '无按时间自动切换主题的逻辑');

  console.log('\n══════════════════════════════════');
  console.log('  通过 ' + passed + ' 项，失败 ' + failed + ' 项');
  window.close();
  process.exit(failed ? 1 : 0);

  function click(sel) { const n = doc.querySelector(sel); if (n) n.click(); else console.log('  (!) 未找到节点: ' + sel); }
  function typeKey(k) { const btn = doc.querySelector('.keypad-btn[data-k="' + k + '"]'); if (btn) btn.click(); }
  function tick(ms) { return new Promise(r => setTimeout(r, ms || 30)); }
}

main().catch(e => { console.error('冒烟测试异常:', e); process.exit(1); });
