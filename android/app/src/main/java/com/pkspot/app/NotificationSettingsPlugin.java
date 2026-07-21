package com.pkspot.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationChannelGroup;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.SharedPreferences;
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

import java.util.Arrays;

@CapacitorPlugin(name = "NotificationSettings")
public class NotificationSettingsPlugin extends Plugin {
  private static final String FOLLOW_GROUP_ID = "group_follow_activity";
  private static final String EVENTS_GROUP_ID = "group_events";
  private static final String CONTRIBUTIONS_GROUP_ID = "group_spot_contributions";
  private static final String CHANNEL_PREFS = "notification_channel_migrations";
  private static final String SEMANTIC_GROUPS_MIGRATED = "semantic_groups_v1";

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
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      call.resolve();
      return;
    }

    NotificationManager manager = getContext().getSystemService(NotificationManager.class);
    if (manager == null) {
      call.reject("Android notification manager is unavailable.");
      return;
    }

    migratePreReleaseChannels(manager);

    manager.createNotificationChannelGroups(Arrays.asList(
        new NotificationChannelGroup(FOLLOW_GROUP_ID, "Follow activity"),
        new NotificationChannelGroup(EVENTS_GROUP_ID, "Events"),
        new NotificationChannelGroup(CONTRIBUTIONS_GROUP_ID, "Spot contributions")));

    createChannel(
        manager,
        "follow_incoming",
        "Follow requests and new followers",
        "New follow requests and people who started following you",
        FOLLOW_GROUP_ID,
        Notification.VISIBILITY_PRIVATE);
    createChannel(
        manager,
        "follow_relationships",
        "Accepted follow requests and mutual followers",
        "Accepted follow requests and new mutual follow relationships",
        FOLLOW_GROUP_ID,
        Notification.VISIBILITY_PRIVATE);
    createChannel(
        manager,
        "event_reminders",
        "Event reminders",
        "Reminders for events you responded to",
        EVENTS_GROUP_ID,
        Notification.VISIBILITY_PUBLIC);
    createChannel(
        manager,
        "event_updates",
        "Event updates",
        "Important changes to events you responded to",
        EVENTS_GROUP_ID,
        Notification.VISIBILITY_PUBLIC);
    createChannel(
        manager,
        "spot_edit_updates",
        "Spot edit updates",
        "Updates about Spot edits you submitted",
        CONTRIBUTIONS_GROUP_ID,
        Notification.VISIBILITY_PRIVATE);
    call.resolve();
  }

  private void migratePreReleaseChannels(NotificationManager manager) {
    SharedPreferences preferences = getContext().getSharedPreferences(CHANNEL_PREFS, 0);
    if (preferences.getBoolean(SEMANTIC_GROUPS_MIGRATED, false)) {
      return;
    }

    // Android does not let an existing channel move to another group.
    manager.deleteNotificationChannel("social");
    manager.deleteNotificationChannel("events");
    manager.deleteNotificationChannel("account");
    manager.deleteNotificationChannel("follow_activity");
    manager.deleteNotificationChannel("event_reminders");
    manager.deleteNotificationChannel("event_updates");
    manager.deleteNotificationChannel("spot_edit_updates");
    manager.deleteNotificationChannelGroup("pkspot_notifications");
    preferences.edit().putBoolean(SEMANTIC_GROUPS_MIGRATED, true).apply();
  }

  private void createChannel(
      NotificationManager manager,
      String id,
      String name,
      String description,
      String groupId,
      int lockscreenVisibility) {
    NotificationChannel channel =
        new NotificationChannel(id, name, NotificationManager.IMPORTANCE_DEFAULT);
    channel.setDescription(description);
    channel.setGroup(groupId);
    channel.enableVibration(true);
    channel.setLockscreenVisibility(lockscreenVisibility);
    manager.createNotificationChannel(channel);
  }
}
