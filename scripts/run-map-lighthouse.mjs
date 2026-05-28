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

const defaultBaseUrl = "http://localhost:4000";
const defaultPagePaths = [
  "/de/map",
  "/de/events",
  "/de/events/swissjam26",
  "/de/about",
  "/de/privacy-policy",
];
const outputDir = resolve(
  repoRoot,
  process.env["PKSPOT_LIGHTHOUSE_OUTPUT_DIR"] ?? "test-results/lighthouse"
);
const skipBuild = process.env["PKSPOT_LIGHTHOUSE_SKIP_BUILD"] === "1";
const buildScript = process.env["PKSPOT_LIGHTHOUSE_BUILD_SCRIPT"] ?? "build";
const crawlerUserAgent =
  process.env["PKSPOT_LIGHTHOUSE_USER_AGENT"] ??
  "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/W.X.Y.Z Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

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

function getPageSpecs() {
  const configuredUrl = process.env["PKSPOT_LIGHTHOUSE_URL"];
  const configuredPaths = process.env["PKSPOT_LIGHTHOUSE_PATHS"];
  const baseUrl = configuredUrl
    ? new URL(configuredUrl).origin
    : defaultBaseUrl;
  const paths = configuredPaths
    ? configuredPaths
        .split(",")
        .map((path) => path.trim())
        .filter(Boolean)
    : configuredUrl
      ? [`${new URL(configuredUrl).pathname}${new URL(configuredUrl).search}`]
      : defaultPagePaths;

  return paths.map((path) => {
    const url = new URL(path, baseUrl).href;
    const { pathname, search } = new URL(url);
    const label = `${pathname}${search}`
      .replace(/^\/+/, "")
      .replace(/\/+$/, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "home";

    return { label, url };
  });
}

function collectMetrics(lhr) {
  return {
    performance: categoryScore(lhr, "performance"),
    accessibility: categoryScore(lhr, "accessibility"),
    bestPractices: categoryScore(lhr, "best-practices"),
    seo: categoryScore(lhr, "seo"),
    firstContentfulPaintMs: auditNumericValue(lhr, "first-contentful-paint"),
    largestContentfulPaintMs: auditNumericValue(
      lhr,
      "largest-contentful-paint"
    ),
    totalBlockingTimeMs: auditNumericValue(lhr, "total-blocking-time"),
    cumulativeLayoutShift: auditNumericValue(lhr, "cumulative-layout-shift"),
    speedIndexMs: auditNumericValue(lhr, "speed-index"),
  };
}

function assertThresholds(pageLabel, metrics, failures) {
  const pageFailures = [];

  assertAtLeast(
    "performance",
    metrics.performance,
    thresholds.performance,
    pageFailures
  );
  assertAtLeast(
    "accessibility",
    metrics.accessibility,
    thresholds.accessibility,
    pageFailures
  );
  assertAtLeast(
    "best-practices",
    metrics.bestPractices,
    thresholds.bestPractices,
    pageFailures
  );
  assertAtLeast("seo", metrics.seo, thresholds.seo, pageFailures);
  assertAtMost(
    "first-contentful-paint",
    metrics.firstContentfulPaintMs,
    thresholds.firstContentfulPaintMs,
    pageFailures
  );
  assertAtMost(
    "largest-contentful-paint",
    metrics.largestContentfulPaintMs,
    thresholds.largestContentfulPaintMs,
    pageFailures
  );
  assertAtMost(
    "total-blocking-time",
    metrics.totalBlockingTimeMs,
    thresholds.totalBlockingTimeMs,
    pageFailures
  );
  assertAtMost(
    "cumulative-layout-shift",
    metrics.cumulativeLayoutShift,
    thresholds.cumulativeLayoutShift,
    pageFailures
  );

  failures.push(...pageFailures.map((failure) => `${pageLabel} ${failure}`));
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const pages = getPageSpecs();

  if (!skipBuild) {
    await runCommand("npm", ["run", buildScript]);
  } else if (!existsSync(resolve(repoRoot, "dist/pkspot/server/de/server.mjs"))) {
    throw new Error(
      "PKSPOT_LIGHTHOUSE_SKIP_BUILD=1 was set, but dist/pkspot/server/de/server.mjs does not exist."
    );
  }

  const serverWasRunning = await isServerAlreadyRunning(pages[0].url);
  const server = serverWasRunning ? null : startTestServer();

  try {
    await waitForServer(pages[0].url);

    const chrome = await chromeLauncher.launch({
      chromeFlags: [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-dev-shm-usage",
      ],
    });

    try {
      const failures = [];
      const summary = {};

      for (const page of pages) {
        const result = await lighthouse(page.url, {
          port: chrome.port,
          logLevel: "error",
          output: ["json", "html"],
          emulatedUserAgent: crawlerUserAgent,
          onlyCategories: [
            "performance",
            "accessibility",
            "best-practices",
            "seo",
          ],
        });

        if (!result) {
          throw new Error(`Lighthouse did not return a result for ${page.url}.`);
        }

        const [jsonReport, htmlReport] = Array.isArray(result.report)
          ? result.report
          : [result.report, ""];
        const outputJsonPath = resolve(
          outputDir,
          `${page.label}-lighthouse.json`
        );
        const outputHtmlPath = resolve(
          outputDir,
          `${page.label}-lighthouse.html`
        );

        await writeFile(outputJsonPath, jsonReport);
        if (htmlReport) {
          await writeFile(outputHtmlPath, htmlReport);
        }

        const metrics = collectMetrics(result.lhr);
        summary[page.label] = metrics;
        console.log(
          `[lighthouse:${page.label}]`,
          JSON.stringify(metrics, null, 2)
        );
        console.log(`Lighthouse JSON: ${outputJsonPath}`);
        if (htmlReport) {
          console.log(`Lighthouse HTML: ${outputHtmlPath}`);
        }

        assertThresholds(page.label, metrics, failures);
      }

      await writeFile(
        resolve(outputDir, "lighthouse-summary.json"),
        `${JSON.stringify(summary, null, 2)}\n`
      );

      if (failures.length > 0) {
        throw new Error(
          `Lighthouse thresholds failed:\n- ${failures.join("\n- ")}`
        );
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
