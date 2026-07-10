import {
  Injectable,
  Injector,
  inject,
  runInInjectionContext,
} from "@angular/core";
import { FirebaseApp } from "@angular/fire/app";
import { Functions, httpsCallable } from "@angular/fire/functions";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { PlatformService } from "../platform.service";
import { getFirebaseEmulatorSettings } from "./firebase-emulator.config";

type CallableErrorResponse = {
  error?: {
    status?: string;
    message?: string;
  };
};

type CallableSuccessResponse = {
  result?: unknown;
  data?: unknown;
};

@Injectable({
  providedIn: "root",
})
export class FunctionsAdapterService {
  private readonly functions = inject(Functions, { optional: true });
  private readonly firebaseApp = inject(FirebaseApp);
  private readonly platformService = inject(PlatformService);
  private readonly injector = inject(Injector);

  async call<TRequest, TResponse>(
    functionName: string,
    payload: TRequest,
  ): Promise<TResponse> {
    if (this.platformService.isNative()) {
      return this.callNative<TRequest, TResponse>(functionName, payload);
    }

    const functions = this.functions;
    if (!functions) {
      throw new Error("Functions are unavailable in this environment.");
    }

    return runInInjectionContext(this.injector, async () => {
      const callable = httpsCallable<TRequest, TResponse>(
        functions,
        functionName,
      );
      const result = await callable(payload);
      return result.data;
    });
  }

  private async callNative<TRequest, TResponse>(
    functionName: string,
    payload: TRequest,
  ): Promise<TResponse> {
    const { token } = await FirebaseAuthentication.getIdToken();
    if (!token) {
      throw new Error("Native Firebase auth did not return an ID token");
    }

    const response = await fetch(this.getCallableUrl(functionName), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data: payload }),
    });

    if (!response.ok) {
      throw new Error(await this.readCallableError(functionName, response));
    }

    const body = (await response.json()) as CallableSuccessResponse;
    return (body.result ?? body.data) as TResponse;
  }

  private getCallableUrl(functionName: string): string {
    const emulatorSettings = getFirebaseEmulatorSettings();
    const projectId = this.firebaseApp.options.projectId;
    if (!projectId) {
      throw new Error("Firebase projectId is required to call Cloud Functions");
    }

    if (emulatorSettings) {
      return `http://${emulatorSettings.functions.host}:${emulatorSettings.functions.port}/${projectId}/europe-west1/${functionName}`;
    }

    return `https://europe-west1-${projectId}.cloudfunctions.net/${functionName}`;
  }

  private async readCallableError(
    functionName: string,
    response: Response,
  ): Promise<string> {
    const fallback = `${functionName} failed with HTTP ${response.status}`;
    try {
      const body = (await response.json()) as CallableErrorResponse;
      const message = body.error?.message;
      const status = body.error?.status;
      if (message && status) {
        return `${functionName} failed: ${status} - ${message}`;
      }
      return message ? `${functionName} failed: ${message}` : fallback;
    } catch {
      return fallback;
    }
  }
}
