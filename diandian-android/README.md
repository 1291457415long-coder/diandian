# 点点（Diandian）— Android App 工程

将现有「点点」网页版封装为原生 Android 应用（**WebView + 本地 Assets 资源**，完全离线，零 CDN 依赖）。

- **包名**：`com.diandian.glucose`
- **App 名称**：点点
- **最低系统**：Android 7.0（API 24）
- **目标系统**：Android 14（API 34）
- **技术方案**：`androidx.webkit.WebViewAssetLoader` 从 `assets/www/` 加载本地网页，IndexedDB 持久化保存在本机，深色模式跟随系统

## 目录结构

```
diandian-android/
├── settings.gradle / build.gradle / gradle.properties
├── gradlew.bat / gradle/wrapper/          # Gradle Wrapper（8.2.1）
├── local.properties                      # 本机 SDK 路径（Android Studio 会自动生成）
└── app/
    ├── build.gradle                      # AGP 8.2.2，compileSdk 34
    └── src/main/
        ├── AndroidManifest.xml
        ├── java/com/diandian/glucose/MainActivity.java   # WebView 容器 + 原生桥
        ├── res/                          # 主题（浅/深）、图标、布局
        └── assets/www/                   # ← 网页版全部资源（打包进 APK）
```

## 用 Android Studio 打开

1. Android Studio → **File → Open** → 选择 `diandian-android` 目录
2. 等待 **Gradle Sync** 完成（首次会自动下载依赖，需联网；之后构建可离线）
3. 连接手机（开启 USB 调试）→ 点 **Run ▶** 直接安装运行
4. 或 Build → **Build APK(s)** 生成 APK

## 命令行构建 Debug APK

```bash
cd diandian-android
./gradlew.bat assembleDebug
# 输出：app/build/outputs/apk/debug/app-debug.apk
```

## 安装到 Android 手机

方式一：Android Studio Run（最简单）
方式二：命令行安装（需 USB 调试）
```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```
方式三：把 `app-debug.apk` 传到手机（微信/网盘/U盘），点击安装（需允许「安装未知来源应用」）。

## 如何更新网页资源后重新打包

网页版源在 `C:\Users\WIT_User\WorkBuddy\2\diandian-app\`。修改后重新同步到工程：

```bash
# 把网页版全部资源复制到 assets（排除测试/文档）
rm -rf diandian-android/app/src/main/assets/www
mkdir -p diandian-android/app/src/main/assets/www
cp -r diandian-app/index.html diandian-app/css diandian-app/js diandian-app/icons diandian-android/app/src/main/assets/www/
cp diandian-app/manifest.webmanifest diandian-app/sw.js diandian-android/app/src/main/assets/www/   # 可选
rm -f diandian-android/app/src/main/assets/www/icons/make_icon.py
cd diandian-android && ./gradlew.bat assembleDebug
```

## 原生桥（NativeBridge）

页面 JS 可通过 `window.NativeBridge` 调用原生能力：

| 方法 | 说明 |
| --- | --- |
| `shareText(text, filename)` | 导出 CSV：写入缓存目录 → 调起系统分享菜单 |

WebView 容器注入 `window.__nativeApp = true`（供页面识别原生环境，浏览器通知 API 自动降级不显示误导提示）。

> ⚠️ 重要：`WebViewClient.shouldInterceptRequest` 必须转发给 `assetLoader.shouldInterceptRequest(url)`，
> 否则 `appassets.androidplatform.net` 的本地资源不会被拦截，页面无法加载（已实测踩坑修复）。

## 后续可扩展（按计划逐步实现）

- Android 系统通知 / 本地提醒（`AlarmManager` + `NotificationManager`，通过 NativeBridge 对接提醒引擎）
- 通知点击直达快速记录页
- 更完整的文件导出（保存到公共目录）
- 手势缩放已由网页版图表自带，无需原生处理

## 注意事项

- WebView 不支持 Service Worker，离线缓存由「资源打进 APK」天然保证
- 数据保存在 WebView 的 IndexedDB（`https://appassets.androidplatform.net` 域下），卸载 App 会清除
- 状态栏/导航栏：页面 CSS 使用 `env(safe-area-inset-*)`，原生同时注入 `--sat/--sab` CSS 变量兜底，适配刘海屏与手势导航
