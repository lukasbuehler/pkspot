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

const maxWorkers = readPositiveInteger("PKSPOT_NG_BUILD_MAX_WORKERS", 1);
const maxOldSpaceMb = readPositiveInteger("PKSPOT_NG_BUILD_MAX_OLD_SPACE_MB", 4096);
const buildArgs = process.argv.slice(2);
const buildConfigurations = readBuildConfigurations(buildArgs);

if (!existsSync(ngBin)) {
  throw new Error(`Angular CLI binary not found at ${ngBin}. Run npm install first.`);
}

assertCodexSandboxBuildIsSafe(buildConfigurations);

withHeavyCommandLock(repoRoot, "Angular build", () => {
  console.log(
    `Running Angular build with ${maxWorkers} worker(s), esbuild worker threads disabled, and a ${maxOldSpaceMb} MB Node heap cap.`
  );

  execFileSync(ngBin, ["build", ...buildArgs], {
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

function assertCodexSandboxBuildIsSafe(configurations) {
  if (
    process.env["CODEX_SANDBOX"] !== "seatbelt" ||
    process.env["PKSPOT_ALLOW_CODEX_SANDBOX_ANGULAR_BUILD"] === "1"
  ) {
    return;
  }

  const sandboxSafeConfigurations = new Set(["ci", "dev"]);
  const unsafeConfigurations = configurations.filter(
    (configuration) => !sandboxSafeConfigurations.has(configuration)
  );

  if (unsafeConfigurations.length === 0) {
    return;
  }

  console.error(
    [
      `Refusing to run Angular build configuration "${configurations.join(",")}" inside the Codex seatbelt sandbox.`,
      "On this macOS sandbox, the native esbuild process can grow without bound during optimized or multi-locale Angular builds.",
      "Run the command outside the sandbox instead. Set PKSPOT_ALLOW_CODEX_SANDBOX_ANGULAR_BUILD=1 only if you are intentionally debugging that sandbox failure mode.",
    ].join("\n")
  );
  process.exit(86);
}

function readBuildConfigurations(args) {
  const defaultConfiguration = "production";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--configuration" || arg === "-c") {
      return parseConfigurations(args[index + 1] || defaultConfiguration);
    }

    if (arg.startsWith("--configuration=")) {
      return parseConfigurations(arg.slice("--configuration=".length));
    }

    if (arg.startsWith("-c=")) {
      return parseConfigurations(arg.slice("-c=".length));
    }
  }

  return [defaultConfiguration];
}

function parseConfigurations(value) {
  return value
    .split(",")
    .map((configuration) => configuration.trim())
    .filter(Boolean);
}

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
