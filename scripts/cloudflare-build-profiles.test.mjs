import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getCloudflareBuildProfile, createWranglerConfig, createAssetHeaders } from "./cloudflare-build-profiles.mjs";

const staging = getCloudflareBuildProfile();
const production = getCloudflareBuildProfile("production");

test("existing commands continue building the staging Worker", () => {
  assert.equal(staging.workerName, "pkspot-web");
  assert.equal(staging.outputDirectory, "dist/pkspot-cloudflare-worker");
  assert.equal(staging.configuration, "cloudflare");
  const config = createWranglerConfig(staging);
  assert.equal(config.workers_dev, true);
  assert.equal(config.preview_urls, true);
});

test("production uses a distinct Worker, output, browser key and Angular environment", () => {
  assert.notEqual(production.workerName, staging.workerName);
  assert.notEqual(production.outputDirectory, staging.outputDirectory);
  const key = profile => JSON.parse(readFileSync(profile.firebaseConfigPath, "utf8")).apiKey;
  assert.notEqual(key(production), key(staging));
  const configs = JSON.parse(readFileSync("angular.json", "utf8")).projects.pkspot.architect.build.configurations;
  const replacements = production.configuration.split(",").flatMap(name => configs[name].fileReplacements ?? []);
  assert.equal(replacements.at(-1).with, "src/environments/environment.production.ts");
  assert.equal(configs.cloudflare.ssr.platform, "neutral");
  assert.match(readFileSync("src/environments/environment.production.ts", "utf8"), /from "\.\/firebase\.production\.json"/);
});

test("building and deploying production cannot attach a domain or expose production preview analytics", () => {
  const config = createWranglerConfig(production);
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal(config.routes, undefined);
  assert.equal(config.vars, undefined);
  assert.deepEqual(config.assets, { binding: "ASSETS", directory: "browser" });
});

test("both Workers upload Angular's server modules unbundled so cold starts load only the entry", () => {
  for (const profile of [staging, production]) {
    const config = createWranglerConfig(profile);
    assert.equal(config.main, "server/worker.mjs");
    assert.equal(config.no_bundle, true);
    assert.deepEqual(config.rules, [{ type: "ESModule", globs: ["**/*.mjs"] }]);
  }
});

test("both Workers expose the deployment id that keys cached SSR HTML", () => {
  for (const profile of [staging, production]) {
    assert.deepEqual(createWranglerConfig(profile).version_metadata, { binding: "CF_VERSION_METADATA" });
  }
});

test("only staging assets get noindex while immutable cache rules remain intact", () => {
  const base = readFileSync("src/cloudflare-headers", "utf8");
  assert.match(createAssetHeaders(base, staging), /X-Robots-Tag: noindex, nofollow, noarchive/);
  assert.match(createAssetHeaders(base, staging), /max-age=31536000, immutable/);
  assert.equal(createAssetHeaders(base, production), base);
  assert.doesNotMatch(createAssetHeaders(base, production), /noindex/);
});

test("unknown targets fail instead of accidentally selecting production", () => {
  assert.throws(() => getCloudflareBuildProfile("prodution"), /Unknown Cloudflare target/);
});
