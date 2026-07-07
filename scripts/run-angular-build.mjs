import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withHeavyCommandLock } from "./resource-lock.mjs";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");
const ngBin = path.join(
  repoRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "ng.cmd" : "ng"
);

const maxWorkers = readPositiveInteger("PKSPOT_NG_BUILD_MAX_WORKERS", 2);
const maxOldSpaceMb = readPositiveInteger("PKSPOT_NG_BUILD_MAX_OLD_SPACE_MB", 4096);

if (!existsSync(ngBin)) {
  throw new Error(`Angular CLI binary not found at ${ngBin}. Run npm install first.`);
}

withHeavyCommandLock(repoRoot, "Angular build", () => {
  console.log(
    `Running Angular build with ${maxWorkers} worker(s), esbuild worker threads disabled, and a ${maxOldSpaceMb} MB Node heap cap.`
  );

  execFileSync(ngBin, ["build", ...process.argv.slice(2)], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ESBUILD_WORKER_THREADS: process.env["ESBUILD_WORKER_THREADS"] ?? "0",
      NG_BUILD_MAX_WORKERS: String(maxWorkers),
      NODE_OPTIONS: withMaxOldSpaceSize(process.env["NODE_OPTIONS"], maxOldSpaceMb),
    },
    stdio: "inherit",
  });
});

function readPositiveInteger(envName, fallback) {
  const rawValue = process.env[envName];
  if (!rawValue) {
    return fallback;
  }

  const value = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${envName} must be a positive integer. Received: ${rawValue}`);
  }

  return value;
}

function withMaxOldSpaceSize(nodeOptions, maxOldSpaceSizeMb) {
  const sanitizedOptions = (nodeOptions || "")
    .replace(/(?:^|\s)--max-old-space-size=\S+/g, " ")
    .trim();
  const heapOption = `--max-old-space-size=${maxOldSpaceSizeMb}`;

  return [sanitizedOptions, heapOption].filter(Boolean).join(" ");
}
