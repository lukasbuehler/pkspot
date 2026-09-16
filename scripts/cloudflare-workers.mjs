import { execFileSync } from "node:child_process";
import {
  existsSync,
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
  writeFileSync(
    path.join(outputDir, "worker.mjs"),
    [
      'import handler from "./server/server.mjs";',
      "export default {",
      "  async fetch(request) {",
      '    return (await handler(request)) ?? new Response("Not Found", { status: 404 });',
      "  },",
      "};",
      "",
    ].join("\n"),
  );
  writeWranglerConfig();
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
        limits: { cpu_ms: 1000 },
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
