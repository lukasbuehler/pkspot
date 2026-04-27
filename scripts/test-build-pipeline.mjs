import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const serverPort = process.env.PKSPOT_TEST_BUILD_PORT || "4180";
const baseUrl = `http://localhost:${serverPort}`;
const nvmNodeDir = path.join(process.env.HOME || "", ".nvm", "versions", "node");

const angularJsonPath = path.join(repoRoot, "angular.json");
const srcProxyServerPath = path.join(repoRoot, "src", "proxy-server.mjs");
const srcProxyHelpersPath = path.join(
  repoRoot,
  "src",
  "proxy-server-helpers.mjs"
);
const distServerDir = path.join(repoRoot, "dist", "pkspot", "server");
const distBrowserDir = path.join(repoRoot, "dist", "pkspot", "browser");
const distProxyServerPath = path.join(distServerDir, "server.mjs");
const distProxyHelpersPath = path.join(
  distServerDir,
  "proxy-server-helpers.mjs"
);
const buildInfoPath = path.join(distServerDir, "build-info.mjs");
const sharedAssetPath = path.join(
  distBrowserDir,
  "en",
  "assets",
  "fonts",
  "icons_list.txt"
);

function getPreferredNodeBinDir() {
  const currentMajor = Number.parseInt(process.versions.node.split(".")[0] || "", 10);
  if (Number.isInteger(currentMajor) && currentMajor % 2 === 0) {
    return null;
  }

  if (!existsSync(nvmNodeDir)) {
    return null;
  }

  const preferredMajors = [22, 20, 18];
  const installedVersions = readdirSync(nvmNodeDir)
    .filter((entry) => /^v\d+\.\d+\.\d+$/.test(entry))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

  for (const preferredMajor of preferredMajors) {
    const match = installedVersions.find((version) =>
      version.startsWith(`v${preferredMajor}.`)
    );
    if (match) {
      const binDir = path.join(nvmNodeDir, match, "bin");
      if (existsSync(path.join(binDir, process.platform === "win32" ? "node.exe" : "node"))) {
        return binDir;
      }
    }
  }

  return null;
}

const preferredNodeBinDir = getPreferredNodeBinDir();
const npmCommand = preferredNodeBinDir
  ? path.join(preferredNodeBinDir, process.platform === "win32" ? "npm.cmd" : "npm")
  : process.platform === "win32"
    ? "npm.cmd"
    : "npm";
const runtimeEnv = preferredNodeBinDir
  ? {
      ...process.env,
      PATH: `${preferredNodeBinDir}${path.delimiter}${process.env.PATH || ""}`,
    }
  : process.env;

function runNpmScript(scriptName) {
  console.log(`\n==> npm run ${scriptName}`);
  if (preferredNodeBinDir) {
    console.log(`Using Node runtime from ${preferredNodeBinDir}`);
  }
  execFileSync(npmCommand, ["run", scriptName], {
    cwd: repoRoot,
    stdio: "inherit",
    env: runtimeEnv,
  });
}

function getSupportedLanguageCodes() {
  const angularConfig = JSON.parse(readFileSync(angularJsonPath, "utf8"));
  const projectName =
    angularConfig.defaultProject || Object.keys(angularConfig.projects)[0];
  const project = angularConfig.projects[projectName];

  assert.ok(project?.i18n, "Expected i18n configuration in angular.json");

  const sourceLocale = project.i18n.sourceLocale;
  const locales = project.i18n.locales || {};
  const codes = [];

  if (typeof sourceLocale === "string") {
    codes.push(sourceLocale);
  } else if (sourceLocale?.code) {
    codes.push(sourceLocale.code);
  }

  codes.push(...Object.keys(locales));
  return [...new Set(codes)];
}

function assertFileExists(filePath, description) {
  assert.ok(existsSync(filePath), `${description} missing at ${filePath}`);
}

function assertBrowserEntryExists(locale) {
  const indexHtmlPath = path.join(distBrowserDir, locale, "index.html");
  const indexCsrHtmlPath = path.join(distBrowserDir, locale, "index.csr.html");

  assert.ok(
    existsSync(indexHtmlPath) || existsSync(indexCsrHtmlPath),
    `Browser entry for ${locale} missing at ${indexHtmlPath} or ${indexCsrHtmlPath}`
  );
}

async function waitForServer(url, serverProcess, logBuffer, timeoutMs = 60_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (serverProcess.exitCode !== null) {
      throw new Error(
        `SSR server exited early with code ${serverProcess.exitCode}\n${logBuffer.join("")}`
      );
    }

    try {
      const response = await fetch(url, {
        redirect: "manual",
        headers: { "cache-control": "no-cache" },
      });
      if (response.status > 0) {
        return;
      }
    } catch {
      // Server not ready yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `Timed out waiting for SSR server at ${url}\n${logBuffer.join("")}`
  );
}

async function main() {
  const supportedLanguageCodes = getSupportedLanguageCodes();

  runNpmScript("build");

  console.log("\n==> verifying copied server files and build info");
  assertFileExists(distProxyServerPath, "Copied proxy server");
  assertFileExists(distProxyHelpersPath, "Copied proxy server helpers");
  assertFileExists(buildInfoPath, "Generated build info");
  assert.equal(
    readFileSync(distProxyServerPath, "utf8"),
    readFileSync(srcProxyServerPath, "utf8"),
    "dist server.mjs should match src/proxy-server.mjs"
  );
  assert.equal(
    readFileSync(distProxyHelpersPath, "utf8"),
    readFileSync(srcProxyHelpersPath, "utf8"),
    "dist proxy-server-helpers.mjs should match the source helper file"
  );

  const buildInfoModule = await import(
    `${pathToFileURL(buildInfoPath).href}?ts=${Date.now()}`
  );

  assert.deepEqual(
    buildInfoModule.SUPPORTED_LANGUAGE_CODES,
    supportedLanguageCodes,
    "build-info.mjs should export the supported languages from angular.json"
  );
  assert.ok(
    !Number.isNaN(Date.parse(buildInfoModule.LAST_MODIFIED)),
    "LAST_MODIFIED should be a valid HTTP date string"
  );

  console.log("\n==> verifying localized browser and server output");
  for (const lang of supportedLanguageCodes) {
    assertBrowserEntryExists(lang);
    assertFileExists(
      path.join(distServerDir, lang, "server.mjs"),
      `SSR server bundle for ${lang}`
    );
  }
  assertFileExists(sharedAssetPath, "Shared icons asset manifest");

  console.log("\n==> starting SSR smoke server");
  const serverLogs = [];
  const serverProcess = spawn(npmCommand, ["run", "serve:ssr"], {
    cwd: repoRoot,
    env: {
      ...runtimeEnv,
      PORT: serverPort,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const collectLogs = (chunk) => {
    const text = chunk.toString();
    serverLogs.push(text);
    process.stdout.write(text);
  };

  serverProcess.stdout.on("data", collectLogs);
  serverProcess.stderr.on("data", collectLogs);

  try {
    await waitForServer(`${baseUrl}/robots.txt`, serverProcess, serverLogs);

    console.log("\n==> exercising SSR and static asset routes");
    const redirectResponse = await fetch(`${baseUrl}/`, {
      redirect: "manual",
      headers: {
        "accept-language": "de-CH,de;q=0.9,en;q=0.8",
      },
    });
    assert.equal(redirectResponse.status, 301, "Root should redirect by locale");
    assert.equal(
      redirectResponse.headers.get("location"),
      "/de-CH",
      "Root redirect should honor supported Accept-Language values"
    );

    const serverLogOffset = serverLogs.length;
    const ssrResponse = await fetch(`${baseUrl}/en/`, { redirect: "manual" });
    assert.equal(ssrResponse.status, 200, "English SSR route should render");
    const ssrHtml = await ssrResponse.text();
    assert.match(ssrHtml, /<!doctype html>/i, "SSR should return HTML");
    assert.match(ssrHtml, /<base href="\/en\/"/i, "SSR should render locale base href");
    assert.match(
      ssrHtml,
      /<app-root|pkspot/i,
      "SSR HTML should contain the app shell"
    );
    const ssrLogs = serverLogs.slice(serverLogOffset).join("");
    assert.doesNotMatch(
      ssrLogs,
      /Falling back to client side rendering|is not allowed/i,
      "SSR request should not fall back to client-side rendering"
    );

    const socialPreviewResponse = await fetch(
      `${baseUrl}/en/map/josefhalle`,
      {
        redirect: "manual",
        headers: {
          "user-agent": "WhatsApp/2.24.1 A",
        },
      }
    );
    assert.equal(
      socialPreviewResponse.status,
      200,
      "Spot SSR route should render for social crawlers"
    );
    const socialPreviewHtml = await socialPreviewResponse.text();
    assert.match(
      socialPreviewHtml,
      /<meta property="og:title"[^>]+content="Sportzentrum Josef - Zürich \| PK Spot"/,
      "Spot SSR HTML should include the spot-specific OpenGraph title"
    );
    assert.match(
      socialPreviewHtml,
      /<meta property="og:url"[^>]+content="https:\/\/pkspot\.app\/en\/map\/josefhalle"/,
      "Spot SSR HTML should include the canonical spot OpenGraph URL"
    );
    assert.doesNotMatch(
      socialPreviewHtml,
      /<meta property="og:title"[^>]+content="PK Spot - The spot for Parkour and Freerunning"/,
      "Spot SSR HTML should not fall back to the default OpenGraph title"
    );

    const robotsResponse = await fetch(`${baseUrl}/robots.txt`);
    assert.equal(robotsResponse.status, 200, "robots.txt should be served");
    const robotsText = await robotsResponse.text();
    assert.match(robotsText, /User-agent/i, "robots.txt should have content");

    const faviconResponse = await fetch(`${baseUrl}/favicon.ico`);
    assert.equal(faviconResponse.status, 200, "Root favicon should be served");
    const faviconBytes = await faviconResponse.arrayBuffer();
    assert.ok(faviconBytes.byteLength > 0, "Favicon response should not be empty");

    const assetResponse = await fetch(
      `${baseUrl}/en/assets/fonts/icons_list.txt`
    );
    assert.equal(
      assetResponse.status,
      200,
      "Language-specific assets should be served"
    );
    const assetText = await assetResponse.text();
    assert.ok(
      assetText.includes("location_on") || assetText.length > 0,
      "icons_list.txt should contain icon names"
    );

    console.log("\nBuild pipeline smoke test passed.");
  } finally {
    serverProcess.kill("SIGTERM");
    await new Promise((resolve) => {
      serverProcess.once("exit", () => resolve());
      setTimeout(() => {
        if (serverProcess.exitCode === null) {
          serverProcess.kill("SIGKILL");
        }
      }, 5_000);
    });
  }
}

main().catch((error) => {
  console.error("\nBuild pipeline smoke test failed.");
  console.error(error);
  process.exitCode = 1;
});
