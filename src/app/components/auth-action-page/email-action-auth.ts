import { getApps, initializeApp } from "firebase/app";
import { Auth, getAuth } from "firebase/auth";

const ACTION_APP_PREFIX = "pkspot-email-action";

export interface EmailActionAuth {
  auth: Auth;
  apiKeySource: "app" | "link";
}

export function resolveEmailActionAuth(
  primaryAuth: Auth,
  rawLinkApiKey: unknown,
): EmailActionAuth {
  const linkApiKey =
    typeof rawLinkApiKey === "string" ? rawLinkApiKey.trim() : "";
  if (!linkApiKey || linkApiKey === primaryAuth.app.options.apiKey) {
    return { auth: primaryAuth, apiKeySource: "app" };
  }

  const apps = getApps();
  const existing = apps.find(
    (app) =>
      app.options.projectId === primaryAuth.app.options.projectId &&
      app.options.apiKey === linkApiKey,
  );
  const app =
    existing ??
    initializeApp(
      { ...primaryAuth.app.options, apiKey: linkApiKey },
      `${ACTION_APP_PREFIX}-${apps.length}`,
    );

  return { auth: getAuth(app), apiKeySource: "link" };
}
