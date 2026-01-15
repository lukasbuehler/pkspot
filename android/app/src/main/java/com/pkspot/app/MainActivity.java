package com.pkspot.app;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // Enable edge-to-edge display for proper safe-area-inset CSS support
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
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
      // Get display cutout insets (the notch/camera hole) in physical pixels
      Insets cutout = windowInsetsCompat.getInsets(WindowInsetsCompat.Type.displayCutout());

      // Convert from physical pixels to CSS pixels (divide by density)
      float density = getResources().getDisplayMetrics().density;
      int topCss = Math.round(cutout.top / density);
      int bottomCss = Math.round(cutout.bottom / density);
      int leftCss = Math.round(cutout.left / density);
      int rightCss = Math.round(cutout.right / density);

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
        }
      });

      return windowInsetsCompat;
    });

    // Request insets to be applied
    ViewCompat.requestApplyInsets(decorView);
  }
}
