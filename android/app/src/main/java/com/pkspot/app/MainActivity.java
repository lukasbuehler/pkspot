package com.pkspot.app;

import android.content.pm.PackageInfo;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.OnApplyWindowInsetsListener;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  private static final String TAG = "PKSpotMainActivity";

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    // Keep the Capacitor WebView full-height when the Android IME opens.
    getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING);
    Log.d(TAG, "onCreate: set SOFT_INPUT_ADJUST_NOTHING before BridgeActivity setup");
    registerPlugin(AgeAssurancePlugin.class);
    super.onCreate(savedInstanceState);
    logWebViewStartupDiagnostics();
    // Enable edge-to-edge on Android versions before SDK 35, where it is not automatic.
    WindowCompat.enableEdgeToEdge(getWindow());
    Log.d(TAG, "onCreate: edge-to-edge enabled");
    setupImeInsetsGuard();
  }

  @Override
  public void onResume() {
    super.onResume();
    // Force white status bar icons after activity is fully ready
    // (isAppearanceLightStatusBars = false means light/white icons on dark
    // background)
    WindowInsetsControllerCompat insetsController = WindowCompat.getInsetsController(getWindow(),
        getWindow().getDecorView());
    insetsController.setAppearanceLightStatusBars(false);
    insetsController.setAppearanceLightNavigationBars(false);
  }

  @Override
  public void onStart() {
    super.onStart();
    // Inject safe area insets as CSS variables once the bridge is ready
    setupSafeAreaInsets();
  }

  /**
   * Gets the WindowInsets and injects them as CSS custom properties.
   * Converts from physical pixels to CSS pixels (divides by density).
   * This fixes the broken env() on Android which doesn't update on rotation.
   */
  private void setupSafeAreaInsets() {
    View decorView = getWindow().getDecorView();

    ViewCompat.setOnApplyWindowInsetsListener(decorView, (view, windowInsetsCompat) -> {
      // Get native safe regions in physical pixels. Android WebView's CSS
      // env(safe-area-inset-*) is unreliable after rotation, and displayCutout
      // alone does not include gesture or 3-button navigation bars.
      Insets cutout = windowInsetsCompat.getInsets(WindowInsetsCompat.Type.displayCutout());
      Insets systemBars = windowInsetsCompat.getInsets(WindowInsetsCompat.Type.systemBars());
      Insets mandatorySystemGestures = windowInsetsCompat.getInsets(WindowInsetsCompat.Type.mandatorySystemGestures());
      Insets ime = windowInsetsCompat.getInsets(WindowInsetsCompat.Type.ime());
      boolean imeVisible = windowInsetsCompat.isVisible(WindowInsetsCompat.Type.ime());

      // Convert from physical pixels to CSS pixels (divide by density)
      float density = getResources().getDisplayMetrics().density;
      int topCss = pxToCss(maxInset(cutout.top, systemBars.top), density);
      int bottomCss = pxToCss(maxInset(cutout.bottom, systemBars.bottom, mandatorySystemGestures.bottom), density);
      int leftCss = pxToCss(maxInset(cutout.left, systemBars.left, mandatorySystemGestures.left), density);
      int rightCss = pxToCss(maxInset(cutout.right, systemBars.right, mandatorySystemGestures.right), density);

      Log.d(
          TAG,
          "safeAreaInsets: cutoutCss=(" + topCss + "," + rightCss + "," + bottomCss + "," + leftCss + ")" +
              " systemBars=(" + systemBars.top + "," + systemBars.right + "," + systemBars.bottom + "," + systemBars.left + ")" +
              " mandatoryGestures=(" + mandatorySystemGestures.top + "," + mandatorySystemGestures.right + "," + mandatorySystemGestures.bottom + "," + mandatorySystemGestures.left + ")" +
              " imeBottom=" + ime.bottom +
              " imeVisible=" + imeVisible);

      // Inject CSS that sets our variables (these take priority over broken env())
      String js = String.format(
          "(function() {" +
              "  var style = document.getElementById('android-safe-area-override');" +
              "  if (!style) {" +
              "    style = document.createElement('style');" +
              "    style.id = 'android-safe-area-override';" +
              "    document.head.appendChild(style);" +
              "  }" +
              "  style.textContent = ':root { " +
              "--safe-area-inset-top: %dpx !important; " +
              "--safe-area-inset-bottom: %dpx !important; " +
              "--safe-area-inset-left: %dpx !important; " +
              "--safe-area-inset-right: %dpx !important; }';" +
              "})();",
          topCss, bottomCss, leftCss, rightCss);

      // Execute the JavaScript in the WebView
      runOnUiThread(() -> {
        try {
          WebView webView = getBridge().getWebView();
          if (webView != null) {
            webView.evaluateJavascript(js, null);
          }
        } catch (Exception e) {
          // WebView may not be ready yet
          Log.d(TAG, "safeAreaInsets: failed to inject CSS", e);
        }
      });

      return windowInsetsCompat;
    });

    // Request insets to be applied
    ViewCompat.requestApplyInsets(decorView);
  }

  private int pxToCss(int pixels, float density) {
    return Math.round(pixels / density);
  }

  private int maxInset(int... values) {
    int max = 0;
    for (int value : values) {
      max = Math.max(max, value);
    }
    return max;
  }

  /**
   * Prevents Android/WebView from treating the keyboard as a layout inset.
   *
   * Capacitor's iOS `Keyboard.resize = none` setting does not control Android.
   * On newer Android/WebView combinations, IME insets can still reach the
   * WebView in edge-to-edge mode even when the activity is set to
   * `adjustNothing`, which makes CSS viewport units behave as if the page was
   * resized above the keyboard. Strip only the IME inset before it reaches the
   * WebView; system bars and display cutouts still pass through for safe-area
   * handling.
   */
  private void setupImeInsetsGuard() {
    runOnUiThread(() -> {
      try {
        WebView webView = getBridge().getWebView();
        if (webView == null || !(webView.getParent() instanceof View)) {
          Log.d(TAG, "imeGuard: WebView or WebView parent not ready");
          return;
        }

        View webViewContainer = (View) webView.getParent();
        Log.d(
            TAG,
            "imeGuard: installing listeners; container=" + webViewContainer.getClass().getName() +
                " webView=" + webView.getClass().getName());
        webViewContainer.setFitsSystemWindows(false);
        webView.setFitsSystemWindows(false);

        OnApplyWindowInsetsListener imeGuard = (view, insets) -> {
          Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
          Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
          boolean imeVisible = insets.isVisible(WindowInsetsCompat.Type.ime());
          Log.d(
              TAG,
              "imeGuard: view=" + view.getClass().getSimpleName() +
                  " imeVisible=" + imeVisible +
                  " imeBottom=" + ime.bottom +
                  " systemBarsBottom=" + systemBars.bottom +
                  " height=" + view.getHeight() +
                  " paddingBottomBefore=" + view.getPaddingBottom());
          view.setPadding(0, 0, 0, 0);
          return new WindowInsetsCompat.Builder(insets)
              .setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE)
              .build();
        };

        ViewCompat.setOnApplyWindowInsetsListener(webViewContainer, imeGuard);
        ViewCompat.setOnApplyWindowInsetsListener(webView, imeGuard);
        ViewCompat.requestApplyInsets(webViewContainer);
        ViewCompat.requestApplyInsets(webView);
      } catch (Exception e) {
        // Bridge/WebView may not be ready during a transient activity state.
        Log.d(TAG, "imeGuard: failed to install listeners", e);
      }
    });
  }

  private void logWebViewStartupDiagnostics() {
    runOnUiThread(() -> {
      try {
        WebView webView = getBridge().getWebView();
        if (webView == null) {
          Log.i(TAG, "webViewStartupDiagnostics: WebView not ready");
          return;
        }

        webView.post(() -> {
          View decorView = getWindow().getDecorView();
          Log.i(
              TAG,
              "webViewStartupDiagnostics: webViewHardwareAccelerated=" + webView.isHardwareAccelerated() +
                  " decorHardwareAccelerated=" + decorView.isHardwareAccelerated() +
                  " layerType=" + layerTypeToString(webView.getLayerType()) +
                  " webViewPackage=" + getWebViewPackageDescription() +
                  " sdk=" + Build.VERSION.SDK_INT +
                  " device=" + Build.MANUFACTURER + " " + Build.MODEL);
        });
      } catch (Exception e) {
        Log.i(TAG, "webViewStartupDiagnostics: failed to log diagnostics", e);
      }
    });
  }

  private String getWebViewPackageDescription() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return "unavailable-before-api-26";
    }

    PackageInfo packageInfo = WebView.getCurrentWebViewPackage();
    if (packageInfo == null) {
      return "unavailable";
    }

    return packageInfo.packageName + "/" + packageInfo.versionName + " (" + getPackageVersionCode(packageInfo) + ")";
  }

  private String getPackageVersionCode(PackageInfo packageInfo) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      return String.valueOf(packageInfo.getLongVersionCode());
    }

    return String.valueOf(packageInfo.versionCode);
  }

  private String layerTypeToString(int layerType) {
    switch (layerType) {
      case View.LAYER_TYPE_HARDWARE:
        return "hardware";
      case View.LAYER_TYPE_SOFTWARE:
        return "software";
      case View.LAYER_TYPE_NONE:
        return "none";
      default:
        return "unknown-" + layerType;
    }
  }

}
