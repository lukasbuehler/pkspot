import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const configPath = path.join(repoRoot, "scripts/store-screenshots/config.json");
const config = JSON.parse(await readFile(configPath, "utf8"));
const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

const selectedLocales = filterByIds(
  config.locales,
  args.locales,
  "locale",
);
const selectedDevices = filterByIds(
  config.devices,
  args.devices,
  "device",
);
const selectedScenes = filterByIds(
  config.scenes,
  args.scenes,
  "scene",
);
const outputMode = args.mode ?? config.outputMode ?? "composed";
const captureIds = new Set();
if (outputMode === "device") {
  for (const screenshot of config.deviceScreenshots ?? []) {
    captureIds.add(screenshot.capture);
  }
} else {
  for (const scene of selectedScenes) {
    for (const device of selectedDevices) {
      const layout = scene.layouts[device.id];
      if (!layout) continue;
      for (const placement of layout.placements) {
        captureIds.add(placement.capture);
      }
    }
  }
}
const selectedCaptures = config.captures.filter((capture) =>
  captureIds.has(capture.id),
);
const baseUrl = args.baseUrl ?? process.env["STORE_SCREENSHOT_BASE_URL"] ?? config.baseUrl;
const outputRoot = path.resolve(repoRoot, args.outputRoot ?? config.outputRoot);
const captureRoot = path.resolve(repoRoot, args.captureRoot ?? config.captureRoot);
const deviceScreenshotRoot = path.resolve(
  repoRoot,
  args.deviceScreenshotRoot ?? config.deviceScreenshotRoot ?? config.captureRoot,
);

if (args.list) {
  printSelection();
  process.exit(0);
}

if (selectedCaptures.length === 0) {
  throw new Error("No captures selected. Check scene layouts in the screenshot config.");
}

await ensureDir(outputRoot);
await ensureDir(captureRoot);
await ensureDir(deviceScreenshotRoot);

const managedSsrServer = await maybeStartSsrServer();
let browser;
try {
  browser = await launchBrowser();

  if (!args.skipCapture) {
    await captureAppRoutes(browser);
  }

  if (args.captureOnly) {
    // Captures have already been written above.
  } else if (outputMode === "device") {
    await writeDeviceScreenshots();
  } else {
    await composeStoreScreenshots(browser);
  }
} finally {
  if (browser) {
    await browser.close();
  }
  await stopManagedProcess(managedSsrServer);
}

async function writeDeviceScreenshots() {
  for (const locale of selectedLocales) {
    for (const device of selectedDevices) {
      for (const screenshot of config.deviceScreenshots ?? []) {
        const capture = config.captures.find((item) => item.id === screenshot.capture);
        if (!capture) {
          throw new Error(`Unknown device screenshot capture: ${screenshot.capture}`);
        }

        const capturePath = getDeviceScreenshotPath(locale, device, capture.id);
        if (!existsSync(capturePath)) {
          throw new Error(`Missing capture ${path.relative(repoRoot, capturePath)}.`);
        }

        const outputPath = path.join(
          outputRoot,
          locale.id,
          device.outputFilePattern.replace("{index}", String(screenshot.index)),
        );
        await ensureDir(path.dirname(outputPath));
        await copyFile(capturePath, outputPath);
        console.log(`[store-screenshots] wrote ${path.relative(repoRoot, outputPath)}`);
      }
    }
  }
}

async function captureAppRoutes(browserInstance) {
  for (const locale of selectedLocales) {
    for (const device of selectedDevices) {
      const context = await browserInstance.newContext({
        viewport: {
          width: device.viewport.width,
          height: device.viewport.height,
        },
        deviceScaleFactor: device.viewport.deviceScaleFactor,
        isMobile: device.viewport.isMobile,
        hasTouch: device.viewport.hasTouch,
        colorScheme: "dark",
      });

      try {
        for (const capture of selectedCaptures) {
          const page = await context.newPage();
          logBrowserDiagnostics(page, locale, device, capture);
          await installNativeLikeEnvironment(
            page,
            device,
            getLocalStorageSeed(capture),
          );
          const url = routeUrl(capture.path, locale);
          const capturePath = getDeviceScreenshotPath(locale, device, capture.id);
          await ensureDir(path.dirname(capturePath));

          try {
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
          } catch (error) {
            throw new Error(
              `Could not open ${url}. Run "npm run screenshots:store -- --build" ` +
                "to rebuild and start the local screenshot SSR server, or pass --base-url / STORE_SCREENSHOT_BASE_URL.\n" +
                `Original error: ${error.message}`,
            );
          }

          await applyCaptureStyles(page, device, capture);
          if (capture.waitForSelector) {
            try {
              await page.waitForSelector(capture.waitForSelector, {
                state: "visible",
                timeout: 15_000,
              });
            } catch {
              console.warn(
                `[store-screenshots] ${capture.id}: selector not found before capture: ${capture.waitForSelector}`,
              );
            }
          }

          await page.waitForTimeout(capture.settleMs ?? 800);
          await page.screenshot({
            path: capturePath,
            fullPage: false,
            animations: "disabled",
          });
          await page.close();
          console.log(
            `[store-screenshots] captured ${locale.id}/${device.id}/${capture.id}`,
          );
        }
      } finally {
        await context.close();
      }
    }
  }
}

async function composeStoreScreenshots(browserInstance) {
  const iconDataUrl = await optionalDataUrl("src/assets/icons/icon-192.webp", "image/webp");
  const permanentMarkerUrl = fileUrl("src/assets/fonts/PermanentMarker-Regular.ttf");
  const robotoUrl = fileUrl("src/assets/fonts/Roboto/Roboto-VariableFont_wdth,wght.ttf");

  for (const locale of selectedLocales) {
    const copy = await loadLocaleCopy(locale);

    for (const device of selectedDevices) {
      for (const scene of selectedScenes) {
        const layout = scene.layouts[device.id];
        if (!layout) continue;

        const outputPath = path.join(
          outputRoot,
          locale.id,
          device.outputFilePattern.replace("{index}", String(scene.index)),
        );
        await ensureDir(path.dirname(outputPath));

        const html = await buildSceneHtml({
          device,
          scene,
          layout,
          copy,
          locale,
          iconDataUrl,
          permanentMarkerUrl,
          robotoUrl,
        });
        const page = await browserInstance.newPage({
          viewport: device.output,
          deviceScaleFactor: 1,
          colorScheme: "dark",
        });
        await page.setContent(html, { waitUntil: "load" });
        await page.evaluate(() => document.fonts?.ready);
        await page.waitForTimeout(150);
        await page.screenshot({ path: outputPath, fullPage: false, animations: "disabled" });
        await page.close();
        console.log(`[store-screenshots] wrote ${path.relative(repoRoot, outputPath)}`);
      }
    }
  }
}

async function buildSceneHtml({
  device,
  scene,
  layout,
  copy,
  locale,
  iconDataUrl,
  permanentMarkerUrl,
  robotoUrl,
}) {
  const sceneCopy = copy[scene.copyKey];
  if (!sceneCopy) {
    throw new Error(`Missing copy key "${scene.copyKey}" for ${locale.id}`);
  }

  const placements = [];
  for (const placement of layout.placements) {
    const capturePath = getDeviceScreenshotPath(locale, device, placement.capture);
    if (!existsSync(capturePath)) {
      throw new Error(
        `Missing capture ${path.relative(repoRoot, capturePath)}. Run without --skip-capture first.`,
      );
    }

    placements.push(
      renderDeviceFrame({
        device,
        placement,
        imageDataUrl: await dataUrl(capturePath, "image/png"),
      }),
    );
  }

  const brand = copy.brand ?? "PK Spot";
  const text = layout.text;
  const textAlign = text.align ?? "left";
  const brandMarkup = iconDataUrl
    ? `<div class="brand"><img src="${iconDataUrl}" alt="">${escapeHtml(brand)}</div>`
    : `<div class="brand">${escapeHtml(brand)}</div>`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @font-face {
      font-family: "Permanent Marker Store";
      src: url("${permanentMarkerUrl}") format("truetype");
      font-display: block;
    }
    @font-face {
      font-family: "Roboto Store";
      src: url("${robotoUrl}") format("truetype");
      font-display: block;
    }
    * { box-sizing: border-box; }
    html, body {
      width: ${device.output.width}px;
      height: ${device.output.height}px;
      margin: 0;
      overflow: hidden;
      background: #12161f;
    }
    body {
      font-family: "Roboto Store", system-ui, sans-serif;
      color: #f7f8ff;
    }
    .canvas {
      position: relative;
      width: ${device.output.width}px;
      height: ${device.output.height}px;
      overflow: hidden;
      background:
        linear-gradient(160deg, rgba(169, 183, 255, 0.14), transparent 42%),
        linear-gradient(20deg, rgba(126, 240, 164, 0.09), transparent 45%),
        #12161f;
    }
    .brand {
      position: absolute;
      left: 72px;
      top: 70px;
      display: flex;
      align-items: center;
      gap: 16px;
      color: rgba(247, 248, 255, 0.78);
      font-size: 27px;
      font-weight: 800;
      letter-spacing: 0;
      z-index: 20;
    }
    .brand img {
      width: 54px;
      height: 54px;
      border-radius: 14px;
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.35);
    }
    .copy {
      position: absolute;
      left: ${text.x}px;
      top: ${text.y}px;
      width: ${text.width}px;
      text-align: ${textAlign};
      z-index: 20;
    }
    .title {
      margin: 0;
      color: ${scene.accent ?? "#a9b7ff"};
      font-family: "Permanent Marker Store", "Roboto Store", system-ui, sans-serif;
      font-size: ${device.id === "ipad129" ? 118 : 96}px;
      line-height: 0.9;
      letter-spacing: 0;
      text-transform: uppercase;
      text-wrap: balance;
      text-shadow: 0 10px 34px rgba(0, 0, 0, 0.45);
    }
    .subtitle {
      max-width: 940px;
      margin: 34px ${textAlign === "center" ? "auto" : "0"} 0;
      color: rgba(247, 248, 255, 0.86);
      font-size: ${device.id === "ipad129" ? 52 : 42}px;
      line-height: 1.12;
      font-weight: 800;
      letter-spacing: 0;
      text-wrap: balance;
    }
    .device {
      position: absolute;
      left: var(--x);
      top: var(--y);
      width: var(--w);
      aspect-ratio: ${device.viewport.width + device.frame.border * 2} / ${device.viewport.height + device.frame.border * 2};
      transform: rotate(var(--rotate));
      transform-origin: center;
      z-index: var(--z, 10);
      filter: drop-shadow(0 50px 60px rgba(0, 0, 0, 0.48));
    }
    .shell {
      position: absolute;
      inset: 0;
      padding: ${device.frame.border}px;
      border-radius: ${device.frame.radius}px;
      background:
        linear-gradient(145deg, #353946 0%, #0b0d13 46%, #2c303b 100%);
      box-shadow:
        inset 0 0 0 2px rgba(255, 255, 255, 0.08),
        inset 0 0 0 7px rgba(0, 0, 0, 0.74);
    }
    .screen {
      position: relative;
      width: 100%;
      height: 100%;
      aspect-ratio: ${device.viewport.width} / ${device.viewport.height};
      overflow: hidden;
      border-radius: ${Math.max(18, device.frame.radius - device.frame.border * 1.75)}px;
      background: #070910;
    }
    .screen img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
      transform: scale(var(--image-scale, 1));
      transform-origin: center;
    }
    .device.iphone .dynamic-island {
      position: absolute;
      left: 50%;
      top: ${Math.max(12, device.safeArea.top * 0.42)}px;
      width: 32%;
      height: 3.4%;
      transform: translateX(-50%);
      border-radius: 999px;
      background: #020308;
      z-index: 2;
      box-shadow: 0 2px 8px rgba(255, 255, 255, 0.12);
    }
    .device.iphone .home-indicator {
      position: absolute;
      left: 35%;
      right: 35%;
      bottom: ${Math.max(9, device.safeArea.bottom * 0.34)}px;
      height: 5px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.72);
      z-index: 2;
    }
  </style>
</head>
<body>
  <main class="canvas">
    ${brandMarkup}
    <section class="copy">
      <h1 class="title">${escapeHtml(sceneCopy.title)}</h1>
      <p class="subtitle">${escapeHtml(sceneCopy.subtitle)}</p>
    </section>
    ${placements.join("\n")}
  </main>
</body>
</html>`;
}

function renderDeviceFrame({ device, placement, imageDataUrl }) {
  const rotate = placement.rotate ?? 0;
  const z = placement.z ?? 10;
  return `<div class="device ${escapeHtml(device.frame.kind)}" style="--x: ${placement.x}px; --y: ${placement.y}px; --w: ${placement.width}px; --rotate: ${rotate}deg; --z: ${z};">
  <div class="shell">
    <div class="screen" style="--image-scale: ${placement.imageScale ?? 1};">
      <img src="${imageDataUrl}" alt="">
      ${device.frame.kind === "iphone" ? '<div class="dynamic-island"></div><div class="home-indicator"></div>' : ""}
    </div>
  </div>
</div>`;
}

async function installNativeLikeEnvironment(page, device, localStorageSeed) {
  await page.addInitScript(({ localStorageSeed, nativePlatform, safeArea }) => {
    for (const [key, value] of Object.entries(localStorageSeed)) {
      localStorage.setItem(
        key,
        typeof value === "string" ? value : JSON.stringify(value),
      );
    }

    const applySafeArea = () => {
      const root = document.documentElement;
      if (!root) return;
      root.classList.add("native-platform", `platform-${nativePlatform}`);
      root.style.setProperty("--safe-area-inset-top", `${safeArea.top}px`);
      root.style.setProperty("--safe-area-inset-right", `${safeArea.right}px`);
      root.style.setProperty("--safe-area-inset-bottom", `${safeArea.bottom}px`);
      root.style.setProperty("--safe-area-inset-left", `${safeArea.left}px`);
      root.style.setProperty("--toolbar-native-extra", `${safeArea.bottom}px`);
    };
    applySafeArea();
    document.addEventListener("DOMContentLoaded", applySafeArea, { once: true });
  }, {
    localStorageSeed,
    nativePlatform: device.nativePlatform ?? "ios",
    safeArea: device.safeArea,
  });
}

async function applyCaptureStyles(page, device, capture) {
  const hiddenSelectors = (capture.hideSelectors ?? []).join(",\n");
  await page.addStyleTag({
    content: `
      :root {
        --safe-area-inset-top: ${device.safeArea.top}px !important;
        --safe-area-inset-right: ${device.safeArea.right}px !important;
        --safe-area-inset-bottom: ${device.safeArea.bottom}px !important;
        --safe-area-inset-left: ${device.safeArea.left}px !important;
        --toolbar-native-extra: ${device.safeArea.bottom}px !important;
      }

      #app-splash-screen {
        display: none !important;
      }

      app-footer,
      footer,
      .terms-footer,
      .footer,
      .app-footer {
        display: none !important;
      }

      body {
        --nav-bar-height: calc(80px + ${device.safeArea.bottom}px) !important;
      }

      mat-toolbar {
        height: calc(80px + ${device.safeArea.bottom}px) !important;
        padding-bottom: ${device.safeArea.bottom}px !important;
      }

      ${hiddenSelectors ? `${hiddenSelectors} { visibility: hidden !important; }` : ""}
    `,
  });
}

function getLocalStorageSeed(capture) {
  return {
    acceptedVersion: "5",
    ...(config.localStorage ?? {}),
    ...(capture.localStorage ?? {}),
  };
}

function logBrowserDiagnostics(page, locale, device, capture) {
  const prefix = `[store-screenshots:${locale.id}/${device.id}/${capture.id}]`;

  page.on("console", (message) => {
    if (!["error", "warning"].includes(message.type())) return;
    console.warn(`${prefix} console ${message.type()}: ${message.text()}`);
  });

  page.on("pageerror", (error) => {
    console.warn(`${prefix} page error: ${error.message}`);
  });

  page.on("requestfailed", (request) => {
    const url = request.url();
    if (!url.includes("maps.googleapis.com") && !url.includes("gstatic.com")) {
      return;
    }

    console.warn(
      `${prefix} request failed: ${url} (${request.failure()?.errorText ?? "unknown error"})`,
    );
  });
}

function routeUrl(routeTemplate, locale) {
  const routePath = routeTemplate.replaceAll("{appLocale}", locale.appLocale);
  return new URL(routePath, baseUrl).href;
}

function getCapturePath(locale, device, captureId) {
  return path.join(captureRoot, locale.id, device.id, `${captureId}.png`);
}

function getDeviceScreenshotPath(locale, device, captureId) {
  return path.join(deviceScreenshotRoot, locale.id, device.id, `${captureId}.png`);
}

async function loadLocaleCopy(locale) {
  const localePath = path.join(
    repoRoot,
    "scripts/store-screenshots/locales",
    `${locale.id}.json`,
  );
  if (existsSync(localePath)) {
    return JSON.parse(await readFile(localePath, "utf8"));
  }

  const fallbackPath = path.join(
    repoRoot,
    "scripts/store-screenshots/locales",
    `${config.defaultLocale}.json`,
  );
  return JSON.parse(await readFile(fallbackPath, "utf8"));
}

function parseArgs(rawArgs) {
  const result = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--help" || arg === "-h") result.help = true;
    else if (arg === "--list") result.list = true;
    else if (arg === "--build") result.build = true;
    else if (arg === "--no-ssr-server") result.noSsrServer = true;
    else if (arg === "--mode") result.mode = rawArgs[++index];
    else if (arg === "--skip-capture") result.skipCapture = true;
    else if (arg === "--capture-only") result.captureOnly = true;
    else if (arg === "--base-url") result.baseUrl = rawArgs[++index];
    else if (arg === "--output-root") result.outputRoot = rawArgs[++index];
    else if (arg === "--capture-root") result.captureRoot = rawArgs[++index];
    else if (arg === "--device-screenshot-root") result.deviceScreenshotRoot = rawArgs[++index];
    else if (arg === "--locales") result.locales = rawArgs[++index]?.split(",");
    else if (arg === "--devices") result.devices = rawArgs[++index]?.split(",");
    else if (arg === "--scenes") result.scenes = rawArgs[++index]?.split(",");
    else throw new Error(`Unknown option: ${arg}`);
  }
  return result;
}

function filterByIds(items, ids, label) {
  if (!ids?.length) return items;

  const selected = items.filter((item) => ids.includes(item.id));
  const selectedIds = new Set(selected.map((item) => item.id));
  const missing = ids.filter((id) => !selectedIds.has(id));
  if (missing.length) {
    throw new Error(`Unknown ${label} id(s): ${missing.join(", ")}`);
  }
  return selected;
}

async function dataUrl(filePath, mimeType) {
  const buffer = await readFile(filePath);
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function optionalDataUrl(relativePath, mimeType) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!existsSync(absolutePath)) return null;
  return dataUrl(absolutePath, mimeType);
}

function fileUrl(relativePath) {
  return pathToFileURL(path.join(repoRoot, relativePath)).href;
}

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function printSelection() {
  console.log("Store screenshot renderer");
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Locales: ${selectedLocales.map((locale) => locale.id).join(", ")}`);
  console.log(`Devices: ${selectedDevices.map((device) => device.id).join(", ")}`);
  console.log(`Scenes: ${selectedScenes.map((scene) => scene.id).join(", ")}`);
  console.log(`Captures: ${selectedCaptures.map((capture) => capture.id).join(", ")}`);
  console.log(`Output: ${path.relative(repoRoot, outputRoot)}`);
  console.log(`Device screenshots: ${path.relative(repoRoot, deviceScreenshotRoot)}`);
  console.log(`Output mode: ${outputMode}`);
  console.log(
    `SSR server: ${shouldManageSsrServer() ? "managed from dist/pkspot" : "external"}`,
  );
}

function printHelp() {
  console.log(`Usage: node scripts/render-store-screenshots.mjs [options]

Options:
  --build                Rebuild the localized screenshot SSR bundle before rendering.
  --base-url <url>       App server URL. Defaults to config or STORE_SCREENSHOT_BASE_URL.
  --mode <mode>          Output mode: device or composed.
  --locales <ids>        Comma-separated locale ids, for example en-US,de-DE.
  --devices <ids>        Comma-separated device ids, for example iphone65,ipad129.
  --scenes <ids>         Comma-separated scene ids, for example discover,weather.
  --no-ssr-server        Do not auto-start the local SSR server from dist/pkspot.
  --skip-capture         Reuse existing files in output/store-screenshots/captures.
  --capture-only         Capture app routes without composing final store screenshots.
  --output-root <path>   Override final screenshot output folder.
  --capture-root <path>  Override raw route capture output folder.
  --list                 Print selected locales, devices, scenes, and captures.
  --help                 Show this help text.

Render from the local localized SSR build:
  npm run screenshots:store -- --locales en-US --devices iphone65

Rebuild that SSR bundle first:
  npm run screenshots:store -- --build
`);
}

async function maybeStartSsrServer() {
  if (args.skipCapture || !shouldManageSsrServer()) {
    return null;
  }

  if (args.build) {
    await runCommand(config.ssr.buildCommand, "Building localized screenshot SSR bundle");
  }

  if (await isUrlReachable(baseUrl)) {
    console.log(`[store-screenshots] using existing server at ${baseUrl}`);
    return null;
  }

  const serverScript = path.join(repoRoot, config.ssr.script);
  if (!existsSync(serverScript)) {
    throw new Error(`Missing screenshot SSR server: ${path.relative(repoRoot, serverScript)}`);
  }

  assertSelectedLocaleBuildsExist();

  const port = new URL(baseUrl).port || String(config.ssr.port);
  const appLocales = [...new Set(selectedLocales.map((locale) => locale.appLocale))];
  const child = spawn(process.execPath, [serverScript], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: port,
      STORE_SCREENSHOT_SSR_LOCALES: appLocales.join(","),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(prefixLines(chunk, "[store-screenshots:ssr] "));
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(prefixLines(chunk, "[store-screenshots:ssr] "));
  });

  await waitForManagedServer(child, baseUrl);
  return child;
}

function shouldManageSsrServer() {
  return (
    !args.noSsrServer &&
    !args.baseUrl &&
    !process.env["STORE_SCREENSHOT_BASE_URL"] &&
    Boolean(config.ssr?.script)
  );
}

function assertSelectedLocaleBuildsExist() {
  const missing = selectedLocales
    .map((locale) => locale.appLocale)
    .filter((locale) => {
      return (
        !existsSync(path.join(repoRoot, "dist/pkspot/browser", locale)) ||
        !existsSync(path.join(repoRoot, "dist/pkspot/server", locale, "server.mjs"))
      );
    });

  if (missing.length) {
    throw new Error(
      `Missing built locale(s): ${[...new Set(missing)].join(", ")}. ` +
        `Run "npm run screenshots:store -- --build" first.`,
    );
  }
}

async function runCommand(command, label) {
  if (!Array.isArray(command) || command.length === 0) {
    throw new Error("Invalid screenshot build command in config.");
  }

  console.log(`[store-screenshots] ${label}...`);
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: repoRoot,
      stdio: "inherit",
    });
    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`${command.join(" ")} exited with ${code}`));
    });
  });
}

async function waitForManagedServer(child, url) {
  const startedAt = Date.now();
  const timeoutMs = 20_000;

  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`Screenshot SSR server exited with ${child.exitCode}`);
    }
    if (await isUrlReachable(url)) {
      return;
    }
    await sleep(250);
  }

  throw new Error(`Timed out waiting for screenshot SSR server at ${url}`);
}

async function isUrlReachable(url) {
  return new Promise((resolvePromise) => {
    const req = http.get(url, (res) => {
      res.resume();
      res.on("end", () => resolvePromise(true));
    });
    req.setTimeout(1000, () => {
      req.destroy();
      resolvePromise(false);
    });
    req.on("error", () => resolvePromise(false));
  });
}

async function stopManagedProcess(child) {
  if (!child) return;

  await new Promise((resolvePromise) => {
    child.once("exit", resolvePromise);
    child.kill("SIGTERM");
    setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolvePromise();
    }, 2000);
  });
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function prefixLines(chunk, prefix) {
  return String(chunk)
    .split("\n")
    .map((line, index, lines) => {
      if (line.length === 0 && index === lines.length - 1) return "";
      return `${prefix}${line}`;
    })
    .join("\n");
}

async function launchBrowser() {
  const preferredChannel = process.env["STORE_SCREENSHOT_BROWSER_CHANNEL"] ?? "chrome";

  try {
    return await chromium.launch({ channel: preferredChannel });
  } catch (channelError) {
    if (process.env["STORE_SCREENSHOT_BROWSER_CHANNEL"]) {
      throw channelError;
    }

    try {
      return await chromium.launch();
    } catch (managedBrowserError) {
      throw new Error(
        `Could not start Playwright Chromium. Tried system Chrome first, then the managed Playwright browser.\n\n` +
          `System Chrome error: ${channelError.message}\n\n` +
          `Managed browser error: ${managedBrowserError.message}\n\n` +
          `Install Playwright's browser with "npx playwright install chromium", or set STORE_SCREENSHOT_BROWSER_CHANNEL to an installed Chromium channel.`,
      );
    }
  }
}
