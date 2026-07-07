import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withHeavyCommandLock } from "./resource-lock.mjs";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");
const vitestBin = path.join(
  repoRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "vitest.cmd" : "vitest"
);

const maxWorkers = readPositiveInteger("PKSPOT_VITEST_MAX_WORKERS", 2);
const maxOldSpaceMb = readPositiveInteger(
  "PKSPOT_VITEST_MAX_OLD_SPACE_MB",
  4096
);

if (!existsSync(vitestBin)) {
  throw new Error(`Vitest binary not found at ${vitestBin}. Run npm install first.`);
}

withHeavyCommandLock(repoRoot, "Vitest", () => {
  console.log(
    `Running Vitest with ${maxWorkers} worker(s), esbuild worker threads disabled, and a ${maxOldSpaceMb} MB Node heap cap.`
  );

  execFileSync(vitestBin, process.argv.slice(2), {
    cwd: repoRoot,
    env: {
      ...process.env,
      ESBUILD_WORKER_THREADS: process.env["ESBUILD_WORKER_THREADS"] ?? "0",
      NODE_OPTIONS: withMaxOldSpaceSize(process.env["NODE_OPTIONS"], maxOldSpaceMb),
      PKSPOT_VITEST_MAX_WORKERS: String(maxWorkers),
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
