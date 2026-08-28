# 点点 — ProGuard 规则（Debug 不启用，Release 备用）
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
