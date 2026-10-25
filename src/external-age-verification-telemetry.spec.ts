import {describe, expect, it, vi} from "vitest";
vi.mock("../functions/node_modules/firebase-functions/lib/logger/index.js", () => ({info: vi.fn(), error: vi.fn()}));
import * as logger from "../functions/node_modules/firebase-functions/lib/logger/index.js";
import {externalVerificationStep} from "../functions/src/externalAgeVerificationTelemetry";

describe("external verification diagnostics", () => {
  it("logs stages and safe timeout categories without raw identity or token data", async () => {
    const secret = "private-token-or-identity";
    const error = Object.assign(new Error(secret), {name: "TimeoutError", code: secret});
    await expect(externalVerificationStep("token_exchange", async () => {throw error;})).rejects.toMatchObject({code: "deadline-exceeded", message: "Verification could not be completed. Please try again."});
    expect(logger.error).toHaveBeenCalledWith("External age verification", expect.objectContaining({stage: "token_exchange", outcome: "failed", error_code: "deadline-exceeded"}));
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain(secret);
  });
});
