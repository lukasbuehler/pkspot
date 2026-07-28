package com.pkspot.app;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;

public final class AgeAssuranceBinding {
  private static final String PREFIX = "pkspot-age-assurance-v3";

  private AgeAssuranceBinding() {}

  public static String requestHash(
      String uid,
      String challengeId,
      String challengeNonce,
      Map<String, Object> signal) throws Exception {
    ByteArrayOutputStream canonical = new ByteArrayOutputStream();
    canonical.write(PREFIX.getBytes(StandardCharsets.UTF_8));
    writeValue(canonical, uid);
    writeValue(canonical, challengeId);
    writeValue(canonical, challengeNonce);
    writeValue(canonical, signal.get("platform"));
    writeValue(canonical, signal.get("source"));
    writeValue(canonical, signal.get("available"));
    writeValue(canonical, signal.get("response"));
    writeValue(canonical, signal.get("ageSignalsStatus"));
    writeValue(canonical, signal.get("ageLower"));
    writeValue(canonical, signal.get("ageUpper"));
    writeValue(canonical, signal.get("ageRangeSource"));
    writeValue(canonical, signal.get("significantChangeStatus"));

    byte[] digest = MessageDigest
        .getInstance("SHA-256")
        .digest(canonical.toByteArray());
    return base64UrlWithoutPadding(digest);
  }

  private static void writeValue(
      ByteArrayOutputStream output,
      Object value) throws Exception {
    String normalized;
    if (value == null) {
      normalized = "";
    } else if (value instanceof Boolean) {
      normalized = ((Boolean) value) ? "1" : "0";
    } else {
      normalized = String.valueOf(value);
    }
    byte[] encoded = normalized.getBytes(StandardCharsets.UTF_8);
    output.write(String.valueOf(encoded.length).getBytes(StandardCharsets.US_ASCII));
    output.write(':');
    output.write(encoded);
  }

  private static String base64UrlWithoutPadding(byte[] value) {
    final char[] alphabet =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
            .toCharArray();
    StringBuilder encoded = new StringBuilder((value.length * 4 + 2) / 3);
    int index = 0;
    while (index + 2 < value.length) {
      int block = ((value[index] & 0xff) << 16)
          | ((value[index + 1] & 0xff) << 8)
          | (value[index + 2] & 0xff);
      encoded.append(alphabet[(block >>> 18) & 0x3f]);
      encoded.append(alphabet[(block >>> 12) & 0x3f]);
      encoded.append(alphabet[(block >>> 6) & 0x3f]);
      encoded.append(alphabet[block & 0x3f]);
      index += 3;
    }
    int remaining = value.length - index;
    if (remaining == 1) {
      int block = (value[index] & 0xff) << 16;
      encoded.append(alphabet[(block >>> 18) & 0x3f]);
      encoded.append(alphabet[(block >>> 12) & 0x3f]);
    } else if (remaining == 2) {
      int block = ((value[index] & 0xff) << 16)
          | ((value[index + 1] & 0xff) << 8);
      encoded.append(alphabet[(block >>> 18) & 0x3f]);
      encoded.append(alphabet[(block >>> 12) & 0x3f]);
      encoded.append(alphabet[(block >>> 6) & 0x3f]);
    }
    return encoded.toString();
  }
}
