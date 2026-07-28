package com.pkspot.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.agesignals.AgeSignalsAccessRequest;
import com.google.android.play.agesignals.AgeSignalsManager;
import com.google.android.play.agesignals.AgeSignalsManagerFactory;
import com.google.android.play.agesignals.AgeSignalsRequest;
import com.google.android.play.agesignals.model.AgeSignalsStatus;
import com.google.android.play.core.integrity.IntegrityManagerFactory;
import com.google.android.play.core.integrity.StandardIntegrityManager;
import java.util.Map;
import java.util.function.Consumer;

@CapacitorPlugin(name = "AgeAssurance")
public class AgeAssurancePlugin extends Plugin {
  private static final long CLOUD_PROJECT_NUMBER = 294969617102L;

  @PluginMethod
  public void getAgeSignal(PluginCall call) {
    requestAgeSignal(
        signal -> call.resolve(AgeSignalsResponseMapper.toJsObject(signal)),
        error -> call.resolve(
            AgeSignalsResponseMapper.fromUnavailable(error)));
  }

  @PluginMethod
  public void getBoundAgeSignal(PluginCall call) {
    String uid = requiredString(call, "uid");
    String challengeId = requiredString(call, "challengeId");
    String challengeNonce = requiredString(call, "challengeNonce");
    if (uid == null || challengeId == null || challengeNonce == null) {
      return;
    }

    requestAgeSignal(
        signal -> requestBoundIntegrityToken(
            uid,
            challengeId,
            challengeNonce,
            signal,
            call),
        error -> call.reject(
            "The age signal could not be read securely.",
            error));
  }

  private void requestAgeSignal(
      Consumer<Map<String, Object>> onSuccess,
      Consumer<Exception> onFailure) {
    try {
      AgeSignalsManager manager =
          AgeSignalsManagerFactory.create(getContext());
      manager
          .requestAgeSignalsAccess(
              AgeSignalsAccessRequest.builder()
                  .setActivity(getActivity())
                  .build())
          .addOnSuccessListener(accessResult -> {
            Integer status = accessResult.ageSignalsStatus();
            if (status == null || status != AgeSignalsStatus.SHARED) {
              onSuccess.accept(
                  AgeSignalsResponseMapper.accessStatusMap(status));
              return;
            }
            manager
                .checkAgeSignals(AgeSignalsRequest.builder().build())
                .addOnSuccessListener(result -> onSuccess.accept(
                    AgeSignalsResponseMapper.resultMap(result)))
                .addOnFailureListener(onFailure::accept);
          })
          .addOnFailureListener(onFailure::accept);
    } catch (Exception error) {
      onFailure.accept(error);
    }
  }

  private void requestBoundIntegrityToken(
      String uid,
      String challengeId,
      String challengeNonce,
      Map<String, Object> signal,
      PluginCall call) {
    try {
      String requestHash = AgeAssuranceBinding.requestHash(
          uid,
          challengeId,
          challengeNonce,
          signal);
      StandardIntegrityManager integrityManager =
          IntegrityManagerFactory.createStandard(getContext());
      integrityManager
          .prepareIntegrityToken(
              StandardIntegrityManager.PrepareIntegrityTokenRequest
                  .builder()
                  .setCloudProjectNumber(CLOUD_PROJECT_NUMBER)
                  .build())
          .addOnSuccessListener(provider -> provider
              .request(
                  StandardIntegrityManager.StandardIntegrityTokenRequest
                      .builder()
                      .setRequestHash(requestHash)
                      .build())
              .addOnSuccessListener(token -> {
                JSObject result = new JSObject();
                result.put(
                    "signal",
                    AgeSignalsResponseMapper.toJsObject(signal));
                result.put("integrityToken", token.token());
                call.resolve(result);
              })
              .addOnFailureListener(error -> call.reject(
                  "The age signal integrity check failed.",
                  error)))
          .addOnFailureListener(error -> call.reject(
              "The age signal integrity check could not start.",
              error));
    } catch (Exception error) {
      call.reject("The age signal could not be protected.", error);
    }
  }

  private String requiredString(PluginCall call, String field) {
    String value = call.getString(field);
    if (value == null || value.isEmpty() || value.length() > 256) {
      call.reject("Missing or invalid " + field + ".");
      return null;
    }
    return value;
  }
}
