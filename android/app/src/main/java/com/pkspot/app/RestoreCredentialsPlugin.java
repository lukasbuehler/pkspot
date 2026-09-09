package com.pkspot.app;

import android.content.Context;

import androidx.core.content.ContextCompat;
import androidx.credentials.ClearCredentialStateRequest;
import androidx.credentials.CreateCredentialResponse;
import androidx.credentials.CreateRestoreCredentialRequest;
import androidx.credentials.CreateRestoreCredentialResponse;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.GetRestoreCredentialOption;
import androidx.credentials.RestoreCredential;
import androidx.credentials.exceptions.ClearCredentialException;
import androidx.credentials.exceptions.CreateCredentialException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.restorecredential.E2eeUnavailableException;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Collections;

/**
 * A narrow bridge for Android Restore Credentials. The credential provider owns
 * the key material; JavaScript receives only WebAuthn JSON to relay to the
 * relying-party server for verification.
 */
@CapacitorPlugin(name = "RestoreCredentials")
public class RestoreCredentialsPlugin extends Plugin {
  @PluginMethod
  public void createRestoreCredential(PluginCall call) {
    String requestJson = call.getString("requestJson");
    if (requestJson == null || requestJson.isEmpty()) {
      call.reject("requestJson is required", "RESTORE_CREDENTIAL_INVALID_REQUEST");
      return;
    }
    createRestoreCredential(call, requestJson, true);
  }

  @PluginMethod
  public void getRestoreCredential(PluginCall call) {
    String requestJson = call.getString("requestJson");
    if (requestJson == null || requestJson.isEmpty()) {
      call.reject("requestJson is required", "RESTORE_CREDENTIAL_INVALID_REQUEST");
      return;
    }

    Context context = getContext();
    CredentialManager credentialManager = CredentialManager.create(context);
    GetCredentialRequest request = new GetCredentialRequest(
        Collections.singletonList(new GetRestoreCredentialOption(requestJson)));
    credentialManager.getCredentialAsync(
        getActivity(),
        request,
        null,
        ContextCompat.getMainExecutor(context),
        new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
          @Override
          public void onResult(GetCredentialResponse response) {
            if (!(response.getCredential() instanceof RestoreCredential)) {
              call.reject(
                  "Restore credential provider returned an unexpected credential",
                  "RESTORE_CREDENTIAL_UNEXPECTED_RESPONSE");
              return;
            }
            JSObject result = new JSObject();
            result.put(
                "authenticationResponseJson",
                ((RestoreCredential) response.getCredential()).getAuthenticationResponseJson());
            call.resolve(result);
          }

          @Override
          public void onError(GetCredentialException error) {
            call.reject(
                "Unable to retrieve a restore credential",
                "RESTORE_CREDENTIAL_GET_FAILED",
                error);
          }
        });
  }

  @PluginMethod
  public void clearRestoreCredential(PluginCall call) {
    Context context = getContext();
    CredentialManager.create(context).clearCredentialStateAsync(
        new ClearCredentialStateRequest(
            ClearCredentialStateRequest.TYPE_CLEAR_RESTORE_CREDENTIAL),
        null,
        ContextCompat.getMainExecutor(context),
        new CredentialManagerCallback<Void, ClearCredentialException>() {
          @Override
          public void onResult(Void ignored) {
            call.resolve();
          }

          @Override
          public void onError(ClearCredentialException error) {
            call.reject(
                "Unable to clear the restore credential",
                "RESTORE_CREDENTIAL_CLEAR_FAILED",
                error);
          }
        });
  }

  private void createRestoreCredential(
      PluginCall call,
      String requestJson,
      boolean cloudBackupEnabled) {
    Context context = getContext();
    CredentialManager.create(context).createCredentialAsync(
        getActivity(),
        new CreateRestoreCredentialRequest(requestJson, cloudBackupEnabled),
        null,
        ContextCompat.getMainExecutor(context),
        new CredentialManagerCallback<CreateCredentialResponse, CreateCredentialException>() {
          @Override
          public void onResult(CreateCredentialResponse response) {
            if (!(response instanceof CreateRestoreCredentialResponse)) {
              call.reject(
                  "Restore credential provider returned an unexpected response",
                  "RESTORE_CREDENTIAL_UNEXPECTED_RESPONSE");
              return;
            }
            JSObject result = new JSObject();
            result.put(
                "registrationResponseJson",
                ((CreateRestoreCredentialResponse) response).getResponseJson());
            result.put("cloudBackupEnabled", cloudBackupEnabled);
            call.resolve(result);
          }

          @Override
          public void onError(CreateCredentialException error) {
            if (cloudBackupEnabled && error instanceof E2eeUnavailableException) {
              createRestoreCredential(call, requestJson, false);
              return;
            }
            call.reject(
                "Unable to create a restore credential",
                "RESTORE_CREDENTIAL_CREATE_FAILED",
                error);
          }
        });
  }
}
