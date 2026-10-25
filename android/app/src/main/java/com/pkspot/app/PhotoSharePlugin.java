package com.pkspot.app;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Durable, private photo handoff. Nothing is uploaded by the native receiver. */
@CapacitorPlugin(name = "PhotoShare")
public class PhotoSharePlugin extends Plugin {
  private final ExecutorService io = Executors.newSingleThreadExecutor();
  private static final long MAX_FILE_BYTES = 50L * 1024 * 1024;
  private static final long MAX_BATCH_BYTES = 200L * 1024 * 1024;

  @Override public void load() { receive(getActivity().getIntent()); }
  @Override protected void handleOnNewIntent(Intent intent) { receive(intent); }
  @Override protected void handleOnDestroy() { io.shutdown(); }
  private File root() { return new File(getContext().getFilesDir(), "shared-photos"); }

  private void receive(Intent intent) {
    if (intent == null || intent.getType() == null || !intent.getType().startsWith("image/")) return;
    ArrayList<Uri> uris = new ArrayList<>();
    if (Intent.ACTION_SEND.equals(intent.getAction())) {
      Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
      if (uri != null) uris.add(uri);
    } else if (Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) {
      ArrayList<Uri> values = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
      if (values != null) uris.addAll(values);
    } else return;
    if (uris.isEmpty() && intent.getClipData() != null) {
      for (int i = 0; i < intent.getClipData().getItemCount(); i++) {
        Uri uri = intent.getClipData().getItemAt(i).getUri();
        if (uri != null) uris.add(uri);
      }
    }
    if (uris.isEmpty()) return;
    // Avoid replay when this Activity is recreated. Originals are copied below
    // before acknowledgement is ever exposed to the web app.
    intent.removeExtra(Intent.EXTRA_STREAM);
    intent.setClipData(null);
    io.execute(() -> persist(uris));
  }

  private void persist(List<Uri> uris) {
    String id = UUID.randomUUID().toString();
    File temporary = new File(root(), id + ".pending");
    try {
      if (uris.size() > 8) throw new IOException("Too many photos");
      if (!temporary.mkdirs()) throw new IOException("Cannot create photo directory");
      JSONArray files = new JSONArray();
      long total = 0;
      for (int i = 0; i < uris.size(); i++) {
        Uri uri = uris.get(i);
        if (!"content".equals(uri.getScheme())) throw new IOException("Unsupported photo URI");
        String mime = getContext().getContentResolver().getType(uri);
        if (mime == null || !mime.startsWith("image/")) throw new IOException("Not a photo");
        File output = new File(temporary, "photo-" + i);
        long bytes = 0;
        try (InputStream input = getContext().getContentResolver().openInputStream(uri);
             OutputStream out = new FileOutputStream(output)) {
          if (input == null) throw new IOException("Photo unavailable");
          byte[] buffer = new byte[65536];
          int read;
          while ((read = input.read(buffer)) != -1) {
            bytes += read; total += read;
            if (bytes > MAX_FILE_BYTES || total > MAX_BATCH_BYTES) throw new IOException("Photo limit exceeded");
            out.write(buffer, 0, read);
          }
        }
        files.put(new JSONObject().put("name", output.getName()).put("mimeType", mime));
      }
      JSONObject manifest = new JSONObject().put("id", id).put("files", files);
      try (FileOutputStream out = new FileOutputStream(new File(temporary, "manifest.json"))) {
        out.write(manifest.toString().getBytes(StandardCharsets.UTF_8));
        out.getFD().sync();
      }
      if (!temporary.renameTo(new File(root(), id))) throw new IOException("Cannot commit photos");
      android.util.Log.i("PKSpotPhotoShare", "Queued photos: " + files.length());
      notifyListeners("photosReceived", new JSObject(), true);
    } catch (Exception error) {
      delete(temporary);
      android.util.Log.w("PKSpotPhotoShare", "Photo import failed: " + error.getClass().getSimpleName());
      notifyListeners("photosFailed", new JSObject(), true);
    }
  }

  @PluginMethod public void pending(PluginCall call) {
    io.execute(() -> {
      try {
        JSArray batches = new JSArray();
        File[] directories = root().listFiles();
        if (directories != null) for (File directory : directories) {
          if (!directory.getName().matches("[a-f0-9-]{36}")) continue;
          File manifestFile = new File(directory, "manifest.json");
          try (InputStream input = new FileInputStream(manifestFile)) {
            JSONObject manifest = new JSONObject(readText(input));
            JSONArray files = manifest.getJSONArray("files");
            for (int i = 0; i < files.length(); i++) {
              JSONObject file = files.getJSONObject(i);
              file.put("uri", Uri.fromFile(new File(directory, file.getString("name"))).toString());
            }
            batches.put(manifest);
          }
        }
        call.resolve(new JSObject().put("batches", batches));
      } catch (Exception error) { call.reject("Cannot read shared photos"); }
    });
  }

  @PluginMethod public void acknowledge(PluginCall call) {
    String id = call.getString("id", "");
    if (!id.matches("[a-f0-9-]{36}")) { call.reject("Invalid photo batch"); return; }
    io.execute(() -> { delete(new File(root(), id)); call.resolve(); });
  }

  private static String readText(InputStream input) throws IOException {
    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
    byte[] buffer = new byte[4096];
    int read;
    while ((read = input.read(buffer)) != -1) bytes.write(buffer, 0, read);
    return bytes.toString("UTF-8");
  }

  private static void delete(File file) {
    File[] children = file.listFiles();
    if (children != null) for (File child : children) delete(child);
    file.delete();
  }
}
