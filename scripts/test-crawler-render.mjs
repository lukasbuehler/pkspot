import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

/**
 * Renders Spot pages the way Googlebot does — JavaScript on, no consent, no
 * stored state — against both locally started SSR servers: the App Hosting
 * Express server and the Cloudflare Worker in workerd.
 *
 * The SSR HTML can be correct while the browser rewrites it after hydration,
 * which Google then indexes. So this watches the canonical, robots and title
 * from the first parsed byte until the page settles, and fails if any of them
 * ever stops describing the Spot. Firestore is also blocked in one pass,
 * because crawler renderers often drop or cut off its connection.
 *
 * Usage: node scripts/test-crawler-render.mjs [--skip-build | --skip-build-express]
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));

const GOOGLEBOT_SMARTPHONE_UA =
  "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/141.0.7390.122 Mobile Safari/537.36 " +
  "(compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
// Public, read-only Spot fixture shared with the Express and Worker smoke tests.
const SPOT_ROUTES = ["/de/map/spots/imax", "/en/map/spots/imax"];
const SETTLE_MS = 10_000;
const FIRESTORE_URL = /firestore\.googleapis\.com/u;

const processes = [];
let checks = 0;

// `test:all` runs this after `test:build`, which already made the Express build.
if (!args.has("--skip-build")) {
  if (!args.has("--skip-build-express")) run("npm", ["run", "build:prod"]);
  run(process.execPath, ["scripts/cloudflare-workers.mjs", "build"]);
}

function run(command, commandArgs) {
  execFileSync(command, commandArgs, { cwd: root, stdio: "inherit" });
}

async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function start(label, commandArgs, port, env = {}) {
  const child = spawn(process.execPath, commandArgs, {
    cwd: root,
    env: { ...process.env, ...env },
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const entry = { label, child, logs: "" };
  processes.push(entry);
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (data) => {
      entry.logs = (entry.logs + data).slice(-50_000);
    });
  }
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 180; attempt++) {
    if (child.exitCode !== null)
      throw new Error(`${label} exited: ${entry.logs}`);
    try {
      const response = await fetch(`${base}/`, {
        redirect: "manual",
        signal: AbortSignal.timeout(1000),
      });
      await response.body?.cancel();
      return base;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`${label} did not start: ${entry.logs}`);
}

/** Records every state of the SEO-relevant head tags, starting before any app script. */
function recordHeadStates() {
  const states = [];
  window.__seoHeadStates = states;
  let last = "";
  const snapshot = () => {
    const state = {
      at: Math.round(performance.now()),
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
      robots: document.querySelector('meta[name="robots"]')?.getAttribute("content") ?? null,
      title: document.title,
    };
    const key = `${state.canonical}|${state.robots}|${state.title}`;
    if (key !== last) {
      last = key;
      states.push(state);
    }
  };
  new MutationObserver(snapshot).observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  document.addEventListener("DOMContentLoaded", snapshot);
}

async function renderLikeGooglebot(browser, base, route, { blockFirestore }) {
  // A fresh context per page: no consent, cookies, or storage, like Googlebot.
  const context = await browser.newContext({
    userAgent: GOOGLEBOT_SMARTPHONE_UA,
    viewport: { width: 412, height: 732 },
    isMobile: true,
  });
  let blockedRequests = 0;
  if (blockFirestore) {
    await context.route(FIRESTORE_URL, (request) => {
      blockedRequests++;
      return request.abort("failed");
    });
  }
  await context.addInitScript(recordHeadStates);
  const page = await context.newPage();
  try {
    const response = await page.goto(base + route, { waitUntil: "load" });
    assert.equal(response?.status(), 200, `${base}${route}`);
    await page.waitForTimeout(SETTLE_MS);
    const states = await page.evaluate(() => window.__seoHeadStates);
    return { states, blockedRequests };
  } finally {
    await context.close();
  }
}

function assertSpotHeadStable(label, route, states) {
  const expectedCanonical = `https://pkspot.app${route}`;
  // Ignore the parser's partial states before <head> has its canonical.
  const settled = states.filter((state) => state.canonical !== null);
  assert.ok(settled.length > 0, `${label}: no canonical was ever rendered`);
  const timeline = settled
    .map((state) => `  ${state.at}ms ${state.canonical} | ${state.robots} | ${state.title}`)
    .join("\n");
  for (const state of settled) {
    const where = `${label} at ${state.at}ms\n${timeline}\n`;
    assert.equal(state.canonical, expectedCanonical, `${where}: canonical left the Spot`);
    assert.doesNotMatch(state.robots ?? "", /noindex/u, `${where}: robots became noindex`);
    assert.match(state.title, /IMAX/u, `${where}: title left the Spot ("${state.title}")`);
  }
  checks++;
}

let browser;
try {
  const expressPort = await freePort();
  const workerPort = await freePort();
  const servers = [
    [
      "App Hosting (Express)",
      await start("App Hosting (Express)", ["dist/pkspot/server/server.mjs"], expressPort, {
        PORT: String(expressPort),
      }),
    ],
    [
      "Cloudflare (workerd)",
      await start(
        "Cloudflare (workerd)",
        [
          "node_modules/wrangler/bin/wrangler.js",
          "dev",
          "--config",
          "dist/pkspot-cloudflare-worker/wrangler.jsonc",
          "--port",
          String(workerPort),
          "--ip",
          "127.0.0.1",
          "--inspector-port",
          "0",
          "--log-level",
          "error",
        ],
        workerPort,
        {
          WRANGLER_LOG_PATH: "/tmp/pkspot-crawler-render.log",
          WRANGLER_SEND_METRICS: "false",
        },
      ),
    ],
  ];

  browser = await chromium.launch();
  // Render every combination before failing, so one run shows which servers break.
  const failures = [];
  for (const [serverLabel, base] of servers) {
    for (const route of SPOT_ROUTES) {
      for (const blockFirestore of [false, true]) {
        const label = `${serverLabel} ${route} (Firestore ${blockFirestore ? "blocked" : "allowed"})`;
        try {
          const { states, blockedRequests } = await renderLikeGooglebot(browser, base, route, {
            blockFirestore,
          });
          if (blockFirestore) {
            assert.ok(blockedRequests > 0, `${label}: the page made no Firestore request to block`);
          }
          assertSpotHeadStable(label, route, states);
          console.log(`PASS: ${label}`);
        } catch (error) {
          failures.push(error);
          console.error(`FAIL: ${error.message}`);
        }
      }
    }
  }
  assert.equal(failures.length, 0, `${failures.length} crawler render(s) failed`);
  console.log(`Crawler render test passed (${checks} renders).`);
} catch (error) {
  console.error(error);
  for (const { label, logs } of processes) console.error(`--- ${label} logs ---\n${logs.slice(-10_000)}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await Promise.all(
    processes.map(async ({ child }) => {
      if (child.exitCode !== null) return;
      const exited = once(child, "exit");
      const kill = (signal) => {
        try {
          process.platform === "win32" ? child.kill(signal) : process.kill(-child.pid, signal);
        } catch (error) {
          if (error.code !== "ESRCH") throw error;
        }
      };
      kill("SIGTERM");
      const deadline = setTimeout(() => kill("SIGKILL"), 5000);
      await exited;
      clearTimeout(deadline);
    }),
  );
}
