# 点点 · 离线血糖/体重记录

一个**完全离线**的血糖、体重记录 App。数据只存在你自己的设备本地（IndexedDB / 手机存储），**不上传任何服务器**，保护隐私。

- 🩸 记录血糖、体重，支持手动输入「吃了什么」
- 📈 趋势图、历史时间线、统计概览
- ⏰ 自定义提醒（餐前/餐后测量）
- 🕐 24 小时制时间选择（页面内嵌面板，可点选也可手动打字，支持长按连调）
- 📱 PWA 网页版 + Android 原生壳（WebView 离线打包，真机沉浸式安全区适配）
- 🚫 无需联网、无需账号

---

## 📦 最新版本（下载）

| 平台 | 获取方式 |
| --- | --- |
| **Android APK** | 在仓库 [Releases](https://github.com/1291457415long-coder/diandian/releases) 页面下载 `app-debug.apk`，安装即用 |
| **网页版 PWA** | 把 `diandian-app/` 部署到任意静态服务器，或用浏览器直接打开（见下文「PWA 网页版」） |

> 版本说明：当前 Release 内 APK 为 Debug 包（未签名），功能完整，适合自用与分发。如需上架应用商店，需自行用发布证书签名。

---

## 安装与使用

### Android（推荐，离线可用）

1. 在手机浏览器打开本仓库的 **Releases** 页面，下载 `app-debug.apk`。
2. 首次安装需允许「安装未知来源应用」：
   - 下载完成后点击 APK → 按系统提示在「设置」中开启「允许来自此来源的应用」。
   - 不同品牌路径略有差异（如小米/红米：设置 → 应用设置 → 授权管理 → 应用权限管理 → 特殊权限 → 安装未知应用）。
3. 安装完成后打开「点点」。
4. **通知提醒（可选）**：首次打开会请求通知权限；若错过，可在系统「设置 → 应用 → 点点 → 通知」中开启。开启后餐前/餐后测量提醒才能按时弹出。
5. 进入即用，所有数据存于手机本机，无需登录、无需联网。

### PWA 网页版（免安装，跨平台）

1. 把 `diandian-app/` 目录部署到任意静态服务器（如 `npx serve diandian-app`、GitHub Pages、Nginx 等）。
   - 必须经 **http(s)** 访问（直接双击 `index.html` 用 `file://` 打开时 Service Worker 不生效，仅能临时浏览）。
2. 浏览器打开站点后：
   - **Android Chrome**：点「⋮」菜单 → 「安装应用」/「添加到主屏幕」，即可像 App 一样全屏使用。
   - **iOS Safari**：点「分享」→「添加到主屏幕」。
3. 添加到主屏后支持**完全离线**使用（Service Worker 缓存资源）。

> **平台差异**：
> - 通知提醒在 **Android** 上完整可用（依赖系统通知）。
> - **iOS Safari** 的网页通知受系统限制，提醒可能不会主动弹窗；数据记录、图表等功能不受影响。

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
    ├── sync-assets.bat / sync-assets.sh   # 从 diandian-app 同步网页到壳内
    ├── local.properties.example            # sdk.dir 配置示例
    └── app/src/main/
        ├── java/.../MainActivity.java      # 沉浸式安全区注入、系统返回手势
        ├── res/                            # 原生资源（含 ic_launcher 矢量图标）
        └── assets/www/                     # 网页副本（由 diandian-app 同步而来）
```

> **注意**：`diandian-android/app/src/main/assets/www/` 是 `diandian-app/` 的**副本**，构建 APK 时由它加载。改了网页代码后需先同步（见下）。

---

## 本地开发（网页）

```bash
cd diandian-app
node serve.js            # 启动本地服务器，浏览器打开提示的地址
node tests/run-tests.js  # 运行业务测试（约 120 项断言）
node tests/smoke.js      # 运行浏览器级冒烟测试（需先 npm i jsdom）
```

也可直接以 PWA 方式用浏览器打开 `diandian-app/index.html`（需经 http 服务以启用 Service Worker）。

---

## 构建 Android APK

前置：安装 [Android SDK](https://developer.android.com/studio) 与 JDK 17+，并配置 `sdk.dir`：

```bash
cd diandian-android
cp local.properties.example local.properties
# 编辑 local.properties，把 sdk.dir 改成你的 Android SDK 路径
```

> `local.properties` 已被 `.gitignore` 忽略，不入库。

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

3. 把 `app-debug.apk` 安装到手机（见「安装与使用 → Android」）。

**重新打包流程**（日常改网页后）：改 `diandian-app/` → 跑 `sync-assets` → `./gradlew assembleDebug` → 安装/分发新 APK。

---

## 故障排查

| 现象 | 可能原因 / 解决办法 |
| --- | --- |
| 安卓壳打开后白屏 / 网页打不开 | 构建前未执行 `sync-assets`，`assets/www` 为空或过期 → 重新同步后再 `assembleDebug` |
| 提醒到点不弹通知 | 未授予通知权限（去系统设置开启）；或当前为 iOS Safari（系统限制）；或应用被系统杀后台冻结 |
| 趋势图双指缩放方向反 / 乱跳 | 真机已修复逐帧增量缩放；若仍异常，重启应用即可（数据不丢） |
| 时间面板「点一下数字乱跑」 | 已修复（长按连调不再重建 DOM）；如遇异常重启应用 |
| 数据存哪里了 | 网页版存浏览器 IndexedDB（域名隔离）；安卓版随网页打包存于本机存储。**卸载应用会清除数据**，重要记录请提前用「导出 CSV」备份 |
| 导出 CSV 中文乱码 | 文件已带 UTF-8 BOM，用 Excel / WPS 打开正常；记事本可能需手动选编码 |

---

## 隐私说明

所有健康数据仅存储于本机：网页版存浏览器 IndexedDB，安卓版随网页打包在本地。本应用**不收集、不上传、不共享任何用户数据**，无后端服务器、无埋点、无账号体系。卸载应用会清除全部本地数据，建议定期用「导出 CSV」备份。

---

## 版本变更摘要

- 移除「食物库」功能（原 210 条预置食物）；记录里的「吃了什么」改为手动输入，名称快照随记录保存
- 精简所有页面顶栏左右按钮，导航统一走底部导航栏 + 系统返回手势
- 修复记录页「状态栏重复」显示问题（顶栏与页面自带返回头双重安全区内边距）
- 时间选择改为 24 小时制内嵌面板，支持点选 / 手动打字 / 长按连调
- Android 沉浸式安全区适配（状态栏重叠、底部手势条重叠、MIUI 手势导航 `bottom` 报 0 兜底）
- 提供 Android 原生壳 + PWA 双形态，完全离线可用
