package com.pkspot.app;

import android.app.PendingIntent;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.google.firebase.messaging.RemoteMessage;

import org.json.JSONArray;
import org.json.JSONObject;

import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;
import java.util.Objects;

import io.capawesome.capacitorjs.plugins.firebase.messaging.MessagingService;

public class PKSpotMessagingService extends MessagingService {
  @Override
  public void onMessageReceived(@NonNull RemoteMessage message) {
    super.onMessageReceived(message);
    if (message.getData().isEmpty()) return;
    showNotification(message.getData());
  }

  private void showNotification(Map<String, String> data) {
    NotificationChannels.configure(this);
    String intentId = data.get("intent_id");
    String threadKey = valueOr(data.get("thread_key"), intentId);
    String path = safePath(data.get("path"));
    NotificationCompat.Builder builder = new NotificationCompat.Builder(
        this,
        valueOr(data.get("channel_id"), channelFor(data.get("type"))))
        .setSmallIcon(R.drawable.ic_stat_pkspot)
        .setColor(ContextCompat.getColor(this, R.color.colorPrimary))
        .setContentTitle(valueOr(data.get("title"), getString(R.string.app_name)))
        .setContentText(valueOr(data.get("body"), ""))
        .setStyle(new NotificationCompat.BigTextStyle().bigText(valueOr(data.get("body"), "")))
        .setAutoCancel(true)
        .setOnlyAlertOnce(false)
        .setGroup(threadKey)
        .setContentIntent(pendingIntent(path, intentId, "tap"));

    Bitmap image = loadImage(data.get("image_url"));
    if (image != null) {
      builder.setLargeIcon(image).setStyle(
          new NotificationCompat.BigPictureStyle()
              .bigPicture(image)
              .bigLargeIcon((Bitmap) null)
              .setSummaryText(valueOr(data.get("body"), "")));
    }

    addActions(builder, data.get("action_labels"), intentId, path);
    try {
      NotificationManagerCompat.from(this).notify(threadKey, 0, builder.build());
    } catch (SecurityException ignored) {
      // Android 13+ may revoke permission between delivery and rendering.
    }
  }

  private void addActions(
      NotificationCompat.Builder builder,
      String serializedActions,
      String intentId,
      String returnPath) {
    if (serializedActions == null || intentId == null) return;
    try {
      JSONArray actions = new JSONArray(serializedActions);
      for (int index = 0; index < Math.min(actions.length(), 2); index++) {
        JSONObject item = actions.getJSONObject(index);
        String action = item.optString("action");
        String title = item.optString("title");
        if (!action.isEmpty() && !title.isEmpty()) {
          builder.addAction(0, title, pendingIntent(returnPath, intentId, action));
        }
      }
    } catch (Exception ignored) {
      // A malformed optional action list must not suppress the notification.
    }
  }

  private PendingIntent pendingIntent(String returnPath, String intentId, String action) {
    Uri target = "tap".equals(action)
        ? Uri.parse("https://pkspot.app" + returnPath)
        : new Uri.Builder()
            .scheme("https")
            .authority("pkspot.app")
            .path("/notifications")
            .appendQueryParameter("notification", intentId)
            .appendQueryParameter("notificationAction", action)
            .appendQueryParameter("returnTo", returnPath)
            .build();
    Intent intent = new Intent(Intent.ACTION_VIEW, target, this, MainActivity.class)
        .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    return PendingIntent.getActivity(
        this,
        Objects.hash(intentId, action),
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  private Bitmap loadImage(String imageUrl) {
    if (imageUrl == null || imageUrl.isEmpty()) return null;
    HttpURLConnection connection = null;
    try {
      connection = (HttpURLConnection) new URL(imageUrl).openConnection();
      connection.setConnectTimeout(4000);
      connection.setReadTimeout(6000);
      connection.setDoInput(true);
      connection.connect();
      return BitmapFactory.decodeStream(connection.getInputStream());
    } catch (Exception ignored) {
      return null;
    } finally {
      if (connection != null) connection.disconnect();
    }
  }

  private String channelFor(String type) {
    if ("follow_request".equals(type) || "new_follower".equals(type)) return "follow_incoming";
    if ("follow_accepted".equals(type)) return "follow_relationships";
    if ("event_reminder".equals(type)) return "event_reminders";
    if ("event_update".equals(type) || "event_registration_update".equals(type)
        || "event_ownership_update".equals(type)) return "event_updates";
    if ("spot_edit_update".equals(type)) return "spot_edit_updates";
    if ("spot_report_update".equals(type)) return "spot_report_updates";
    if ("media_report_update".equals(type)) return "media_report_updates";
    if ("community_info_update".equals(type)) return "community_info_updates";
    if ("community_event".equals(type)) return "community_events";
    if ("community_spot_digest".equals(type)) return "community_spot_digest";
    return "event_updates";
  }

  private String safePath(String path) {
    return path != null && path.startsWith("/") && !path.startsWith("//")
        ? path
        : "/notifications";
  }

  private String valueOr(String value, String fallback) {
    return value == null || value.isEmpty() ? fallback : value;
  }
}
