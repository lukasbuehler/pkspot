import {
  Injectable,
  Injector,
  inject,
  runInInjectionContext,
} from "@angular/core";
import { FirebaseApp } from "@angular/fire/app";
import { Functions, httpsCallable } from "@angular/fire/functions";
import { getAuth, getIdToken } from "@angular/fire/auth";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { environment } from "../../../environments/environment.default";
import { PlatformService } from "../platform.service";
import { FirebaseAppCheckService } from "./app-check.service";
import { getFirebaseEmulatorSettings } from "./firebase-emulator.config";

const SAME_ORIGIN_PUBLIC_CALLABLES = new Set(["getPublicImportProvenance"]);

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
  private readonly appCheckService = inject(FirebaseAppCheckService);
  private readonly injector = inject(Injector);

  async call<TRequest, TResponse>(
    functionName: string,
    payload: TRequest,
  ): Promise<TResponse> {
    if (this.platformService.isNative()) {
      return this.callNative<TRequest, TResponse>(functionName, payload, true);
    }

    return this.callWeb<TRequest, TResponse>(functionName, payload);
  }

  async callPublic<TRequest, TResponse>(
    functionName: string,
    payload: TRequest,
  ): Promise<TResponse> {
    if (this.platformService.isNative()) {
      return this.callNative<TRequest, TResponse>(
        functionName,
        payload,
        false,
        true,
      );
    }

    if (
      environment.production &&
      typeof window !== "undefined" &&
      SAME_ORIGIN_PUBLIC_CALLABLES.has(functionName)
    ) {
      return this.callSameOriginPublic<TRequest, TResponse>(
        functionName,
        payload,
      );
    }

    return this.callWeb<TRequest, TResponse>(functionName, payload);
  }

  async callAppChecked<TRequest, TResponse>(
    functionName: string,
    payload: TRequest,
  ): Promise<TResponse> {
    const appCheckToken = await this.appCheckService.getTokenForRequest();
    return this.callDirect<TRequest, TResponse>(functionName, payload, {
      "X-Firebase-AppCheck": appCheckToken,
    });
  }

  async callAuthenticatedAppChecked<TRequest, TResponse>(
    functionName: string,
    payload: TRequest,
  ): Promise<TResponse> {
    const [appCheckToken, authToken] = await Promise.all([
      this.appCheckService.getTokenForRequest(),
      this.getAuthenticationToken(),
    ]);
    if (!authToken) {
      throw new Error("An authenticated Firebase user is required");
    }

    return this.callDirect<TRequest, TResponse>(functionName, payload, {
      Authorization: `Bearer ${authToken}`,
      "X-Firebase-AppCheck": appCheckToken,
    });
  }

  private async callSameOriginPublic<TRequest, TResponse>(
    functionName: string,
    payload: TRequest,
  ): Promise<TResponse> {
    const response = await fetch(`/api/functions/${functionName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: payload }),
    });

    if (!response.ok) {
      throw new Error(await this.readCallableError(functionName, response));
    }

    const body = (await response.json()) as CallableSuccessResponse;
    return (body.result ?? body.data) as TResponse;
  }

  private async callWeb<TRequest, TResponse>(
    functionName: string,
    payload: TRequest,
  ): Promise<TResponse> {
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
    requiresAuthentication: boolean,
    includeOptionalAppCheck: boolean = false,
  ): Promise<TResponse> {
    const { token } = await FirebaseAuthentication.getIdToken();
    if (!token && requiresAuthentication) {
      throw new Error("Native Firebase auth did not return an ID token");
    }

    let appCheckToken: string | undefined;
    if (includeOptionalAppCheck) {
      try {
        appCheckToken = await this.appCheckService.getTokenForRequest();
      } catch {
        // Public callables stay available when attestation is unavailable.
      }
    }

    return this.callDirect<TRequest, TResponse>(
      functionName,
      payload,
      {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(appCheckToken
          ? { "X-Firebase-AppCheck": appCheckToken }
          : {}),
      },
    );
  }

  private async getAuthenticationToken(): Promise<string | undefined> {
    if (this.platformService.isNative()) {
      return (await FirebaseAuthentication.getIdToken()).token;
    }

    const user = getAuth(this.firebaseApp).currentUser;
    return user ? getIdToken(user) : undefined;
  }

  private async callDirect<TRequest, TResponse>(
    functionName: string,
    payload: TRequest,
    headers: Record<string, string>,
  ): Promise<TResponse> {
    const response = await fetch(this.getCallableUrl(functionName), {
      method: "POST",
      headers: {
        ...headers,
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
