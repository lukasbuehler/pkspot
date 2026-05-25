import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

const targetUrl =
  process.env["PKSPOT_LIGHTHOUSE_URL"] ?? "http://localhost:4000/de/map";
const outputDir = resolve(
  repoRoot,
  process.env["PKSPOT_LIGHTHOUSE_OUTPUT_DIR"] ?? "test-results/lighthouse"
);
const outputJsonPath = resolve(outputDir, "map-lighthouse.json");
const outputHtmlPath = resolve(outputDir, "map-lighthouse.html");
const skipBuild = process.env["PKSPOT_LIGHTHOUSE_SKIP_BUILD"] === "1";
const buildScript = process.env["PKSPOT_LIGHTHOUSE_BUILD_SCRIPT"] ?? "build";

const thresholds = {
  performance: Number(process.env["PKSPOT_LIGHTHOUSE_PERFORMANCE"] ?? 0.45),
  accessibility: Number(process.env["PKSPOT_LIGHTHOUSE_ACCESSIBILITY"] ?? 0.75),
  bestPractices: Number(
    process.env["PKSPOT_LIGHTHOUSE_BEST_PRACTICES"] ?? 0.65
  ),
  seo: Number(process.env["PKSPOT_LIGHTHOUSE_SEO"] ?? 0.75),
  firstContentfulPaintMs: Number(
    process.env["PKSPOT_LIGHTHOUSE_FCP_MS"] ?? 10_000
  ),
  largestContentfulPaintMs: Number(
    process.env["PKSPOT_LIGHTHOUSE_LCP_MS"] ?? 35_000
  ),
  totalBlockingTimeMs: Number(process.env["PKSPOT_LIGHTHOUSE_TBT_MS"] ?? 1_000),
  cumulativeLayoutShift: Number(
    process.env["PKSPOT_LIGHTHOUSE_CLS"] ?? 0.25
  ),
};

function runCommand(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: options.stdio ?? "inherit",
      env: process.env,
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(" ")} failed with ${
            signal ? `signal ${signal}` : `exit code ${code}`
          }`
        )
      );
    });
  });
}

async function waitForServer(url, timeoutMs = 30_000) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (response.ok) return;
      lastError = new Error(`Server responded with ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }

  throw new Error(
    `Timed out waiting for ${url}${
      lastError instanceof Error ? `: ${lastError.message}` : ""
    }`
  );
}

async function isServerAlreadyRunning(url) {
  try {
    const response = await fetch(url, { redirect: "follow" });
    return response.ok;
  } catch {
    return false;
  }
}

function startTestServer() {
  const child = spawn("npm", ["run", "serve:test"], {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  });

  const stop = () => {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  };

  process.once("exit", stop);
  process.once("SIGINT", () => {
    stop();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    stop();
    process.exit(143);
  });

  return { child, stop };
}

function categoryScore(lhr, category) {
  return lhr.categories[category]?.score ?? 0;
}

function auditNumericValue(lhr, auditId) {
  return Number(lhr.audits[auditId]?.numericValue ?? 0);
}

function assertAtLeast(name, actual, expected, failures) {
  if (actual < expected) {
    failures.push(`${name}: ${actual.toFixed(2)} < ${expected.toFixed(2)}`);
  }
}

function assertAtMost(name, actual, expected, failures) {
  if (actual > expected) {
    failures.push(`${name}: ${Math.round(actual)} > ${Math.round(expected)}`);
  }
}

async function main() {
  await mkdir(outputDir, { recursive: true });

  if (!skipBuild) {
    await runCommand("npm", ["run", buildScript]);
  } else if (!existsSync(resolve(repoRoot, "dist/pkspot/server/de/server.mjs"))) {
    throw new Error(
      "PKSPOT_LIGHTHOUSE_SKIP_BUILD=1 was set, but dist/pkspot/server/de/server.mjs does not exist."
    );
  }

  const serverWasRunning = await isServerAlreadyRunning(targetUrl);
  const server = serverWasRunning ? null : startTestServer();

  try {
    await waitForServer(targetUrl);

    const chrome = await chromeLauncher.launch({
      chromeFlags: [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-dev-shm-usage",
      ],
    });

    try {
      const result = await lighthouse(targetUrl, {
        port: chrome.port,
        logLevel: "error",
        output: ["json", "html"],
        onlyCategories: [
          "performance",
          "accessibility",
          "best-practices",
          "seo",
        ],
      });

      if (!result) {
        throw new Error("Lighthouse did not return a result.");
      }

      const [jsonReport, htmlReport] = Array.isArray(result.report)
        ? result.report
        : [result.report, ""];
      await writeFile(outputJsonPath, jsonReport);
      if (htmlReport) {
        await writeFile(outputHtmlPath, htmlReport);
      }

      const lhr = result.lhr;
      const metrics = {
        performance: categoryScore(lhr, "performance"),
        accessibility: categoryScore(lhr, "accessibility"),
        bestPractices: categoryScore(lhr, "best-practices"),
        seo: categoryScore(lhr, "seo"),
        firstContentfulPaintMs: auditNumericValue(
          lhr,
          "first-contentful-paint"
        ),
        largestContentfulPaintMs: auditNumericValue(
          lhr,
          "largest-contentful-paint"
        ),
        totalBlockingTimeMs: auditNumericValue(lhr, "total-blocking-time"),
        cumulativeLayoutShift: auditNumericValue(
          lhr,
          "cumulative-layout-shift"
        ),
        speedIndexMs: auditNumericValue(lhr, "speed-index"),
      };

      console.log("[map-lighthouse]", JSON.stringify(metrics, null, 2));
      console.log(`Lighthouse JSON: ${outputJsonPath}`);
      if (htmlReport) {
        console.log(`Lighthouse HTML: ${outputHtmlPath}`);
      }

      const failures = [];
      assertAtLeast(
        "performance",
        metrics.performance,
        thresholds.performance,
        failures
      );
      assertAtLeast(
        "accessibility",
        metrics.accessibility,
        thresholds.accessibility,
        failures
      );
      assertAtLeast(
        "best-practices",
        metrics.bestPractices,
        thresholds.bestPractices,
        failures
      );
      assertAtLeast("seo", metrics.seo, thresholds.seo, failures);
      assertAtMost(
        "first-contentful-paint",
        metrics.firstContentfulPaintMs,
        thresholds.firstContentfulPaintMs,
        failures
      );
      assertAtMost(
        "largest-contentful-paint",
        metrics.largestContentfulPaintMs,
        thresholds.largestContentfulPaintMs,
        failures
      );
      assertAtMost(
        "total-blocking-time",
        metrics.totalBlockingTimeMs,
        thresholds.totalBlockingTimeMs,
        failures
      );
      assertAtMost(
        "cumulative-layout-shift",
        metrics.cumulativeLayoutShift,
        thresholds.cumulativeLayoutShift,
        failures
      );

      if (failures.length > 0) {
        throw new Error(`Lighthouse thresholds failed:\n- ${failures.join("\n- ")}`);
      }
    } finally {
      await chrome.kill();
    }
  } finally {
    server?.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
