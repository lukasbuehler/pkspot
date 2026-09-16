import {HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

const codes = new Set(["unauthenticated", "permission-denied", "resource-exhausted", "failed-precondition", "invalid-argument", "unavailable", "deadline-exceeded", "already-exists", "not-found"]);
/** Never log raw errors: provider errors can contain codes, tokens or identity data. */
export function externalVerificationLog(stage: string, outcome: "started" | "succeeded" | "failed" | "cancelled" | "expired", error?: unknown): void {
  const value = error && typeof error === "object" ? error as {code?: unknown; name?: unknown} : {};
  const code = typeof value.code === "string" && codes.has(value.code) ? value.code :
    value.name === "TimeoutError" || value.name === "AbortError" ? "deadline-exceeded" : "unknown";
  const fields = {feature: "external_age_verification", provider: "oneid", stage, outcome,
    ...(outcome === "failed" ? {error_code: code} : {})};
  if (outcome === "failed") logger.error("External age verification", fields);
  else logger.info("External age verification", fields);
}

export async function externalVerificationStep<T>(stage: string, operation: () => Promise<T>): Promise<T> {
  externalVerificationLog(stage, "started");
  try {
    const result = await operation();
    externalVerificationLog(stage, "succeeded");
    return result;
  } catch (error) {
    externalVerificationLog(stage, "failed", error);
    // Callable infrastructure may log uncaught errors. Do not let raw transport
    // or provider exceptions cross that boundary either.
    if (error instanceof HttpsError) throw error;
    const name = error && typeof error === "object" && "name" in error ? error.name : "";
    throw new HttpsError(name === "TimeoutError" || name === "AbortError" ? "deadline-exceeded" : "unavailable",
      "Verification could not be completed. Please try again.");
  }
}
