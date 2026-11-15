import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getCloudflareBuildProfile,
  createWranglerConfig,
  createRendererWranglerConfig,
  createAssetHeaders,
} from "./cloudflare-build-profiles.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const action = process.argv[2] ?? "build";
const argumentsAfterAction = process.argv.slice(3);
const targetFlags = argumentsAfterAction.filter(argument => argument.startsWith("--target="));
if (targetFlags.length > 1) throw new Error("Specify only one Cloudflare target.");
const profile = getCloudflareBuildProfile(targetFlags[0]?.slice("--target=".length));
const wranglerArgs = argumentsAfterAction.filter(argument => !argument.startsWith("--target="));
const outputDir = path.join(repoRoot, profile.outputDirectory);

if (action === "build" && wranglerArgs.length) {
  throw new Error("Unexpected build arguments. Select --target=staging or --target=production.");
}

if (action === "build") {
  await buildWorkers();
} else if (action === "deploy") {
  // The renderer goes first: the front Worker's new version keys a fresh HTML
  // cache, and it stores only pages from a renderer of its own build.
  runWrangler(["deploy", ...wranglerArgs], getRendererConfigPath());
  runWrangler(["deploy", ...wranglerArgs], getWranglerConfigPath());
} else if (action === "dry-run") {
  runWrangler(["deploy", "--dry-run"], getRendererConfigPath());
  runWrangler(["deploy", "--dry-run"], getWranglerConfigPath());
} else if (action === "preview") {
  // One local session runs both Workers, so the service binding resolves.
  runWrangler(["dev", ...wranglerArgs], getWranglerConfigPath(), [getRendererConfigPath()]);
} else {
  throw new Error(`Unknown Cloudflare action: ${action}`);
}

async function buildWorkers() {
  // Shared by both Workers, so the front Worker can tell whether a page came
  // from a renderer of the same build.
  const buildId = randomUUID();
  const browserApiKey = readCloudflareFirebaseConfig().apiKey;
  rmSync(outputDir, { recursive: true, force: true });
  execFileSync(
    process.execPath,
    [
      "scripts/run-angular-build.mjs",
      `--configuration=${profile.configuration}`,
      "--localize",
      `--output-path=${path.relative(repoRoot, outputDir)}`,
    ],
    { cwd: repoRoot, env: process.env, stdio: "inherit" }
  );
  rewriteFirebaseMessagingServiceWorkers(browserApiKey);
  // Static assets can bypass the Worker, so their cache policy belongs here.
  writeFileSync(
    path.join(outputDir, "browser", "_headers"),
    createAssetHeaders(readFileSync(path.join(repoRoot, "src", "cloudflare-headers"), "utf8"), profile),
  );
  writeFileSync(
    path.join(outputDir, "server", "worker.mjs"),
    [
      'import { handleRenderRequest } from "./server.mjs";',
      `const BUILD_ID = ${JSON.stringify(buildId)};`,
      "export default {",
      "  async fetch(request) {",
      "    const response = await handleRenderRequest(request);",
      "    const headers = new Headers(response.headers);",
      '    headers.set("X-PKSpot-Build", BUILD_ID);',
      "    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });",
      "  },",
      "};",
      "",
    ].join("\n"),
  );
  await buildFrontWorker(buildId);
  writeWranglerConfigs();
}

/** Bundles the small front Worker on its own, without Angular. */
async function buildFrontWorker(buildId) {
  const { build } = await import("esbuild");
  const result = await build({
    stdin: {
      contents: [
        'import { createFrontWorker } from "./src/cloudflare-front-worker";',
        `export default createFrontWorker(${JSON.stringify(buildId)});`,
      ].join("\n"),
      resolveDir: repoRoot,
      sourcefile: "front-worker-entry.ts",
      loader: "ts",
    },
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    minify: true,
    outfile: path.join(outputDir, "front", "worker.mjs"),
    metafile: true,
    logLevel: "warning",
  });
  // Angular in this bundle would bring back the slow cold starts.
  const inputs = Object.keys(result.metafile.inputs);
  const forbidden = inputs.filter((input) => /node_modules\/@angular|node_modules\/firebase/u.test(input));
  if (forbidden.length > 0) {
    throw new Error(`The front Worker must not import Angular or Firebase: ${forbidden.join(", ")}`);
  }
}

function readCloudflareFirebaseConfig() {
  const configPath = path.join(repoRoot, profile.firebaseConfigPath);
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  if (typeof config.apiKey !== "string" || !config.apiKey.trim()) {
    throw new Error("Cloudflare Firebase config requires a public API key.");
  }
  return config;
}

function rewriteFirebaseMessagingServiceWorkers(apiKey) {
  const serviceWorkerName = "firebase-messaging-sw.js";
  const serviceWorkerPaths = findFiles(
    path.join(outputDir, "browser"),
    serviceWorkerName
  );

  if (serviceWorkerPaths.length === 0) {
    throw new Error(`Cloudflare build did not contain ${serviceWorkerName}.`);
  }

  for (const serviceWorkerPath of serviceWorkerPaths) {
    const source = readFileSync(serviceWorkerPath, "utf8");
    const apiKeyPattern = /apiKey:\s*"[^"]*"/gu;
    const matches = source.match(apiKeyPattern) ?? [];
    if (matches.length !== 1) {
      throw new Error(
        `Expected one Firebase API key in ${serviceWorkerPath}, found ${matches.length}.`
      );
    }

    writeFileSync(
      serviceWorkerPath,
      source.replace(apiKeyPattern, `apiKey: ${JSON.stringify(apiKey)}`)
    );
  }
}

function findFiles(directory, fileName) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findFiles(entryPath, fileName);
    return entry.isFile() && entry.name === fileName ? [entryPath] : [];
  });
}

function runWrangler(args, configPath, extraConfigPaths = []) {
  for (const required of [configPath, ...extraConfigPaths]) {
    if (!existsSync(required)) {
      throw new Error("Build the Cloudflare Workers before running Wrangler.");
    }
  }
  execFileSync(
    path.join(repoRoot, "node_modules", ".bin", "wrangler"),
    [...args, ...[configPath, ...extraConfigPaths].flatMap((config) => ["--config", config])],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        WRANGLER_LOG_PATH: path.join("/tmp", "pkspot-wrangler.log"),
      },
      stdio: "inherit",
    }
  );
}

function writeWranglerConfigs() {
  writeFileSync(getWranglerConfigPath(), `${JSON.stringify(createWranglerConfig(profile), null, 2)}\n`);
  writeFileSync(getRendererConfigPath(), `${JSON.stringify(createRendererWranglerConfig(profile), null, 2)}\n`);
}

/** The front Worker's config, at the path existing deploy commands use. */
function getWranglerConfigPath() {
  return path.join(outputDir, "wrangler.jsonc");
}

function getRendererConfigPath() {
  return path.join(outputDir, "wrangler.renderer.jsonc");
}
