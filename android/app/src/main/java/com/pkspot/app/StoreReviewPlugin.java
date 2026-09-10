package com.pkspot.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.review.ReviewInfo;
import com.google.android.play.core.review.ReviewManager;
import com.google.android.play.core.review.ReviewManagerFactory;

@CapacitorPlugin(name = "StoreReview")
public class StoreReviewPlugin extends Plugin {
  private ReviewManager manager;
  private ReviewInfo info;

  @PluginMethod
  public void prepare(PluginCall call) {
    getActivity().runOnUiThread(() -> {
      info = null;
      manager = ReviewManagerFactory.create(getContext());
      manager.requestReviewFlow().addOnCompleteListener(task -> {
        if (!task.isSuccessful()) { call.reject("Review unavailable"); return; }
        info = task.getResult();
        call.resolve();
      });
    });
  }

  @PluginMethod
  public void request(PluginCall call) {
    getActivity().runOnUiThread(() -> {
      ReviewInfo prepared = info;
      info = null;
      if (prepared == null || getActivity().isFinishing() || getActivity().isDestroyed() ||
          !getActivity().hasWindowFocus()) {
        call.resolve();
        return;
      }
      manager.launchReviewFlow(getActivity(), prepared).addOnCompleteListener(task -> call.resolve());
    });
  }
}
