package com.pkspot.app;

import android.app.Application;

public class PKSpotApplication extends Application {
  @Override
  public void onCreate() {
    super.onCreate();
    NotificationChannels.configure(this);
  }
}
