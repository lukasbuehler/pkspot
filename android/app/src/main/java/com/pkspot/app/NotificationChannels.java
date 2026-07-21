package com.pkspot.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationChannelGroup;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;

import java.util.Arrays;

final class NotificationChannels {
  private static final String FOLLOW_GROUP_ID = "group_follow_activity";
  private static final String EVENTS_GROUP_ID = "group_events";
  private static final String CONTRIBUTIONS_GROUP_ID = "group_spot_contributions";
  private static final String REPORTS_GROUP_ID = "group_reports";
  private static final String COMMUNITY_GROUP_ID = "group_community_contributions";
  private static final String CHANNEL_PREFS = "notification_channel_migrations";
  private static final String SEMANTIC_GROUPS_MIGRATED = "semantic_groups_v1";
  private static final String FCM_FALLBACK_REMOVED = "fcm_fallback_removed_v1";
  private static final String FCM_FALLBACK_CHANNEL_ID = "fcm_fallback_notification_channel";

  private NotificationChannels() {}

  static boolean configure(Context context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return true;
    }

    NotificationManager manager = context.getSystemService(NotificationManager.class);
    if (manager == null) {
      return false;
    }

    migratePreReleaseChannels(context, manager);
    manager.createNotificationChannelGroups(Arrays.asList(
        new NotificationChannelGroup(FOLLOW_GROUP_ID, "Follow activity"),
        new NotificationChannelGroup(EVENTS_GROUP_ID, "Events"),
        new NotificationChannelGroup(CONTRIBUTIONS_GROUP_ID, "Spot contributions"),
        new NotificationChannelGroup(REPORTS_GROUP_ID, "Reports"),
        new NotificationChannelGroup(COMMUNITY_GROUP_ID, "Community contributions")));

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
    createChannel(
        manager,
        "spot_report_updates",
        "Spot report outcomes",
        "Updates after a Spot report is reviewed",
        REPORTS_GROUP_ID,
        Notification.VISIBILITY_PRIVATE);
    createChannel(
        manager,
        "media_report_updates",
        "Media report outcomes",
        "Updates after a media report is reviewed",
        REPORTS_GROUP_ID,
        Notification.VISIBILITY_PRIVATE);
    createChannel(
        manager,
        "community_info_updates",
        "Community info submissions",
        "Updates when submitted community information is reviewed",
        COMMUNITY_GROUP_ID,
        Notification.VISIBILITY_PRIVATE);

    removeLegacyFallbackChannel(context, manager);
    return true;
  }

  private static void removeLegacyFallbackChannel(
      Context context,
      NotificationManager manager) {
    SharedPreferences preferences = context.getSharedPreferences(CHANNEL_PREFS, 0);
    if (preferences.getBoolean(FCM_FALLBACK_REMOVED, false)) {
      return;
    }

    // FCM created this when a notification arrived before semantic channels existed.
    manager.deleteNotificationChannel(FCM_FALLBACK_CHANNEL_ID);
    preferences.edit().putBoolean(FCM_FALLBACK_REMOVED, true).apply();
  }

  private static void migratePreReleaseChannels(
      Context context,
      NotificationManager manager) {
    SharedPreferences preferences = context.getSharedPreferences(CHANNEL_PREFS, 0);
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

  private static void createChannel(
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
