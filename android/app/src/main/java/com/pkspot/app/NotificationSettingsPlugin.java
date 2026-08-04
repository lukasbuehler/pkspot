package com.pkspot.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.messaging.FirebaseMessaging;

@CapacitorPlugin(name = "NotificationSettings")
public class NotificationSettingsPlugin extends Plugin {
  @PluginMethod
  public void openAppNotificationSettings(PluginCall call) {
    Intent intent;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
          .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
    } else {
      intent = new Intent(
          Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
          Uri.parse("package:" + getContext().getPackageName()));
    }
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    getContext().startActivity(intent);
    call.resolve();
  }

  @PluginMethod
  public void getSystemNotificationStatus(PluginCall call) {
    JSObject result = new JSObject();
    result.put(
        "enabled",
        NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
    call.resolve(result);
  }

  @PluginMethod
  public void setAutoInitEnabled(PluginCall call) {
    JSObject data = call.getData();
    boolean enabled = data.optBoolean("enabled", false);
    FirebaseMessaging.getInstance().setAutoInitEnabled(enabled);
    call.resolve();
  }

  @PluginMethod
  public void configureNotificationChannels(PluginCall call) {
    if (NotificationChannels.configure(getContext())) {
      call.resolve();
    } else {
      call.reject("Android notification manager is unavailable.");
    }
  }

  @PluginMethod
  public void dismissDeliveredNotification(PluginCall call) {
    String threadKey = call.getString("threadKey");
    if (threadKey != null && !threadKey.isEmpty()) {
      NotificationManagerCompat.from(getContext()).cancel(threadKey, 0);
    }
    call.resolve();
  }
}
