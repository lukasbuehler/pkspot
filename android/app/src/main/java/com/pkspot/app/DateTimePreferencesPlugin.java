package com.pkspot.app;

import android.text.format.DateFormat;

import androidx.core.os.ConfigurationCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;

@CapacitorPlugin(name = "DateTimePreferences")
public class DateTimePreferencesPlugin extends Plugin {
  @PluginMethod
  public void getPreferences(PluginCall call) {
    Locale locale = ConfigurationCompat.getLocales(
        getContext().getResources().getConfiguration()).get(0);
    if (locale == null) locale = Locale.getDefault();

    JSObject result = new JSObject();
    result.put("locale", locale.toLanguageTag());
    result.put(
        "hourCycle",
        DateFormat.is24HourFormat(getContext()) ? "h23" : "h12");

    call.resolve(result);
  }
}
