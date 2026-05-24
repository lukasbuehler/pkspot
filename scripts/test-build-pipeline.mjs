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

function assertCrawlerSurface(html, routeLabel, expected = {}) {
  assert.match(html, /<!doctype html>/i, `${routeLabel} should return HTML`);
  assert.match(
    html,
    /<meta property="og:title"[^>]+content="[^"]+"/,
    `${routeLabel} should include an OpenGraph title`
  );
  assert.match(
    html,
    /<meta property="og:image"[^>]+content="https:\/\/[^"]+"/,
    `${routeLabel} should include an absolute OpenGraph image`
  );
  assert.match(
    html,
    /<meta property="og:url"[^>]+content="https:\/\/pkspot\.app\/en\/[^"]+"/,
    `${routeLabel} should include an absolute OpenGraph URL`
  );
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/pkspot\.app\/en\/[^"]+"/,
    `${routeLabel} should include a canonical link`
  );
  assert.match(
    html,
    /<script type="application\/ld\+json"[^>]*>/,
    `${routeLabel} should include structured data`
  );

  if (expected.title) {
    assert.match(
      html,
      expected.title,
      `${routeLabel} should include the expected title signal`
    );
  }
  if (expected.ogUrl) {
    assert.match(
      html,
      expected.ogUrl,
      `${routeLabel} should include the expected OpenGraph URL`
    );
  }
  if (expected.body) {
    assert.match(
      html,
      expected.body,
      `${routeLabel} should include the expected body content`
    );
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractLocalBrowserAssetUrls(html, locale) {
  const assetUrls = new Set();
  const htmlWithoutComments = html.replace(/<!--[\s\S]*?-->/g, "");
  const attributePattern = /\b(?:href|src)=["']([^"']+)["']/gi;
  let match;

  while ((match = attributePattern.exec(htmlWithoutComments)) !== null) {
    const rawUrl = match[1];
    if (
      rawUrl.startsWith("http://") ||
      rawUrl.startsWith("https://") ||
      rawUrl.startsWith("//") ||
      rawUrl.startsWith("data:") ||
      rawUrl.startsWith("#")
    ) {
      continue;
    }

    const url = new URL(rawUrl, `${baseUrl}/${locale}/`);
    if (url.origin !== baseUrl || !url.pathname.startsWith(`/${locale}/`)) {
      continue;
    }

    if (/\.(?:css|js|webmanifest)$/u.test(url.pathname)) {
      assetUrls.add(`${url.pathname}${url.search}`);
    }
  }

  return [...assetUrls].sort();
}

function assertSsrCacheHeaders(response, description) {
  assert.equal(
    response.headers.get("cache-control"),
    "public, max-age=0, must-revalidate",
    `${description} should require revalidation`
  );
  assert.ok(
    !Number.isNaN(Date.parse(response.headers.get("last-modified") || "")),
    `${description} should include a valid Last-Modified header`
  );
}

function assertImmutableAssetCacheHeaders(response, assetUrl) {
  assert.equal(
    response.headers.get("cache-control"),
    "public, max-age=31536000, immutable",
    `Browser asset should be immutable: ${assetUrl}`
  );
}

async function assertBrowserAssetsLoad(html, locale, serverLogs, serverLogOffset) {
  const assetUrls = extractLocalBrowserAssetUrls(html, locale);
  assert.ok(
    assetUrls.length > 0,
    `${locale} SSR HTML should reference local browser scripts or styles`
  );

  for (const assetUrl of assetUrls) {
    const response = await fetch(`${baseUrl}${assetUrl}`, {
      redirect: "manual",
    });
    assert.equal(
      response.status,
      200,
      `${locale} browser asset referenced by SSR HTML should be served: ${assetUrl}`
    );
    assertImmutableAssetCacheHeaders(response, assetUrl);
    assert.ok(
      (await response.arrayBuffer()).byteLength > 0,
      `${locale} browser asset referenced by SSR HTML should not be empty: ${assetUrl}`
    );
  }

  const logs = serverLogs.slice(serverLogOffset).join("");
  assert.doesNotMatch(
    logs,
    /Failed to serve|Asset not found|File not found|ENOENT/i,
    `${locale} SSR server should not log static asset serving errors`
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
      NG_ALLOWED_HOSTS: "pkspot.app",
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

    for (const locale of supportedLanguageCodes) {
      const serverLogOffset = serverLogs.length;
      const ssrResponse = await fetch(`${baseUrl}/${locale}/`, {
        redirect: "manual",
      });
      assert.equal(
        ssrResponse.status,
        200,
        `${locale} SSR route should render`
      );
      assertSsrCacheHeaders(ssrResponse, `${locale} SSR route`);
      const ssrHtml = await ssrResponse.text();
      assert.match(ssrHtml, /<!doctype html>/i, `${locale} SSR should return HTML`);
      assert.match(
        ssrHtml,
        new RegExp(`<base href="/${escapeRegExp(locale)}/"`, "i"),
        `${locale} SSR should render locale base href`
      );
      assert.match(
        ssrHtml,
        /<app-root|pkspot/i,
        `${locale} SSR HTML should contain the app shell`
      );
      const ssrLogs = serverLogs.slice(serverLogOffset).join("");
      assert.doesNotMatch(
        ssrLogs,
        /Falling back to client side rendering|is not allowed/i,
        `${locale} SSR request should not fall back to client-side rendering`
      );
      await assertBrowserAssetsLoad(ssrHtml, locale, serverLogs, serverLogOffset);

      const staleHtmlRevalidationResponse = await fetch(`${baseUrl}/${locale}/`, {
        redirect: "manual",
        headers: {
          "if-modified-since": new Date(Date.now() + 86_400_000).toUTCString(),
        },
      });
      assert.equal(
        staleHtmlRevalidationResponse.status,
        200,
        `${locale} SSR HTML should render fresh content instead of returning 304 from the proxy`
      );
      assertSsrCacheHeaders(
        staleHtmlRevalidationResponse,
        `${locale} revalidated SSR route`
      );
    }

    const socialPreviewResponse = await fetch(
      `${baseUrl}/en/map/spots/josefhalle`,
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
    assertCrawlerSurface(socialPreviewHtml, "Spot SSR route", {
      title: /Sportzentrum Josef - Zürich \| PK Spot/,
      ogUrl:
        /<meta property="og:url"[^>]+content="https:\/\/pkspot\.app\/en\/map\/spots\/josefhalle"/,
      body: /Sportzentrum Josef/i,
    });
    assert.match(
      socialPreviewHtml,
      /<meta property="og:title"[^>]+content="Sportzentrum Josef - Zürich \| PK Spot"/,
      "Spot SSR HTML should include the spot-specific OpenGraph title"
    );
    assert.match(
      socialPreviewHtml,
      /<meta property="og:url"[^>]+content="https:\/\/pkspot\.app\/en\/map\/spots\/josefhalle"/,
      "Spot SSR HTML should include the canonical spot OpenGraph URL"
    );
    assert.doesNotMatch(
      socialPreviewHtml,
      /<meta property="og:title"[^>]+content="PK Spot - The spot for Parkour and Freerunning"/,
      "Spot SSR HTML should not fall back to the default OpenGraph title"
    );

    const communityPreviewResponse = await fetch(
      `${baseUrl}/en/map/communities/switzerland`,
      {
        redirect: "manual",
        headers: {
          "user-agent": "WhatsApp/2.24.1 A",
        },
      }
    );
    assert.equal(
      communityPreviewResponse.status,
      200,
      "Community SSR route should render for social crawlers"
    );
    const communityPreviewHtml = await communityPreviewResponse.text();
    assertCrawlerSurface(communityPreviewHtml, "Community SSR route", {
      title: /Switzerland/i,
      ogUrl:
        /<meta property="og:url"[^>]+content="https:\/\/pkspot\.app\/en\/map\/communities\/switzerland"/,
      body: /Switzerland/i,
    });

    const eventsPageResponse = await fetch(`${baseUrl}/en/events`, {
      redirect: "manual",
      headers: {
        "user-agent": "WhatsApp/2.24.1 A",
      },
    });
    assert.equal(
      eventsPageResponse.status,
      200,
      "Events SSR route should render for social crawlers"
    );
    const eventsPageHtml = await eventsPageResponse.text();
    assert.match(
      eventsPageHtml,
      /Swiss Jam 2025/,
      "Events SSR HTML should include rendered event cards"
    );
    assert.doesNotMatch(
      eventsPageHtml,
      /Loading events/,
      "Events SSR HTML should not remain in the loading state"
    );

    const eventPreviewResponse = await fetch(
      `${baseUrl}/en/events/swissjam25`,
      {
        redirect: "manual",
        headers: {
          "user-agent": "WhatsApp/2.24.1 A",
        },
      }
    );
    assert.equal(
      eventPreviewResponse.status,
      200,
      "Event SSR route should render for social crawlers"
    );
    const eventPreviewHtml = await eventPreviewResponse.text();
    assertCrawlerSurface(eventPreviewHtml, "Event SSR route", {
      title: /Swiss Jam 2025 \| PK Spot/,
      ogUrl:
        /<meta property="og:url"[^>]+content="https:\/\/pkspot\.app\/en\/events\/swissjam25"/,
      body: /Swiss Jam 2025/,
    });
    assert.match(
      eventPreviewHtml,
      /<meta property="og:title"[^>]+content="Swiss Jam 2025 \| PK Spot"/,
      "Event SSR HTML should include the event-specific OpenGraph title"
    );
    assert.match(
      eventPreviewHtml,
      /<meta property="og:url"[^>]+content="https:\/\/pkspot\.app\/en\/events\/swissjam25"/,
      "Event SSR HTML should include the canonical event OpenGraph URL"
    );
    assert.doesNotMatch(
      eventPreviewHtml,
      /<meta property="og:url"[^>]+content="https:\/\/pkspot\.app\/en\/events"/,
      "Event SSR HTML should not fall back to the generic events OpenGraph URL"
    );

    const profilePreviewResponse = await fetch(`${baseUrl}/en/u/lukas`, {
      redirect: "manual",
      headers: {
        "user-agent": "WhatsApp/2.24.1 A",
      },
    });
    assert.equal(
      profilePreviewResponse.status,
      200,
      "Profile SSR route should render for social crawlers"
    );
    const profilePreviewHtml = await profilePreviewResponse.text();
    assertCrawlerSurface(profilePreviewHtml, "Profile SSR route", {
      title: /\| PK Spot/,
      ogUrl:
        /<meta property="og:url"[^>]+content="https:\/\/pkspot\.app\/en\/u\/lukas"/,
      body: /profile|spots|activity|Lukas/i,
    });

    const notFoundResponse = await fetch(
      `${baseUrl}/en/this-route-should-not-exist`,
      {
        redirect: "manual",
        headers: {
          "user-agent": "WhatsApp/2.24.1 A",
        },
      }
    );
    assert.equal(
      notFoundResponse.status,
      404,
      "Unknown SSR routes should return a real 404 status"
    );
    const notFoundHtml = await notFoundResponse.text();
    assert.match(
      notFoundHtml,
      /not found|404/i,
      "Unknown SSR route should render a not-found surface"
    );

    const robotsResponse = await fetch(`${baseUrl}/robots.txt`);
    assert.equal(robotsResponse.status, 200, "robots.txt should be served");
    assertSsrCacheHeaders(robotsResponse, "robots.txt");
    const robotsText = await robotsResponse.text();
    assert.match(robotsText, /User-agent/i, "robots.txt should have content");

    const faviconResponse = await fetch(`${baseUrl}/favicon.ico`);
    assert.equal(faviconResponse.status, 200, "Root favicon should be served");
    assertImmutableAssetCacheHeaders(faviconResponse, "/favicon.ico");
    const faviconBytes = await faviconResponse.arrayBuffer();
    assert.ok(faviconBytes.byteLength > 0, "Favicon response should not be empty");

    for (const locale of supportedLanguageCodes) {
      const assetUrl = `/${locale}/assets/fonts/icons_list.txt`;
      const assetResponse = await fetch(`${baseUrl}${assetUrl}`);
      assert.equal(
        assetResponse.status,
        200,
        `${locale} language-specific assets should be served`
      );
      assertImmutableAssetCacheHeaders(assetResponse, assetUrl);
      const assetText = await assetResponse.text();
      assert.ok(
        assetText.includes("location_on") || assetText.length > 0,
        `${locale} icons_list.txt should contain icon names`
      );
    }

    console.log("\n==> verifying hostname validation and proxy trust");

    const runCurl = (args) => {
      return execFileSync("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", ...args]).toString();
    };

    // 1. Verify that the configured allowed host works
    const allowedHostStatus = runCurl(["-H", "Host: pkspot.app", `${baseUrl}/en/`]);
    assert.equal(
      allowedHostStatus,
      "200",
      "Should allow request with configured Host: pkspot.app"
    );

    // 2. Verify that localhost is still allowed by default
    const localhostStatus = runCurl(["-H", "Host: localhost", `${baseUrl}/en/`]);
    assert.equal(
      localhostStatus,
      "200",
      "Should allow request with Host: localhost"
    );

    // 3. Verify that an unauthorized host is BLOCKED (returns 500)
    const unauthorizedHostStatus = runCurl(["-H", "Host: unauthorized.example.com", `${baseUrl}/en/`]);
    assert.equal(
      unauthorizedHostStatus,
      "500",
      "Should block request with unauthorized Host"
    );

    // 4. Verify that proxy trust works: internal host + X-Forwarded-Host: pkspot.app
    console.log(
      "Verifying X-Forwarded-Host (this requires server.ts to use req.get('host'))"
    );
    const proxyStatus = runCurl([
      "-H", "Host: t-2975313843---pkspot-nbklb32npa-ez.a.run.app",
      "-H", "X-Forwarded-Host: pkspot.app",
      `${baseUrl}/en/`
    ]);
    assert.equal(
      proxyStatus,
      "200",
      "Should allow request with internal Host if X-Forwarded-Host is in allowed list"
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
