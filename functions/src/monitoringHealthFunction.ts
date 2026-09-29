import * as admin from "firebase-admin";
import {timingSafeEqual} from "node:crypto";
import {defineSecret} from "firebase-functions/params";
import {onRequest, type Request} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

const healthcheckToken = defineSecret("BETTERSTACK_HEALTHCHECK_TOKEN");
const canaryDocument = admin.firestore().doc("monitoring/health");

const hasValidToken = (request: Request, expectedToken: string): boolean => {
  const receivedToken = Buffer.from(request.get("x-pkspot-health-token") ?? "");
  const configuredToken = Buffer.from(expectedToken);
  return configuredToken.length > 0 &&
    receivedToken.length === configuredToken.length &&
    timingSafeEqual(receivedToken, configuredToken);
};

/** Read-only external canary for Better Stack and Google Cloud uptime checks. */
export const monitoringHealth = onRequest(
  {
    cors: false,
    concurrency: 2,
    invoker: "public",
    maxInstances: 1,
    memory: "256MiB",
    secrets: [healthcheckToken],
    timeoutSeconds: 10,
  },
  async (request, response) => {
    response.set("Cache-Control", "no-store");

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.status(405).set("Allow", "GET, HEAD").send("Method Not Allowed");
      return;
    }

    if (!hasValidToken(request, healthcheckToken.value())) {
      response.status(401).send("Unauthorized");
      return;
    }

    try {
      const snapshot = await canaryDocument.get();
      if (snapshot.data()?.ok !== true) {
        logger.error("Monitoring canary document is missing or invalid.");
        response.status(503).json({ok: false});
        return;
      }

      response.status(200).json({ok: true});
    } catch (error) {
      logger.error("Monitoring canary Firestore read failed.", error);
      response.status(503).json({ok: false});
    }
  },
);
