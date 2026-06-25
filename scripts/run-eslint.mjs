import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");
const srcRoot = path.join(repoRoot, "src");
const lintExtensions = new Set([".html", ".ts"]);

const chunkSize = readPositiveInteger("PKSPOT_LINT_CHUNK_SIZE", 40);
const maxOldSpaceMb = readPositiveInteger(
  "PKSPOT_LINT_MAX_OLD_SPACE_MB",
  4096
);
const cacheLocation =
  process.env.PKSPOT_ESLINT_CACHE_LOCATION ||
  path.join(".angular", "cache", "eslint");
const eslintBin = path.join(
  repoRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "eslint.cmd" : "eslint"
);

if (!existsSync(eslintBin)) {
  throw new Error(`ESLint binary not found at ${eslintBin}. Run npm install first.`);
}

const files = collectLintFiles(srcRoot)
  .map((filePath) => path.relative(repoRoot, filePath))
  .sort();

if (files.length === 0) {
  console.log("No lintable source files found.");
  process.exit(0);
}

const lintEnv = {
  ...process.env,
  NODE_OPTIONS: withMaxOldSpaceSize(process.env.NODE_OPTIONS, maxOldSpaceMb),
};
const baseArgs = [
  "--cache",
  "--cache-location",
  cacheLocation,
  "--cache-strategy",
  "content",
  "--no-error-on-unmatched-pattern",
];

console.log(
  `Linting ${files.length} source files in chunks of ${chunkSize} with a ${maxOldSpaceMb} MB Node heap cap.`
);

for (let start = 0; start < files.length; start += chunkSize) {
  const chunk = files.slice(start, start + chunkSize);
  const end = start + chunk.length;

  console.log(`\n==> ESLint ${start + 1}-${end} of ${files.length}`);
  execFileSync(eslintBin, [...baseArgs, ...chunk], {
    cwd: repoRoot,
    env: lintEnv,
    stdio: "inherit",
  });
}

function collectLintFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const filesInDirectory = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      filesInDirectory.push(...collectLintFiles(entryPath));
      continue;
    }

    if (entry.isFile() && lintExtensions.has(path.extname(entry.name))) {
      filesInDirectory.push(entryPath);
    }
  }

  return filesInDirectory.filter((filePath) => statSync(filePath).isFile());
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
