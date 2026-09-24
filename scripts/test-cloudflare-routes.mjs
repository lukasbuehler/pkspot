import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
if (!args.has("--skip-build")) {
  execFileSync(process.execPath, ["scripts/cloudflare-workers.mjs", "build"], {
    cwd: root,
    stdio: "inherit",
  });
}

// These are public, read-only content fixtures, also used by the Express smoke suite.
// Use the same running isolate for every request to catch request-lifetime bugs.
const routes = [
  ["/en/map/spots/imax", /IMAX - London \| PK Spot/],
  ["/en/events", /Events \| PK Spot/],
  ["/en/events/swissjam25", /Swiss Jam 2025 \| PK Spot/],
  ["/en/embedded/events/swissjam25", /Swiss Jam 2025 \| PK Spot/],
  ["/en/about", /About \| PK Spot/],
  ["/en/privacy-policy", /Privacy Policy \| PK Spot/],
  ["/en/account", /Sign in \| PK Spot/],
];
const processes = [];
let checks = 0;

async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function start(commandArgs, port, env = {}) {
  const child = spawn(process.execPath, commandArgs, {
    cwd: root,
    env: { ...process.env, ...env },
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const entry = { child, logs: "" };
  processes.push(entry);
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (data) => {
      entry.logs = (entry.logs + data).slice(-50_000);
    });
  }
  child.on("error", (error) => {
    entry.logs += String(error);
  });
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null)
      throw new Error(`SSR process exited: ${entry.logs}`);
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
  throw new Error(`SSR server did not start: ${entry.logs}`);
}

async function request(base, route, options = {}) {
  return fetch(base + route, {
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
    ...options,
  });
}

async function page(base, route, title, status = 200) {
  const response = await request(base, route);
  assert.equal(response.status, status, `${base}${route}`);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);
  const html = await response.text();
  assert.match(
    html,
    /<app-root[^>]*>[\s\S]+<\/app-root>/,
    `SSR content missing: ${route}`,
  );
  if (title)
    assert.match(html.match(/<title>(.*?)<\/title>/)?.[1] ?? "", title, route);
  if (route.includes("/map/spots/imax")) {
    assert.match(
      html,
      /<link rel="canonical" href="https:\/\/pkspot.app\/(?:en|de|fr|it|es|nl)\/map\/spots\/imax"/,
    );
    assert.match(html, /<meta property="og:title"[^>]*IMAX/);
  }
  checks++;
  return html;
}

async function redirect(base, route, target, status, headers) {
  const response = await request(base, route, { headers });
  assert.equal(response.status, status, route);
  assert.equal(response.headers.get("location"), target, route);
  await response.body?.cancel();
  checks++;
}

async function asset(base, route, type, status = 200) {
  const response = await request(base, route);
  assert.equal(response.status, status, route);
  assert.match(response.headers.get("content-type") ?? "", type, route);
  if (status === 200)
    assert.ok((await response.arrayBuffer()).byteLength > 0, route);
  else await response.body?.cancel();
  checks++;
}

try {
  const port = await freePort();
  const worker = await start(
    [
      "node_modules/wrangler/bin/wrangler.js",
      "dev",
      "--config",
      "dist/pkspot-cloudflare-worker/wrangler.jsonc",
      "--port",
      String(port),
      "--ip",
      "127.0.0.1",
      "--inspector-port",
      "0",
      "--log-level",
      "error",
    ],
    port,
    {
      WRANGLER_LOG_PATH: "/tmp/pkspot-cloudflare-smoke.log",
      WRANGLER_SEND_METRICS: "false",
    },
  );

  for (let round = 0; round < 2; round++) {
    for (const [route, title] of routes) await page(worker, route, title);
  }
  console.log(
    "PASS: repeated Spot, Events, embedded event, static, and account SSR",
  );
  for (const locale of ["en", "de", "fr", "it", "es", "nl"]) {
    await page(worker, `/${locale}`, /PK Spot/);
    await page(worker, `/${locale}/map/spots/imax`, /IMAX - London \| PK Spot/);
  }
  // Include both simultaneous duplicate URLs and different data queries.
  await Promise.all(
    [...routes.slice(0, 4), routes[0]].map(([route, title]) =>
      page(worker, route, title),
    ),
  );
  await page(worker, routes[0][0], routes[0][1]);
  console.log("PASS: all six locales and overlapping SSR requests");

  await redirect(worker, "/", "/en", 302);
  await redirect(
    worker,
    "/map/spots/imax?tab=photos",
    "/de/map/spots/imax?tab=photos",
    302,
    { "Accept-Language": "de-CH,de;q=0.9" },
  );
  await redirect(worker, "/en/map/imax", "/en/map/spots/imax", 301);
  await redirect(
    worker,
    "/en/map/events/swissjam25",
    "/en/events/swissjam25",
    301,
  );
  await redirect(worker, "/de-CH/map/spots/imax", "/de/map/spots/imax", 301);
  await page(worker, "/en/this-route-should-not-exist", null, 404);
  await asset(worker, "/assets/icons/favicon-16x16.png", /image\/png/);
  await asset(worker, "/en/assets/icons/favicon-16x16.png", /image\/png/);
  await asset(worker, "/firebase-messaging-sw.js", /javascript/);
  await asset(worker, "/robots.txt", /text\/plain/);
  const missing = await request(worker, "/assets/not-a-real-file.png");
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("location"), null);
  assert.equal(missing.headers.get("cache-control"), "no-store");
  await missing.body?.cancel();
  checks++;
  const html = await page(worker, "/en/about", /About/);
  const files = [...html.matchAll(/(?:src|href)="([^"\s]+\.(?:js|css))"/g)].map(
    (match) => match[1],
  );
  assert.ok(files.length, "SSR should reference browser bundles");
  for (const file of new Set(files)) {
    const url = new URL(file, `${worker}/en/`);
    if (url.origin === worker)
      await asset(worker, url.pathname, /javascript|text\/css/);
  }
  console.log(
    "PASS: deep links, redirects, missing routes, icons, service worker, and browser bundles",
  );

  if (args.has("--compare-express")) {
    const expressPort = await freePort();
    const express = await start(
      ["dist/pkspot/server/server.mjs"],
      expressPort,
      { PORT: String(expressPort) },
    );
    for (const [route, title] of routes) await page(express, route, title);
    await page(express, "/en/this-route-should-not-exist", null, 404);
    await asset(express, "/assets/icons/favicon-16x16.png", /image\/png/);
    console.log("PASS: the same page and asset expectations against Express");
  }
  const workerLogs = processes[0].logs;
  assert.doesNotMatch(
    workerLogs,
    /Cannot perform I\/O|code had hung|XMLHttpRequest is not defined|client is offline|SSR cleanup failed|Firestore shutting down/i,
  );
  console.log(`Cloudflare route regression smoke passed (${checks} checks).`);
} catch (error) {
  console.error(error);
  for (const { logs } of processes) console.error(logs.slice(-10_000));
  process.exitCode = 1;
} finally {
  await Promise.all(
    processes.map(async ({ child }) => {
      if (child.exitCode !== null) return;
      const exited = once(child, "exit");
      const kill = (signal) => {
        try {
          process.platform === "win32"
            ? child.kill(signal)
            : process.kill(-child.pid, signal);
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
