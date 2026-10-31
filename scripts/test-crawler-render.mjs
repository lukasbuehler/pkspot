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
      hasSpotContent: /IMAX/u.test(document.querySelector("app-spot-details")?.textContent ?? ""),
    };
    const key = `${state.canonical}|${state.robots}|${state.title}|${state.hasSpotContent}`;
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
  const liveServiceRequests = [];
  page.on("request", (request) => {
    if (/firestore\.googleapis\.com|firebaseappcheck\.googleapis\.com|\/recaptcha\//u.test(request.url())) {
      liveServiceRequests.push(request.url().split("?")[0]);
    }
  });
  try {
    const response = await page.goto(base + route, { waitUntil: "load" });
    assert.equal(response?.status(), 200, `${base}${route}`);
    const html = await response.text();
    assert.doesNotMatch(html, /<div\b[^>]*id="app-splash-screen"/u,
      "SSR content must not be covered by the client splash");
    assert.match(html, /<app-spot-details\b/u, "Spot body must be server rendered");
    assert.match(html, /initial-spot:v1:/u, "Public Spot snapshot must accompany SSR HTML");
    await page.waitForTimeout(SETTLE_MS);
    assert.equal(await page.locator("app-welcome-dialog").count(), 0,
      "Bot profile must not display a welcome dialog");
    const states = await page.evaluate(() => window.__seoHeadStates);
    assert.equal(liveServiceRequests.length, 0,
      `Initial public content must not require Firebase/App Check: ${liveServiceRequests.join(", ")}`);
    return { states, blockedRequests };
  } finally {
    await context.close();
  }
}

/** Verify the same SSR data survives a real first-visit consent handoff. */
async function renderFirstVisit(browser, base, route) {
  const context = await browser.newContext({
    viewport: { width: 412, height: 823 }, isMobile: true,
    userAgent: GOOGLEBOT_SMARTPHONE_UA.replace(/ \(compatible; Googlebot.*$/u, ""),
  });
  // Exercise startup without sending test analytics or live client requests.
  await context.route("**/*", request =>
    new URL(request.request().url()).origin === base
      ? request.continue() : request.abort("failed"));
  await context.addInitScript(() => { window.__PKSPOT_STORE_SCREENSHOT__ = true; });
  const page = await context.newPage();
  const errors = [], protectedRequests = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    if (/firestore\.googleapis\.com|firebaseappcheck\.googleapis\.com|\/recaptcha\//u.test(request.url())) {
      protectedRequests.push(request.url().split("?")[0]);
    }
  });
  try {
    const response = await page.goto(base + route, { waitUntil: "load" });
    assert.equal(response?.status(), 200);
    await page.locator("app-welcome-startup").waitFor({ state: "attached" });
    await page.locator("app-welcome-dialog").waitFor({ state: "visible" });
    // Angular removes ngh when the main app consumes its hydration state.
    await page.waitForFunction(() => !document.querySelector("app-root")?.hasAttribute("ngh"));
    await page.waitForTimeout(1000);
    assert.equal(await page.locator("app-welcome-dialog").count(), 1);
    assert.equal(protectedRequests.length, 0, "Consent must gate protected client requests");
    assert.equal(await page.evaluate(() => localStorage.getItem("acceptedVersion")), null);
    assert.match(await page.locator("app-spot-details").textContent(), /IMAX/u);
    await page.locator("app-welcome-dialog button").click();
    await page.locator("app-welcome-startup").waitFor({ state: "detached" });
    assert.ok(await page.evaluate(() => localStorage.getItem("acceptedVersion")));
    assert.equal(await page.locator("app-welcome-dialog").count(), 0);
    assert.match(await page.locator("app-spot-details").textContent(), /IMAX/u);
    // Returning visitors must bypass the early application entirely.
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => !document.querySelector("app-root")?.hasAttribute("ngh"));
    assert.equal(await page.locator("app-welcome-startup").count(), 0);
    assert.equal(await page.locator("app-welcome-dialog").count(), 0);

    // A first visitor can read legal/about content without granting consent.
    await page.evaluate(() => localStorage.removeItem("acceptedVersion"));
    await page.goto(base + route, { waitUntil: "load" });
    const about = page.locator('app-welcome-dialog a[href="about"]');
    await about.waitFor({ state: "visible" });
    await about.click();
    await page.waitForURL(base + route.split("/").slice(0, 2).join("/") + "/about");
    await page.waitForFunction(() => !document.querySelector("app-root")?.hasAttribute("ngh"));
    assert.equal(await page.locator("app-welcome-dialog").count(), 0);
    assert.equal(await page.evaluate(() => localStorage.getItem("acceptedVersion")), null);
    assert.deepEqual(errors, []);
    checks++;
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
  const firstSpot = states.findIndex((state) => state.hasSpotContent);
  assert.ok(firstSpot >= 0, `${label}: no Spot body content was rendered`);
  assert.ok(states.slice(firstSpot).every((state) => state.hasSpotContent),
    `${label}: hydration removed the server-rendered Spot body`);
  checks++;
}

async function stop({ child }) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  const kill = signal => {
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
}

let browser;
try {
  const expressPort = await freePort(), workerPort = await freePort();
  const servers = [
    { label: "App Hosting (Express)", port: expressPort,
      command: ["dist/pkspot/server/server.mjs"], env: { PORT: String(expressPort) } },
    { label: "Cloudflare (workerd)", port: workerPort,
      command: ["node_modules/wrangler/bin/wrangler.js", "dev", "--config",
        "dist/pkspot-cloudflare-worker/wrangler.jsonc", "--port", String(workerPort),
        "--ip", "127.0.0.1", "--inspector-port", "0", "--log-level", "error"],
      env: { WRANGLER_LOG_PATH: "/tmp/pkspot-crawler-render.log", WRANGLER_SEND_METRICS: "false" } },
  ];

  browser = await chromium.launch({ args: ["--renderer-process-limit=2", "--js-flags=--max-old-space-size=512"] });
  // Render every combination before failing, so one run shows which servers break.
  const failures = [];
  for (const server of servers) {
    const serverLabel = server.label;
    const base = await start(serverLabel, server.command, server.port, server.env);
    for (const route of SPOT_ROUTES) {
      for (const blockFirestore of [false, true]) {
        const label = `${serverLabel} ${route} (Firestore ${blockFirestore ? "blocked" : "allowed"})`;
        try {
          const { states, blockedRequests } = await renderLikeGooglebot(browser, base, route, {
            blockFirestore,
          });
          assertSpotHeadStable(label, route, states);
          console.log(`PASS: ${label}; blocked requests: ${blockedRequests}`);
        } catch (error) {
          failures.push(error);
          console.error(`FAIL: ${error.message}`);
        }
      }
    }
    for (const route of SPOT_ROUTES) {
      const label = `${serverLabel} ${route} (first-visit welcome)`;
      try {
        await renderFirstVisit(browser, base, route);
        console.log(`PASS: ${label}`);
      } catch (error) {
        failures.push(error);
        console.error(`FAIL: ${label}: ${error.message}`);
      }
    }
    // Keep only one SSR backend running at a time on local machines.
    await stop(processes.at(-1));
  }
  assert.equal(failures.length, 0, `${failures.length} crawler/welcome render(s) failed`);
  console.log(`Crawler/welcome render test passed (${checks} renders).`);
} catch (error) {
  console.error(error);
  for (const { label, logs } of processes) console.error(`--- ${label} logs ---\n${logs.slice(-10_000)}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await Promise.all(processes.map(stop));
}
