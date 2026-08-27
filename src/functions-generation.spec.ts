import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const functionsRoot = resolve(repoRoot, "functions");
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
  it("does not use deprecated Cloud Runtime Config", () => {
    const sourceFiles = listTypeScriptFiles(functionsSourceRoot).map((path) => ({
      path: relative(repoRoot, path),
      source: readFileSync(path, "utf8"),
    }));
    const runtimeConfigUsers = sourceFiles
      .filter(
        ({ source }) =>
          /\bfunctions\.config\s*\(/u.test(source) ||
          /\bconfig\s*\(\s*\)/u.test(source),
      )
      .map(({ path }) => path);
    const combinedSource = sourceFiles.map(({ source }) => source).join("\n");

    expect(runtimeConfigUsers).toEqual([]);
    expect(combinedSource).toContain('defineSecret("DISCORD_WEBHOOK_URL")');
  });

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

  it("keeps collection-group spot edit feeds admin-only", () => {
    const rulesSource = readFileSync(resolve(repoRoot, "firestore.rules"), "utf8");

    expect(rulesSource).toMatch(
      /match\s+\/\{path=\*\*\}\/edits\/\{editId\}\s*\{\s*allow read: if isAdmin\(\);/u
    );
  });

  it("keeps organization member rosters private to that organization", () => {
    const rulesSource = readFileSync(resolve(repoRoot, "firestore.rules"), "utf8");

    expect(rulesSource).toMatch(
      /match\s+\/members\/\{userId\}\s*\{\s*allow read: if request\.auth\.uid != null\s*&& \(request\.auth\.uid == userId \|\| isAdmin\(\) \|\| isOrganizationReviewer\(organizationId\)\);/u,
    );
  });

  it("keeps organization review callables publicly invokable for browser preflight", () => {
    const spotEditSource = readFileSync(
      resolve(functionsSourceRoot, "spotEditFunctions.ts"),
      "utf8"
    );

    expect(spotEditSource).toContain("const CALLABLE_CORS_OPTIONS");
    expect(spotEditSource).toContain("cors: true");
    expect(spotEditSource).toContain('invoker: "public"');
  });

  it("requires App Check for weather requests", () => {
    const weatherSource = readFileSync(
      resolve(functionsSourceRoot, "weatherFunctions.ts"),
      "utf8"
    );

    expect(weatherSource).toMatch(
      /export const getWeather = onCall\(\s*\{ enforceAppCheck: true,/u
    );
  });

  it("gives full community rebuilds a bounded maintenance window and terminal states", () => {
    const communitySource = readFileSync(
      resolve(functionsSourceRoot, "communityFunctions.ts"),
      "utf8"
    );

    expect(communitySource).toMatch(
      /export const rebuildAllCommunityPages = onDocumentCreated\(\s*\{ document: MANUAL_REBUILD_DOC, timeoutSeconds: 540 \}/u
    );
    expect(communitySource).toContain('status: "RUNNING"');
    expect(communitySource).toContain('status: "DONE"');
    expect(communitySource).toContain('status: "FAILED"');
  });

  it("binds age policy to Play Integrity in App Check protected callables", () => {
    const indexSource = readFileSync(
      resolve(functionsSourceRoot, "index.ts"),
      "utf8"
    );
    const userSource = readFileSync(
      resolve(functionsSourceRoot, "userFunctions.ts"),
      "utf8"
    );
    const assuranceSource = readFileSync(
      resolve(functionsSourceRoot, "ageAssuranceFunctions.ts"),
      "utf8"
    );

    expect(indexSource).toContain("updateAgePolicyV2");
    expect(indexSource).toContain("beginAgeAssuranceV3");
    expect(indexSource).toContain("updateAgePolicyV3");
    expect(indexSource).toContain("invalidateAgeAssuranceApprovals");
    expect(indexSource).toContain("cleanupAgeAssuranceChallenges");
    expect(userSource).toMatch(
      /export const updateAgePolicyV2 = onCall\(\s*\{ enforceAppCheck: true \}/u
    );
    expect(userSource).toContain("cryptographicallyBound: false");
    expect(userSource).toContain(
      'profileAccessFieldsForPrivacy("private", false)',
    );
    expect(assuranceSource).toContain("enforceAppCheck: true");
    expect(assuranceSource).toContain("decodeAndVerifyPlayIntegrityToken");
    expect(assuranceSource).toContain("cryptographicallyBound: true");
    expect(assuranceSource).toContain(
      'profileAccessFieldsForPrivacy("private", false)',
    );
  });

  it("requires App Check for cached OpenStreetMap amenity requests", () => {
    const source = readFileSync(
      resolve(functionsSourceRoot, "osmAmenityFunctions.ts"),
      "utf8"
    );
    const indexSource = readFileSync(
      resolve(functionsSourceRoot, "index.ts"),
      "utf8"
    );

    expect(source).toMatch(
      /export const getOsmAmenityTile = onCall\(\s*\{\s*enforceAppCheck: true,/u
    );
    expect(source).toContain("OSM_AMENITY_CACHE_COLLECTION");
    expect(source).toContain("OVERPASS_ENDPOINTS");
    expect(source).toContain('"User-Agent": "PKSpot/1.0');
    expect(indexSource).toContain("getOsmAmenityTile");
    expect(indexSource).toContain("cleanupExpiredOsmAmenityCache");
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

  it("exports the viewer-specific profile boundary and projection maintenance", () => {
    const indexSource = readFileSync(
      resolve(functionsSourceRoot, "index.ts"),
      "utf8"
    );
    const source = readFileSync(
      resolve(functionsSourceRoot, "userProfileFunctions.ts"),
      "utf8"
    );

    expect(indexSource).toContain("getUserProfile");
    expect(indexSource).toContain("syncPublicUserProfileOnWrite");
    expect(indexSource).toContain("backfillPublicUserProfiles");
    expect(indexSource).toContain("activateUserProfilePrivacyCutover");
    expect(source).toContain('invoker: "public"');
    expect(source).toContain("cors: true");
    expect(source).toContain('onDocumentWritten(\n  "users/{userId}"');
    expect(source).toContain(
      '"restrict-legacy-user-profile-reads"'
    );
  });

  it("keeps media moderation functions exported as gen 2 triggers", () => {
    const indexSource = readFileSync(
      resolve(functionsSourceRoot, "index.ts"),
      "utf8"
    );
    const source = readFileSync(
      resolve(functionsSourceRoot, "mediaModerationFunctions.ts"),
      "utf8"
    );

    expect(indexSource).toContain("processMediaIntakeUpload");
    expect(indexSource).toContain("markMediaUploadSafe");
    expect(indexSource).toContain("reconcilePublishedMediaReviews");
    expect(indexSource).toContain("runMediaIntakeBackfill");
    expect(indexSource).toContain("runMediaModerationAudit");
    expect(source).toContain("firebase-functions/v2/storage");
    expect(source).toContain("firebase-functions/v2/firestore");
    expect(source).toContain("onObjectFinalized");
    expect(source).toContain("onDocumentCreated");
    expect(source).toContain("onCall");
    expect(source).toContain("secrets: mediaModerationSecrets");
    expect(source).toContain("bucket: DEFAULT_STORAGE_BUCKET");
    expect(source).toContain('"organization_media/"');
  });

  it("creates standard image derivatives for organization logos", () => {
    const source = readFileSync(
      resolve(functionsSourceRoot, "imageProcessingFunctions.ts"),
      "utf8",
    );

    expect(source).toContain('"organization_media/"');
    expect(source).toContain("DEFAULT_IMAGE_SIZES = [200, 400, 800]");
  });

  it("initializes Firebase Admin before media moderation functions are loaded", () => {
    const indexSource = readFileSync(
      resolve(functionsSourceRoot, "index.ts"),
      "utf8"
    );
    const source = readFileSync(
      resolve(functionsSourceRoot, "mediaModerationFunctions.ts"),
      "utf8"
    );

    expect(indexSource.indexOf("admin.initializeApp();")).toBeGreaterThanOrEqual(
      0
    );
    expect(indexSource.indexOf("admin.initializeApp();")).toBeLessThan(
      indexSource.indexOf('from "./mediaModerationFunctions"')
    );
    expect(source).not.toContain("admin.initializeApp");
    expect(source).not.toContain("credential.cert");
    expect(source).not.toContain("process.env.GCE_METADATA_HOST =");
    expect(source).not.toContain("process.env.GCE_METADATA_HOST ??=");
  });

  it("keeps Storage metadata auth on a gaxios version with compatible headers", () => {
    const functionsPackage = JSON.parse(
      readFileSync(resolve(functionsRoot, "package.json"), "utf8")
    ) as { overrides?: Record<string, unknown> };
    const functionsLock = JSON.parse(
      readFileSync(resolve(functionsRoot, "package-lock.json"), "utf8")
    ) as {
      packages?: Record<
        string,
        {
          version?: string;
          dependencies?: Record<string, string>;
        }
      >;
    };
    const packages = functionsLock.packages ?? {};

    expect(functionsPackage.overrides?.["gaxios"]).toEqual({
      uuid: "^11.1.1",
    });
    expect(
      packages["node_modules/@google-cloud/storage/node_modules/gcp-metadata"]
        ?.version
    ).toBe("6.1.1");
    expect(
      packages["node_modules/@google-cloud/storage/node_modules/gaxios"]?.version
    ).toMatch(/^6\./u);
    expect(packages["node_modules/gaxios"]?.version).toMatch(/^7\./u);
  });
});
