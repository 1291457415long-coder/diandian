package com.diandian.glucose;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;

/**
 * 点点（Diandian）— 离线血糖/体重记录
 * 以 WebView + 本地 Assets 资源承载现有网页版（完全离线，无任何网络依赖）。
 */
public class MainActivity extends Activity {

    private static final String ASSET_BASE = "https://appassets.androidplatform.net/assets/www/";
    private static final int REQ_NOTIFICATION = 1001;

    private WebView webView;
    private WebViewAssetLoader assetLoader;

    /** 缓存最近一次系统栏 insets（物理像素），供页面加载完成后补注入（避免加载前注入被新文档覆盖） */
    private int lastInsetTop = -1;
    private int lastInsetBottom = -1;

    /** JS 桥：供页面调用原生能力 */
    private class NativeBridge {
        @JavascriptInterface
        public String appName() { return "点点"; }

        /** 导出 CSV：写入缓存目录并调起系统分享 */
        @JavascriptInterface
        public void shareText(String text, String filename) {
            runOnUiThread(() -> doShareText(text, filename == null ? "点点数据导出.csv" : filename));
        }

        /** Android 系统真实通知权限：'granted' | 'denied'（同步返回） */
        @JavascriptInterface
        public String getNotificationPermission() {
            return isNotificationGranted() ? "granted" : "denied";
        }

        /** Android 13+ 动态请求 POST_NOTIFICATIONS（低版本系统通知默认可用） */
        @JavascriptInterface
        public void requestNotificationPermission() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= 33 &&
                        checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                                != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATION);
                } else {
                    notifyPageResume();
                }
            });
        }

        /** 打开系统应用通知设置页 */
        @JavascriptInterface
        public void openNotificationSettings() {
            runOnUiThread(() -> {
                Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
                try {
                    startActivity(intent);
                } catch (Exception e) {
                    try {
                        startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                                Uri.parse("package:" + getPackageName())));
                    } catch (Exception ignored) { }
                }
            });
        }
    }

    private boolean isNotificationGranted() {
        if (Build.VERSION.SDK_INT >= 33) {
            return checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                    == PackageManager.PERMISSION_GRANTED;
        }
        return NotificationManagerCompat.from(this).areNotificationsEnabled();
    }

    /** 通知页面：权限状态可能已变化，触发页面立即刷新 */
    private void notifyPageResume() {
        if (webView == null) return;
        webView.post(() -> {
            try {
                webView.evaluateJavascript(
                        "try{window.dispatchEvent(new Event('appresume'))}catch(e){}", null);
            } catch (Exception ignored) { }
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        // 从系统设置（如通知设置页）返回时，立即通知页面重读权限状态
        notifyPageResume();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions,
                                           @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_NOTIFICATION) {
            notifyPageResume();
        }
    }

    private void doShareText(String text, String filename) {
        try {
            File dir = new File(getCacheDir(), "exports");
            if (!dir.exists()) dir.mkdirs();
            File file = new File(dir, filename);
            try (OutputStreamWriter w = new OutputStreamWriter(new FileOutputStream(file), StandardCharsets.UTF_8)) {
                w.write(text);
            }
            Uri uri = androidx.core.content.FileProvider.getUriForFile(this,
                    getPackageName() + ".fileprovider", file);
            Intent share = new Intent(Intent.ACTION_SEND);
            share.setType("text/csv");
            share.putExtra(Intent.EXTRA_STREAM, uri);
            share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(share, "分享导出数据"));
        } catch (Exception e) {
            // 忽略：导出失败不阻塞
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 内容延伸至状态栏/导航栏区域，由页面 CSS（env(safe-area-inset-*) / --sat / --sab）处理留白
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 28) {
            getWindow().getAttributes().layoutInDisplayCutoutMode =
                    android.view.WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        setContentView(R.layout.activity_main);

        if (Build.VERSION.SDK_INT >= 19) {
            WebView.setWebContentsDebuggingEnabled(true); // 调试用：chrome://inspect 可查 DOM/console
        }

        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView = findViewById(R.id.webview);
        // 跟随主题的背景色，避免加载瞬间白闪/黑闪
        webView.setBackgroundColor(0xFFF7FAFC);

        // 软键盘高度监听（MIUI WebView 键盘弹出时不触发 JS resize/visualViewport，
        // 由原生侧检测可见区域变化并注入 --keyboard-offset，页面据此上移底部弹层）。
        // 用 OnGlobalLayoutListener：兼容性最好（不依赖 insets 分发），变化时注入。
        final int[] lastKbCss = { -1 };
        webView.getViewTreeObserver().addOnGlobalLayoutListener(() -> {
            android.graphics.Rect vis = new android.graphics.Rect();
            webView.getWindowVisibleDisplayFrame(vis);
            int screenH = webView.getRootView().getHeight();
            int kbPx = screenH - vis.bottom;
            if (kbPx < 0) kbPx = 0;
            float dpr = getResources().getDisplayMetrics().density / 160f; // 600dpi → 3.75
            int cssPx = (int) (kbPx / dpr);
            if (cssPx != lastKbCss[0]) {
                lastKbCss[0] = cssPx;
                webView.evaluateJavascript(
                        "(function(){document.documentElement.style.setProperty('--keyboard-offset', '" + cssPx + "px');" +
                        "window.dispatchEvent(new Event('nativekbd'));})();", null);
            }
        });

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // localStorage / IndexedDB（本机持久化）
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT); // 本地资源走 WebViewAssetLoader，缓存默认即可（LOAD_NO_CACHE 实测会导致页面缩放异常）
        // 注意：不设 setUseWideViewPort / setLoadWithOverviewMode ——
        // 页面 index.html 已有完整 viewport meta（width=device-width, initial-scale=1）。
        // 这两个设置是给无 viewport meta 的 PC 页面用的；在 DPR 3.75 的高分屏上
        // 会导致 WebView 算错 initial-scale，页面内容被放大 3 倍左右（真机复现）。
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setSupportZoom(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        if (Build.VERSION.SDK_INT >= 33) {
            s.setAlgorithmicDarkeningAllowed(false); // 主题完全由 CSS 跟随系统
        }

        webView.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                // 关键：拦截 appassets.androidplatform.net 的本地资源请求（WebViewAssetLoader）
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("appassets.androidplatform.net".equals(uri.getHost())) {
                    return false; // App 内部资源，留在 WebView
                }
                // 其它链接交给系统浏览器
                try {
                    view.getContext().startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) { }
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                // 标记原生容器环境：浏览器通知 API 自动降级，避免误报“通知未开启”
                view.evaluateJavascript("window.__nativeApp = true;", null);
                super.onPageStarted(view, url, favicon);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                android.util.Log.i("Diandian", "页面加载完成: " + url);
                // 重新注入安全区：初始 insets 在 loadUrl 前注入时会被新文档清空，这里补回
                if (lastInsetTop >= 0) injectInsets(lastInsetTop, lastInsetBottom);
                super.onPageFinished(view, url);
            }
        });

        // 导出文件兜底：页面 <a download> 触发时转为系统分享
        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition,
                                        String mimetype, long contentLength) {
                try {
                    Intent share = new Intent(Intent.ACTION_SEND);
                    share.setType("text/csv");
                    share.putExtra(Intent.EXTRA_STREAM, Uri.parse(url));
                    share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(Intent.createChooser(share, "分享导出数据"));
                } catch (Exception ignored) { }
            }
        });

        // 原生桥（导出分享等）
        webView.addJavascriptInterface(new NativeBridge(), "NativeBridge");

        // 系统栏 insets → 页面 CSS 变量（env(safe-area-inset-*) 的兜底）
        ViewCompat.setOnApplyWindowInsetsListener(webView, (v, insets) -> {
            int top = insets.getInsets(WindowInsetsCompat.Type.systemBars()).top;
            int bottom = insets.getInsets(WindowInsetsCompat.Type.systemBars()).bottom;
            // 挖孔/刘海：取切口安全区高度兜底（避免顶栏与挖孔重叠）
            if (Build.VERSION.SDK_INT >= 28) {
                try {
                    androidx.core.graphics.Insets cutTop = insets.getInsets(WindowInsetsCompat.Type.displayCutout());
                    if (cutTop.top > top) top = cutTop.top;
                } catch (Exception ignored) { }
            }
            lastInsetTop = top;
            lastInsetBottom = bottom;
            injectInsets(top, bottom);
            return insets;
        });
        // 额外主动分发一次，确保首帧 insets 为 0 的机型也能拿到真实值（仅外部调用一次，避免递归）
        ViewCompat.requestApplyInsets(webView);

        webView.loadUrl(ASSET_BASE + "index.html");
    }

    private void injectInsets(int top, int bottom) {
        webView.post(() -> {
            try {
                // 注入物理像素，JS 侧用 devicePixelRatio 换算为 CSS px（避免 Java 侧 DPR 计算不一致）
                // bottom 兜底 16px：MIUI 手势导航下系统可能不报底部 inset（手势横线为叠加层），
                // 必须给最小留白，否则底部导航文字会被手势横线压住。
                String js = "try{(function(){var e=document.documentElement;var dpr=window.devicePixelRatio||1;"
                        + "var topPx=Math.max(0,Math.round((" + top + ")/dpr));"
                        + "var botPx=Math.round((" + bottom + ")/dpr);"
                        + "if(botPx<16)botPx=16;"
                        + "e.style.setProperty('--sat',topPx+'px');"
                        + "e.style.setProperty('--sab',botPx+'px');"
                        + "})()}catch(e){}";
                webView.evaluateJavascript(js, null);
            } catch (Exception ignored) { }
        });
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
