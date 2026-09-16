import {getAppCheck} from "firebase-admin/app-check";
import {defineSecret} from "firebase-functions/params";
import {onRequest} from "firebase-functions/v2/https";
import {
  isAuthorizedCloudflareSsrTokenRequest,
} from "./cloudflareSsrAppCheckPolicy";

const brokerSecret = defineSecret("CLOUDFLARE_SSR_TOKEN_BROKER_SECRET");
const cloudflareSsrAppId = defineSecret("CLOUDFLARE_SSR_FIREBASE_APP_ID");

/** Exchanges the Worker secret for a short-lived SSR App Check token. */
export const mintCloudflareSsrAppCheckToken = onRequest(
  {
    cors: false,
    invoker: "public",
    maxInstances: 2,
    secrets: [brokerSecret, cloudflareSsrAppId],
    timeoutSeconds: 10,
  },
  async (request, response) => {
    response.set("Cache-Control", "no-store");
    if (request.method !== "POST") {
      response.status(405).set("Allow", "POST").send("Method Not Allowed");
      return;
    }

    const appId = request.body?.appId as unknown;
    if (
      !isAuthorizedCloudflareSsrTokenRequest(
        request.get("authorization"),
        brokerSecret.value(),
        appId,
        cloudflareSsrAppId.value(),
      )
    ) {
      response.status(401).send("Unauthorized");
      return;
    }

    const result = await getAppCheck().createToken(appId as string);
    response.status(200).json({
      token: result.token,
      expireTimeMillis: Date.now() + result.ttlMillis,
    });
  },
);
