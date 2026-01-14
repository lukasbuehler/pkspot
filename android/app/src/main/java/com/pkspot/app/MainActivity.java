package com.pkspot.app;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  private boolean insetsInjected = false;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // Enable edge-to-edge display for proper safe-area-inset CSS support
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
  }

  @Override
  public void onStart() {
    super.onStart();
    // Inject safe area insets as CSS variables once the bridge is ready
    setupSafeAreaInsets();
  }

  /**
   * Gets the WindowInsets and injects them as CSS custom properties to work
   * around
   * the Chromium WebView bug where env(safe-area-inset-*) returns 0.
   * 
   * Only injects display cutout values, NOT the full system bar insets,
   * because the app layout already accounts for status/nav bars.
   */
  private void setupSafeAreaInsets() {
    View decorView = getWindow().getDecorView();

    ViewCompat.setOnApplyWindowInsetsListener(decorView, (view, windowInsetsCompat) -> {
      // Get ONLY display cutout insets (the notch/camera hole)
      // Don't include systemBars as the app handles status bar separately
      Insets cutout = windowInsetsCompat.getInsets(WindowInsetsCompat.Type.displayCutout());

      // Also get system bars to compare
      Insets systemBars = windowInsetsCompat.getInsets(WindowInsetsCompat.Type.systemBars());

      // Use display cutout values - these are what env(safe-area-inset-*) should
      // return
      // The values are already in CSS pixels (the WebView handles density)
      int topPx = cutout.top;
      int bottomPx = cutout.bottom;
      int leftPx = cutout.left;
      int rightPx = cutout.right;

      // Only inject if we have actual cutout insets
      // This prevents overriding when there's no notch
      if (topPx > 0 || bottomPx > 0 || leftPx > 0 || rightPx > 0) {
        injectInsets(topPx, bottomPx, leftPx, rightPx, systemBars);
      }

      return windowInsetsCompat;
    });

    // Request insets to be applied
    ViewCompat.requestApplyInsets(decorView);
  }

  private void injectInsets(int topPx, int bottomPx, int leftPx, int rightPx, Insets systemBars) {
    // Inject as CSS custom properties
    String css = String.format(
        ":root { " +
            "--safe-area-inset-top: %dpx; " +
            "--safe-area-inset-bottom: %dpx; " +
            "--safe-area-inset-left: %dpx; " +
            "--safe-area-inset-right: %dpx; " +
            "}",
        topPx, bottomPx, leftPx, rightPx);

    // JavaScript to inject the style
    String js = String.format(
        "(function() {" +
            "  var style = document.getElementById('android-safe-area-insets');" +
            "  if (!style) {" +
            "    style = document.createElement('style');" +
            "    style.id = 'android-safe-area-insets';" +
            "    document.head.appendChild(style);" +
            "  }" +
            "  style.textContent = '%s';" +
            "  console.log('[Android] Safe area insets (cutout only): top=%d, bottom=%d, left=%d, right=%d');" +
            "  console.log('[Android] System bars for reference: top=%d, bottom=%d, left=%d, right=%d');" +
            "})();",
        css.replace("'", "\\'"),
        topPx, bottomPx, leftPx, rightPx,
        systemBars.top, systemBars.bottom, systemBars.left, systemBars.right);

    // Execute the JavaScript in the WebView
    runOnUiThread(() -> {
      try {
        WebView webView = getBridge().getWebView();
        if (webView != null) {
          webView.evaluateJavascript(js, null);
        }
      } catch (Exception e) {
        // WebView may not be ready yet, that's okay
      }
    });
  }
}
