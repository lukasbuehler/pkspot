package com.pkspot.app;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Receives Google/Apple Maps text shares on both cold and warm app starts. */
@CapacitorPlugin(name = "MapShare")
public class MapSharePlugin extends Plugin {
  @Override
  public void load() {
    receive(getActivity().getIntent());
  }

  @Override
  protected void handleOnNewIntent(Intent intent) {
    receive(intent);
  }

  private void receive(Intent intent) {
    if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction()) ||
        !"text/plain".equals(intent.getType())) return;
    CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
    if (text == null || text.length() == 0 || text.length() > 16384) return;
    JSObject data = new JSObject();
    data.put("text", text.toString());
    // Retain cold-start events until Angular has registered its listener.
    notifyListeners("mapShared", data, true);
    intent.removeExtra(Intent.EXTRA_TEXT);
  }
}
