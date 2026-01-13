package com.pkspot.app;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // Enable edge-to-edge display for proper safe-area-inset CSS support
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
  }
}
