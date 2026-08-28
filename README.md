# 点点 · 离线血糖/体重记录

一个**完全离线**的血糖、体重记录 App。数据只存在你自己的设备本地（IndexedDB / 手机存储），**不上传任何服务器**，保护隐私。

- 🩸 记录血糖、体重，支持手动输入「吃了什么」
- 📈 趋势图、历史时间线、统计概览
- ⏰ 自定义提醒（餐前/餐后测量）
- 🕐 24 小时制时间选择（页面内嵌面板，可点选也可手动打字，支持长按连调）
- 📱 PWA 网页版 + Android 原生壳（WebView 离线打包，真机沉浸式安全区适配）
- 🚫 无需联网、无需账号

---

## 仓库结构

```
diandian/
├── README.md              # 本文件
├── .gitignore
├── diandian-app/          # 网页源码（唯一真相源 / PWA）
│   ├── index.html
│   ├── css/app.css
│   ├── js/                # app.js / ui.js / store.js / logic.js / chart.js / ...
│   ├── icons/             # PWA 图标
│   ├── tests/             # 业务测试 + 冒烟测试（node 运行）
│   └── serve.js, sw.js    # 本地服务器 / Service Worker
└── diandian-android/      # Android WebView 壳（离线 APK）
    └── app/src/main/
        ├── java/.../MainActivity.java   # 沉浸式安全区注入、系统返回手势
        ├── res/                        # 原生资源（含 ic_launcher 图标）
        └── assets/www/                 # 网页副本（由 diandian-app 同步而来）
```

> **注意**：`diandian-android/app/src/main/assets/www/` 是 `diandian-app/` 的**副本**，构建 APK 时由它加载。改了网页代码后需先同步（见下）。

---

## 本地开发（网页）

```bash
cd diandian-app
node serve.js            # 启动本地服务器，浏览器打开提示的地址
node tests/run-tests.js  # 运行业务测试
node tests/smoke.js      # 运行冒烟测试
```

也可直接以 PWA 方式用浏览器打开 `diandian-app/index.html`（需经 http 服务以启用 Service Worker）。

---

## 构建 Android APK

前置：安装 [Android SDK](https://developer.android.com/studio) 与 JDK 17+，并在 `diandian-android/local.properties` 中配置 `sdk.dir`（该文件已被 `.gitignore` 忽略，不入库）。

1. **同步网页到安卓壳**（改了 `diandian-app/` 后必须执行），在 `diandian-android/` 目录运行：

   ```bash
   # Windows
   sync-assets.bat
   # macOS / Linux
   bash sync-assets.sh
   ```

2. **构建**：

   ```bash
   cd diandian-android
   ./gradlew assembleDebug    # 输出 app/build/outputs/apk/debug/app-debug.apk
   ```

3. 手机安装 `app-debug.apk`（需允许「安装未知来源应用」）。

---

## 隐私说明

所有健康数据仅存储于本机：网页版存浏览器 IndexedDB，安卓版随网页打包在本地。本应用不收集、不上传、不共享任何用户数据。

---

## 版本变更摘要

- 移除「食物库」功能（原 210 条预置食物）；记录里的「吃了什么」改为手动输入，名称快照随记录保存
- 精简所有页面顶栏左右按钮，导航统一走底部导航栏 + 系统返回手势
- 修复记录页「状态栏重复」显示问题（顶栏与页面自带返回头双重安全区内边距）
- 时间选择改为 24 小时制内嵌面板，支持点选 / 手动打字 / 长按连调
- Android 沉浸式安全区适配（状态栏重叠、底部手势条重叠、MIUI 手势导航 `bottom` 报 0 兜底）
