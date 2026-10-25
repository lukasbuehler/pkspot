// v1 records predate subject binding and approved-method checks. They must not
// unlock additional consumers when the reviewed integration is enabled.
export const ONEID_APPROVAL_BASIS = "oneid:provider_threshold:server_to_server_oidc:v3";
export const ONEID_PRODUCTS = ["age_check", "age_verification", "age_assure"] as const;
export type OneIdProduct = typeof ONEID_PRODUCTS[number];
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function hasApprovedOneIdAdultPolicy(value: unknown): boolean {
  const policy = record(value), assurance = record(policy["assurance"]), method = record(assurance["method"]);
  const lower = record(policy["age_range"])["lower"];
  return policy["source"] === "oneid_age_check" && policy["adult_eligibility"] === "verified" &&
    typeof lower === "number" && Number.isFinite(lower) && lower >= 18 && assurance["status"] === "active" &&
    assurance["client_integrity"] === "server_to_server_oidc" && method["provider"] === "oneid" && (
      (assurance["approval_basis"] === ONEID_APPROVAL_BASIS && method["category"] === "external_verification" &&
        ONEID_PRODUCTS.some(product => product === method["provider_method"])) ||
      (assurance["approval_basis"] === "oneid:financial_attribute:age_check:server_to_server_oidc:v2" &&
        method["category"] === "financial_attribute" && method["provider_method"] === "age_check")
    );
}

