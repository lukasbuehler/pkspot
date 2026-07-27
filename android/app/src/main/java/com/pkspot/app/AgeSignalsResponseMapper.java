package com.pkspot.app;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.google.android.play.agesignals.AgeSignalsException;
import com.google.android.play.agesignals.AgeSignalsResult;
import com.google.android.play.agesignals.model.AgeRangeSource;
import com.google.android.play.agesignals.model.AgeSignalsStatus;
import com.google.android.play.agesignals.model.SignificantChangeStatus;
import java.util.LinkedHashMap;
import java.util.Map;

public final class AgeSignalsResponseMapper {
  private AgeSignalsResponseMapper() {}

  public static JSObject fromResult(AgeSignalsResult ageSignalsResult) {
    return toJsObject(resultMap(ageSignalsResult));
  }

  public static Map<String, Object> resultMap(AgeSignalsResult ageSignalsResult) {
    Map<String, Object> result = baseResultMap(true);
    result.put("response", "shared");
    result.put("ageSignalsStatus", "shared");
    putIfPresent(result, "ageLower", ageSignalsResult.ageLower());
    putIfPresent(result, "ageUpper", ageSignalsResult.ageUpper());
    putIfPresent(result, "installId", ageSignalsResult.installId());
    putIfPresent(
        result,
        "ageRangeSource",
        ageRangeSourceName(ageSignalsResult.ageRangeSource()));
    putIfPresent(
        result,
        "significantChangeStatus",
        significantChangeStatusName(ageSignalsResult.significantChangeStatus()));
    Object approvalDate = ageSignalsResult.significantChangeApprovalDate();
    putIfPresent(
        result,
        "significantChangeApprovalDate",
        approvalDate == null ? null : String.valueOf(approvalDate));
    result.put("requiredRegulatoryFeatures", new Object[0]);
    return result;
  }

  public static JSObject fromAccessStatus(Integer status) {
    return toJsObject(accessStatusMap(status));
  }

  public static Map<String, Object> accessStatusMap(Integer status) {
    if (status == null || status == AgeSignalsStatus.UNSPECIFIED) {
      return unavailableMap(
          new IllegalStateException("Play Age Signals returned no access status"));
    }
    Map<String, Object> result = baseResultMap(true);
    if (status == AgeSignalsStatus.VERIFICATION_REQUIRED) {
      result.put("response", "unavailable");
      result.put("ageSignalsStatus", "verification_required");
    } else {
      result.put("response", "declined");
      result.put("ageSignalsStatus", "not_shared");
    }
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

  private static String ageRangeSourceName(Integer source) {
    if (source == null) return null;
    if (source == AgeRangeSource.TIER_A) return "tier_a";
    if (source == AgeRangeSource.TIER_B) return "tier_b";
    if (source == AgeRangeSource.TIER_C) return "tier_c";
    if (source == AgeRangeSource.TIER_D) return "tier_d";
    return "unknown";
  }

  private static String significantChangeStatusName(Integer status) {
    if (status == null) return null;
    if (status == SignificantChangeStatus.APPROVED) return "approved";
    if (status == SignificantChangeStatus.PENDING) return "pending";
    if (status == SignificantChangeStatus.DECLINED) return "declined";
    return "unknown";
  }

  private static void putIfPresent(
      Map<String, Object> result,
      String key,
      Object value) {
    if (value != null) result.put(key, value);
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
