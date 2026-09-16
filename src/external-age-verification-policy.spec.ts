import { describe, expect, it } from "vitest";
import { ONEID_APPROVAL_BASIS, hasApprovedOneIdAdultPolicy, shouldApplyOneIdPolicy, validateOneIdThresholdResult } from "../functions/src/externalAgeVerificationPolicy";
import { hasVerifiedAdultEligibility } from "../functions/src/userProfileProjection";
import { sessionAdult } from "../functions/src/plannedSessionPolicy";
import type { UserAgePolicySchema, UserSchema } from "./db/schemas/UserSchema";
const policy: UserAgePolicySchema = {
  source: "oneid_age_check", adult_eligibility: "verified", age_range: { lower: 18 },
  assurance: { status: "active", client_integrity: "server_to_server_oidc", approval_basis: ONEID_APPROVAL_BASIS,
    method: { provider: "oneid", category: "financial_attribute", provider_method: "age_check" } },
};
describe("OneID trust boundary", () => {
  it.each([true, false])("accepts only a matching signed-token subject (%s)", result => {
    expect(validateOneIdThresholdResult({sub: "subject", nonce: "nonce"}, {sub: "subject", age_over_18: result}, "nonce")).toBe(result);
  });
  it.each([
    [{sub: "a", nonce: "n"}, {sub: "b", age_over_18: true}],
    [{sub: "", nonce: "n"}, {sub: "", age_over_18: true}],
    [{sub: "a", nonce: "wrong"}, {sub: "a", age_over_18: true}],
    [{sub: "a", nonce: "n"}, {sub: "a", age_over_18: "true"}],
  ])("rejects mismatched or malformed claims", (claims, result) => {
    expect(() => validateOneIdThresholdResult(claims, result, "n")).toThrow();
  });
  it("accepts reviewed external evidence consistently in profile and session consumers", () => {
    expect(hasApprovedOneIdAdultPolicy(policy)).toBe(true);
    expect(hasVerifiedAdultEligibility({age_policy: policy})).toBe(true);
    expect(sessionAdult({age_policy: policy} as UserSchema)).toBe(true);
    const old = {...policy, assurance: {...policy.assurance, approval_basis: "oneid:financial_attribute:age_check:server_to_server_oidc:v1"}};
    expect(hasApprovedOneIdAdultPolicy(old)).toBe(false);
    expect(hasVerifiedAdultEligibility({age_policy: old})).toBe(false);
    expect(sessionAdult({age_policy: old} as UserSchema)).toBe(false);
  });
  it("does not replace valid independent native evidence on either outcome", () => {
    const native: UserAgePolicySchema = {...policy, source: "ios_declared_age_range", assurance: {...policy.assurance, client_integrity: "apple_app_attest_request_bound"}};
    expect(shouldApplyOneIdPolicy(native, false)).toBe(false);
    expect(shouldApplyOneIdPolicy(native, true)).toBe(false);
  });
  it("leaves unrelated restrictions unchanged on an inconclusive result", () => {
    expect(shouldApplyOneIdPolicy({participation_state: "read_only_age_restricted"}, false)).toBe(false);
    expect(shouldApplyOneIdPolicy(undefined, false)).toBe(false);
  });
  it("can withdraw its own superseded evidence without changing other providers", () => {
    expect(shouldApplyOneIdPolicy(policy, false)).toBe(true);
  });
});
