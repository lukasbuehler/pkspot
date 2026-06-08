package com.pkspot.app;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.google.android.play.agesignals.AgeSignalsException;
import com.google.android.play.agesignals.AgeSignalsResult;
import java.util.LinkedHashMap;
import java.util.Map;

public final class AgeSignalsResponseMapper {
  private AgeSignalsResponseMapper() {}

  public static JSObject fromResult(AgeSignalsResult ageSignalsResult) {
    return toJsObject(resultMap(ageSignalsResult));
  }

  public static Map<String, Object> resultMap(AgeSignalsResult ageSignalsResult) {
    Map<String, Object> result = baseResultMap(true);
    result.put("userStatus", String.valueOf(ageSignalsResult.userStatus()));
    result.put("ageLower", ageSignalsResult.ageLower());
    result.put("ageUpper", ageSignalsResult.ageUpper());
    result.put("mostRecentApprovalDate", String.valueOf(ageSignalsResult.mostRecentApprovalDate()));
    result.put("installId", ageSignalsResult.installId());
    result.put("requiredRegulatoryFeatures", new Object[0]);
    return result;
  }

  public static JSObject fromUnavailable(Exception error) {
    return toJsObject(unavailableMap(error));
  }

  public static Map<String, Object> unavailableMap(Exception error) {
    Map<String, Object> result = baseResultMap(false);
    result.put("response", "unavailable");
    if (error instanceof AgeSignalsException) {
      result.put("errorCode", ((AgeSignalsException) error).getErrorCode());
    }
    result.put("errorMessage", error.getMessage());
    return result;
  }

  private static Map<String, Object> baseResultMap(boolean available) {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("platform", "android");
    result.put("source", "android_play_age_signals");
    result.put("available", available);
    return result;
  }

  private static JSObject toJsObject(Map<String, Object> values) {
    JSObject result = new JSObject();
    for (Map.Entry<String, Object> entry : values.entrySet()) {
      Object value = entry.getValue();
      result.put(
          entry.getKey(),
          value instanceof Object[] ? new JSArray() : value
      );
    }
    return result;
  }
}
