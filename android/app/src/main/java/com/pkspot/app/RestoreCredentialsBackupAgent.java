package com.pkspot.app;

import android.app.backup.BackupAgentHelper;
import android.content.Context;
import android.util.Log;

import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.GetRestoreCredentialOption;
import androidx.credentials.RestoreCredential;
import androidx.credentials.exceptions.GetCredentialException;

import com.google.android.gms.tasks.Tasks;
import com.google.firebase.FirebaseApp;
import com.google.firebase.auth.FirebaseAuth;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Performs the no-UI Restore Credentials check as soon as Android has restored
 * app data. If setup networking is unavailable, the foreground path in the
 * Capacitor app retries on the user's first launch instead.
 */
public class RestoreCredentialsBackupAgent extends BackupAgentHelper {
  private static final String TAG = "PKSpotRestoreBackup";
  private static final String REGION = "europe-west1";
  private static final int NETWORK_TIMEOUT_MS = 8_000;
  private static final int TOTAL_TIMEOUT_SECONDS = 25;

  @Override
  public void onRestoreFinished() {
    super.onRestoreFinished();
    ExecutorService executor = Executors.newSingleThreadExecutor();
    try {
      executor.submit(() -> {
        try {
          restoreSession(getApplicationContext());
        } catch (Exception error) {
          throw new IllegalStateException(error);
        }
      })
          .get(TOTAL_TIMEOUT_SECONDS, TimeUnit.SECONDS);
    } catch (Exception error) {
      // Setup networking, Google Play services, and Firebase can legitimately
      // be unavailable at this point. Foreground recovery remains available.
      Log.i(TAG, "Background restore was not completed: " + error.getClass().getSimpleName());
    } finally {
      executor.shutdownNow();
    }
  }

  private static void restoreSession(Context context) throws Exception {
    JSONObject begin = call(context, "beginRestoreCredentialAuthentication", new JSONObject());
    String challengeId = begin.getString("challenge_id");
    String requestJson = begin.getString("request_json");
    String credentialResponseJson = getRestoreCredential(context, requestJson);
    JSONObject finishRequest = new JSONObject();
    finishRequest.put("challenge_id", challengeId);
    finishRequest.put("credential_response_json", credentialResponseJson);
    JSONObject finish = call(context, "finishRestoreCredentialAuthentication", finishRequest);
    String customToken = finish.getString("firebase_custom_token");
    Tasks.await(
        FirebaseAuth.getInstance(firebaseApp(context)).signInWithCustomToken(customToken),
        NETWORK_TIMEOUT_MS,
        TimeUnit.MILLISECONDS);
    Log.i(TAG, "Background Restore Credentials sign-in completed.");
  }

  private static String getRestoreCredential(Context context, String requestJson) throws Exception {
    AtomicReference<String> response = new AtomicReference<>();
    AtomicReference<Exception> failure = new AtomicReference<>();
    CountDownLatch completion = new CountDownLatch(1);
    CredentialManager.create(context).getCredentialAsync(
        context,
        new GetCredentialRequest(
            java.util.Collections.singletonList(new GetRestoreCredentialOption(requestJson))),
        null,
        Runnable::run,
        new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
          @Override
          public void onResult(GetCredentialResponse result) {
            if (result.getCredential() instanceof RestoreCredential) {
              response.set(
                  ((RestoreCredential) result.getCredential()).getAuthenticationResponseJson());
            } else {
              failure.set(new IllegalStateException("Unexpected credential type"));
            }
            completion.countDown();
          }

          @Override
          public void onError(GetCredentialException error) {
            failure.set(error);
            completion.countDown();
          }
        });
    if (!completion.await(NETWORK_TIMEOUT_MS, TimeUnit.MILLISECONDS)) {
      throw new IllegalStateException("Restore credential lookup timed out");
    }
    if (failure.get() != null) throw failure.get();
    String value = response.get();
    if (value == null || value.isEmpty()) {
      throw new IllegalStateException("Restore credential was empty");
    }
    return value;
  }

  private static JSONObject call(Context context, String name, JSONObject data) throws Exception {
    FirebaseApp firebaseApp = firebaseApp(context);
    String projectId = firebaseApp.getOptions().getProjectId();
    if (projectId == null || projectId.isEmpty()) {
      throw new IllegalStateException("Firebase project ID is unavailable");
    }
    URL url = new URL("https://" + REGION + "-" + projectId
        + ".cloudfunctions.net/" + name);
    HttpURLConnection connection = (HttpURLConnection) url.openConnection();
    try {
      byte[] payload = new JSONObject().put("data", data)
          .toString().getBytes(StandardCharsets.UTF_8);
      connection.setRequestMethod("POST");
      connection.setConnectTimeout(NETWORK_TIMEOUT_MS);
      connection.setReadTimeout(NETWORK_TIMEOUT_MS);
      connection.setDoOutput(true);
      connection.setRequestProperty("Content-Type", "application/json");
      try (OutputStream stream = connection.getOutputStream()) {
        stream.write(payload);
      }

      int status = connection.getResponseCode();
      try (InputStream stream = status >= 200 && status < 300
          ? connection.getInputStream()
          : connection.getErrorStream()) {
        String body = readUtf8(stream);
        if (status < 200 || status >= 300) {
          throw new IllegalStateException("Callable returned HTTP " + status);
        }
        JSONObject envelope = new JSONObject(body);
        JSONObject result = envelope.optJSONObject("result");
        return result != null ? result : envelope.getJSONObject("data");
      }
    } finally {
      connection.disconnect();
    }
  }

  private static FirebaseApp firebaseApp(Context context) {
    try {
      return FirebaseApp.getInstance();
    } catch (IllegalStateException ignored) {
      FirebaseApp initialized = FirebaseApp.initializeApp(context);
      if (initialized == null) {
        throw new IllegalStateException("Firebase could not be initialized");
      }
      return initialized;
    }
  }

  private static String readUtf8(InputStream stream) throws Exception {
    if (stream == null) return "";
    try (ByteArrayOutputStream output = new ByteArrayOutputStream()) {
      byte[] buffer = new byte[2_048];
      int read;
      while ((read = stream.read(buffer)) != -1) {
        output.write(buffer, 0, read);
      }
      return output.toString(StandardCharsets.UTF_8.name());
    }
  }
}
