import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const functionsSourceRoot = resolve(repoRoot, "functions/src");
const allowedV1Files = new Set(["functions/src/authFunctions.ts"]);

function listTypeScriptFiles(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((entry) => {
      const path = resolve(dir, entry);
      return statSync(path).isDirectory() ? listTypeScriptFiles(path) : [path];
    })
    .filter((path) => path.endsWith(".ts"));
}

describe("Cloud Functions generation policy", () => {
  it("uses gen 2 functions outside the explicit Auth delete exception", () => {
    const v1Imports = listTypeScriptFiles(functionsSourceRoot)
      .map((path) => ({
        path,
        source: readFileSync(path, "utf8"),
      }))
      .filter(({ source }) => source.includes("firebase-functions/v1"))
      .map(({ path }) => relative(repoRoot, path));

    expect(v1Imports).toEqual([...allowedV1Files]);

    const authSource = readFileSync(
      resolve(functionsSourceRoot, "authFunctions.ts"),
      "utf8"
    );
    expect(authSource).toContain(".onDelete(");
    expect(authSource).not.toContain(".onCreate(");
  });

  it("exports the organization verification snapshot sync function", () => {
    const indexSource = readFileSync(
      resolve(functionsSourceRoot, "index.ts"),
      "utf8"
    );
    const organizationSource = readFileSync(
      resolve(functionsSourceRoot, "organizationFunctions.ts"),
      "utf8"
    );
    const spotEditSource = readFileSync(
      resolve(functionsSourceRoot, "spotEditFunctions.ts"),
      "utf8"
    );

    expect(indexSource).toContain("syncVerifiedSpotOrganizationSnapshots");
    expect(indexSource).toContain("setSpotOrganizationRelationship");
    expect(organizationSource).toContain("onDocumentUpdated");
    expect(organizationSource).toContain("verified_spots");
    expect(organizationSource).toContain("managed_spots");
    expect(organizationSource).toContain("stewardship.organization_ids");
    expect(organizationSource).toContain("management.organization_id");
    expect(spotEditSource).toContain("used_spots");
  });

  it("does not keep legacy spot verification fallbacks in org review routing", () => {
    const indexSource = readFileSync(
      resolve(functionsSourceRoot, "index.ts"),
      "utf8"
    );
    const spotEditSource = readFileSync(
      resolve(functionsSourceRoot, "spotEditFunctions.ts"),
      "utf8"
    );
    const rulesSource = readFileSync(resolve(repoRoot, "firestore.rules"), "utf8");

    expect(indexSource).not.toContain("setSpotVerification");
    expect(spotEditSource).not.toContain("legacyVerification");
    expect(spotEditSource).not.toContain("spotData.verification");
    expect(rulesSource).not.toContain("spot.verification.status");
  });

  it("keeps signup number assignment on a gen 2 profile trigger", () => {
    const source = readFileSync(
      resolve(functionsSourceRoot, "userSignupFunctions.ts"),
      "utf8"
    );

    expect(source).toContain("firebase-functions/v2/firestore");
    expect(source).toContain("onDocumentCreated");
    expect(source).not.toContain("functions.auth");
    expect(source).not.toContain("firebase-functions/v1");
  });
});
