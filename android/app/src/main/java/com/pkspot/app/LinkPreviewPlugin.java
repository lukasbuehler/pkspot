package com.pkspot.app;

import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.util.UUID;

@CapacitorPlugin(name = "LinkPreview")
public class LinkPreviewPlugin extends Plugin {
  @PluginMethod
  public void share(PluginCall call) {
    String url = call.getString("url", "");
    Uri page = Uri.parse(url);
    if (!"https".equals(page.getScheme()) || !"pkspot.app".equals(page.getHost())) {
      call.reject("Invalid share URL"); return;
    }
    Intent send = new Intent(Intent.ACTION_SEND);
    send.setType("text/plain");
    send.putExtra(Intent.EXTRA_TEXT, url);
    send.putExtra(Intent.EXTRA_TITLE, call.getString("title", "PK Spot"));
    try {
      File directory = new File(getContext().getCacheDir(), "share-previews");
      directory.mkdirs();
      File[] previous = directory.listFiles();
      if (previous != null) for (File file : previous) {
        if (file.lastModified() < System.currentTimeMillis() - 86400000L) file.delete();
      }
      String encoded = call.getString("imageBase64", "");
      if (!encoded.isEmpty() && encoded.length() <= 4 * 1024 * 1024) {
        byte[] image = Base64.decode(encoded, Base64.DEFAULT);
        // Name the file by its format: FileProvider derives the MIME type from the extension.
        boolean jpeg = image.length > 2 && (image[0] & 0xff) == 0xff && (image[1] & 0xff) == 0xd8;
        File file = new File(directory, UUID.randomUUID() + (jpeg ? ".jpg" : ".png"));
        try (FileOutputStream output = new FileOutputStream(file)) { output.write(image); }
        Uri thumbnail = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
        // ClipData supplies the Sharesheet thumbnail. Deliberately no EXTRA_STREAM
        // and no image MIME type: the payload remains a text link, not an attachment.
        send.setClipData(ClipData.newUri(getContext().getContentResolver(), "Preview", thumbnail));
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
      }
    } catch (Exception error) {
      // A failed thumbnail must not prevent the standard link share.
      android.util.Log.w("LinkPreview", "Thumbnail unavailable");
    }
    getActivity().runOnUiThread(() -> {
      try {
        getActivity().startActivity(Intent.createChooser(send, null));
        JSObject result = new JSObject();
        result.put("previewApplied", send.getClipData() != null);
        call.resolve(result); // The chooser opened; this does not prove delivery.
      } catch (Exception error) { call.reject("Share sheet unavailable"); }
    });
  }
}
