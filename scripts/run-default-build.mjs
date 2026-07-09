import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");

const buildConfiguration = process.env["PKSPOT_BUILD_CONFIGURATION"] || "dev";
const fullProductionBuild = buildConfiguration === "production";

if (!fullProductionBuild) {
  console.log(
    "Running local build configuration. Use `npm run build:prod` or set PKSPOT_BUILD_CONFIGURATION=production for the full localized production build."
  );
}

execFileSync(
  process.execPath,
  ["scripts/run-angular-build.mjs", `--configuration=${buildConfiguration}`],
  {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  }
);

execFileSync(process.execPath, ["copy-proxy-server.js"], {
  cwd: repoRoot,
  env: process.env,
  stdio: "inherit",
});
