import { execFileSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const action = process.argv[2] ?? "build";
const wranglerArgs = process.argv.slice(3);
const outputDir = path.join(repoRoot, "dist", "pkspot-cloudflare-worker");

if (action === "build") {
  buildWorker();
} else if (action === "dry-run") {
  runWrangler(["deploy", "--dry-run"]);
} else if (action === "preview") {
  runWrangler(["dev", ...wranglerArgs]);
} else {
  throw new Error(`Unknown Cloudflare action: ${action}`);
}

function buildWorker() {
  const browserApiKey = readCloudflareFirebaseConfig().apiKey;
  rmSync(outputDir, { recursive: true, force: true });
  execFileSync(
    process.execPath,
    [
      "scripts/run-angular-build.mjs",
      "--configuration=cloudflare",
      "--localize",
      `--output-path=${path.relative(repoRoot, outputDir)}`,
    ],
    { cwd: repoRoot, env: process.env, stdio: "inherit" }
  );
  rewriteFirebaseMessagingServiceWorkers(browserApiKey);
  writeFileSync(
    path.join(outputDir, "worker.mjs"),
    [
      'import { handleWorkerRequest } from "./server/server.mjs";',
      "export default { fetch: handleWorkerRequest };",
      "",
    ].join("\n"),
  );
  writeWranglerConfig();
}

function readCloudflareFirebaseConfig() {
  const configPath = path.join(
    repoRoot,
    "src",
    "environments",
    "firebase.staging.json"
  );
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

function runWrangler(args) {
  const configPath = getWranglerConfigPath();
  if (!existsSync(configPath)) {
    throw new Error("Build the combined Cloudflare Worker before running Wrangler.");
  }
  execFileSync(
    path.join(repoRoot, "node_modules", ".bin", "wrangler"),
    [...args, "--config", configPath],
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

function writeWranglerConfig() {
  const configPath = getWranglerConfigPath();
  writeFileSync(
    configPath,
    `${JSON.stringify(
      {
        $schema: "../../node_modules/wrangler/config-schema.json",
        name: "pkspot-web",
        main: "worker.mjs",
        compatibility_date: "2026-08-20",
        compatibility_flags: ["nodejs_compat"],
        assets: {
          binding: "ASSETS",
          directory: "browser",
        },
        observability: { enabled: true },
      },
      null,
      2
    )}\n`
  );
  return configPath;
}

function getWranglerConfigPath() {
  return path.join(outputDir, "wrangler.jsonc");
}
