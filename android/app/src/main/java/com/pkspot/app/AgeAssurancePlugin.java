package com.pkspot.app;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.agesignals.AgeSignalsManager;
import com.google.android.play.agesignals.AgeSignalsManagerFactory;
import com.google.android.play.agesignals.AgeSignalsRequest;

@CapacitorPlugin(name = "AgeAssurance")
public class AgeAssurancePlugin extends Plugin {
  private static final String TAG = "PKSpotAgeAssurance";

  @PluginMethod
  public void getAgeSignal(PluginCall call) {
    try {
      AgeSignalsManager ageSignalsManager = AgeSignalsManagerFactory.create(getContext());
      ageSignalsManager
          .checkAgeSignals(AgeSignalsRequest.builder().build())
          .addOnSuccessListener(ageSignalsResult -> {
            JSObject result = AgeSignalsResponseMapper.fromResult(ageSignalsResult);
            Log.d(TAG, "playAgeSignals: " + result);
            call.resolve(result);
          })
          .addOnFailureListener(error -> {
            JSObject result = AgeSignalsResponseMapper.fromUnavailable(error);
            Log.d(TAG, "playAgeSignals: failed " + result, error);
            call.resolve(result);
          });
    } catch (Exception error) {
      JSObject result = AgeSignalsResponseMapper.fromUnavailable(error);
      Log.d(TAG, "playAgeSignals: request setup failed", error);
      call.resolve(result);
    }
  }
}
