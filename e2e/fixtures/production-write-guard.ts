import type { Page, Request } from "@playwright/test";

/**
 * Screenshot and review builds talk to the production Firebase project so
 * they can show real Spots. Reads are fine; anything that changes data or
 * contacts people is not: a scripted or agent-driven click on "Report",
 * "Send", "Sign up" or "Reset password" would otherwise reach real moderators,
 * support and inboxes.
 *
 * `guardProductionWrites` lets reads through and aborts every request that
 * could write, as if the network had failed. Fixtures that mock a write
 * register their own routes after this one; Playwright runs the most recently
 * registered matching route first, so their mocks still answer.
 */

/** Callables that only read public data and are needed to render pages. */
const READ_ONLY_CALLABLES = new Set([
  "getOsmAmenityTile",
  "getPublicImportProvenance",
]);

/** Firestore REST and SDK channel endpoints that only read. */
const FIRESTORE_READ_PATH =
  /:(?:runQuery|runAggregationQuery|batchGet|listCollectionIds|listen)(?:$|\?)|\.Firestore\/Listen\/channel$/u;

export interface BlockedProductionRequest {
  method: string;
  url: string;
}

export function productionWriteBlockReason(request: Pick<Request, "method" | "url">): string | null {
  const method = request.method().toUpperCase();
  const url = new URL(request.url());
  const host = url.hostname;
  const reading = method === "GET" || method === "HEAD" || method === "OPTIONS";

  if (host.endsWith(".cloudfunctions.net") || host.endsWith(".run.app")) {
    if (method === "OPTIONS") return null;
    const functionName = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
    return READ_ONLY_CALLABLES.has(functionName) ? null : `callable ${functionName}`;
  }

  if (url.pathname.startsWith("/api/functions/")) {
    const functionName = url.pathname.slice("/api/functions/".length);
    return reading || READ_ONLY_CALLABLES.has(functionName) ? null : `callable ${functionName}`;
  }

  if (host === "firestore.googleapis.com") {
    if (reading || FIRESTORE_READ_PATH.test(url.pathname)) return null;
    return "firestore write";
  }

  if (host === "firebasestorage.googleapis.com" || host === "storage.googleapis.com") {
    return reading ? null : "storage write";
  }

  // Sign-in, sign-up, password reset and e-mail verification all go through
  // these. The review fixtures fake the signed-in state instead.
  if (
    host === "identitytoolkit.googleapis.com" ||
    host === "securetoken.googleapis.com" ||
    host === "fcmregistrations.googleapis.com"
  ) {
    return "auth or push registration";
  }

  return null;
}

/**
 * Aborts production writes for this page and returns the list it fills with
 * what was blocked, so a session log can show it.
 */
export async function guardProductionWrites(page: Page): Promise<BlockedProductionRequest[]> {
  const blocked: BlockedProductionRequest[] = [];
  await page.route(
    (url) => url.protocol === "https:" || url.pathname.startsWith("/api/functions/"),
    async (route) => {
      const request = route.request();
      if (productionWriteBlockReason(request)) {
        if (blocked.length < 200) {
          blocked.push({ method: request.method(), url: request.url().slice(0, 200) });
        }
        await route.abort("blockedbyclient");
        return;
      }
      await route.fallback();
    },
  );
  return blocked;
}
