/* 点点 — 本地静态服务器（预览 / 手机安装用）
   用法：node serve.js [端口]   （默认 8080）
   手机与电脑同一 Wi-Fi，浏览器打开 http://<电脑IP>:8080 即可安装 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;
const PORT = parseInt(process.argv[2] || process.env.PORT || '8080', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.join(ROOT, path.normalize(urlPath));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // SPA 兜底：未知路径回 index.html
        fs.readFile(path.join(ROOT, 'index.html'), (e2, d2) => {
          if (e2) { res.writeHead(404); return res.end('Not Found'); }
          res.writeHead(200, { 'Content-Type': MIME['.html'] });
          res.end(d2);
        });
      } else { res.writeHead(500); res.end('Server Error'); }
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

function lanIPs() {
  const list = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces || []) {
      if (i.family === 'IPv4' && !i.internal) list.push(i.address);
    }
  }
  return list;
}

server.listen(PORT, '0.0.0.0', () => {
  console.log('──────────────────────────────────────────────');
  console.log('  点点（离线版）本地服务器已启动');
  console.log('');
  console.log('  本机访问:  http://localhost:' + PORT);
  for (const ip of lanIPs()) {
    console.log('  手机访问:  http://' + ip + ':' + PORT);
  }
  console.log('');
  console.log('  Android: Chrome 打开 → 菜单 → 添加到主屏幕');
  console.log('  iPhone : Safari 打开 → 分享 → 添加到主屏幕');
  console.log('  通知    : 首次设置餐后提醒时允许「通知」权限');
  console.log('──────────────────────────────────────────────');
});
