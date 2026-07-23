import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { CURRENT_TERMS_VERSION } from "../../src/app/services/consent-version";

type DenseMapVariant =
  | "communities-only"
  | "custom-only"
  | "empty"
  | "events-only"
  | "full"
  | "no-communities";

type LongTaskMetric = {
  attribution: string[];
  duration: number;
  startTime: number;
};

type DenseMapRuntimeMetrics = {
  averageFrameGapMs: number;
  framesOver50Ms: number;
  framesOver100Ms: number;
  longTaskCount: number;
  longTaskMaxMs: number;
  longTaskTotalMs: number;
  maxFrameGapMs: number;
  sampleCount: number;
};

type DenseMapMarkerCounts = {
  angularMarkerCount: number;
  eventMarkerCount: number;
  googleMarkerElementCount: number;
  mapAdvancedMarkerElementCount: number;
};

type DenseMapMetrics = {
  browserDiagnostics: string[];
  counts: DenseMapMarkerCounts;
  interaction: DenseMapRuntimeMetrics;
  mapReadyMs: number;
  startup: DenseMapRuntimeMetrics;
  variant: DenseMapVariant;
};

const DENSE_MAP_VARIANTS: readonly {
  minAngularMarkers: number;
  variant: DenseMapVariant;
}[] = [
  { variant: "full", minAngularMarkers: 900 },
  { variant: "no-communities", minAngularMarkers: 700 },
  { variant: "custom-only", minAngularMarkers: 500 },
  { variant: "events-only", minAngularMarkers: 100 },
  { variant: "communities-only", minAngularMarkers: 100 },
  { variant: "empty", minAngularMarkers: 0 },
];

async function installDenseMapPerformanceProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const perfWindow = window as Window & {
      __pkspotDenseMapPerf?: {
        frameGaps: number[];
        longTasks: LongTaskMetric[];
        stopFrames: boolean;
      };
    };

    perfWindow.__pkspotDenseMapPerf = {
      frameGaps: [],
      longTasks: [],
      stopFrames: false,
    };

    let previousFrameTime = performance.now();
    const sampleFrame = (frameTime: number) => {
      const state = perfWindow.__pkspotDenseMapPerf;
      if (!state || state.stopFrames) return;

      state.frameGaps.push(frameTime - previousFrameTime);
      previousFrameTime = frameTime;
      requestAnimationFrame(sampleFrame);
    };
    requestAnimationFrame(sampleFrame);

    try {
      new PerformanceObserver((entryList) => {
        const state = perfWindow.__pkspotDenseMapPerf;
        if (!state) return;

        entryList.getEntries().forEach((entry) => {
          const longTaskEntry = entry as PerformanceEntry & {
            attribution?: { name?: string }[];
          };

          state.longTasks.push({
            attribution:
              longTaskEntry.attribution?.map(
                (attribution) => attribution.name ?? "",
              ) ?? [],
            duration: entry.duration,
            startTime: entry.startTime,
          });
        });
      }).observe({ type: "longtask", buffered: true });
    } catch {
      // Chromium exposes Long Tasks; other engines may not.
    }
  });
}

async function readAndResetDenseMapRuntimeMetrics(
  page: Page,
): Promise<DenseMapRuntimeMetrics> {
  return page.evaluate(() => {
    const perfWindow = window as Window & {
      __pkspotDenseMapPerf?: {
        frameGaps: number[];
        longTasks: LongTaskMetric[];
        stopFrames: boolean;
      };
    };
    const state = perfWindow.__pkspotDenseMapPerf ?? {
      frameGaps: [],
      longTasks: [],
      stopFrames: true,
    };

    const frameGaps = state.frameGaps.filter((gap) => Number.isFinite(gap));
    const maxFrameGapMs = frameGaps.length ? Math.max(...frameGaps) : 0;
    const totalFrameGapMs = frameGaps.reduce((sum, gap) => sum + gap, 0);
    const longTaskDurations = state.longTasks.map((task) => task.duration);
    const metrics = {
      sampleCount: frameGaps.length,
      maxFrameGapMs,
      averageFrameGapMs: frameGaps.length
        ? totalFrameGapMs / frameGaps.length
        : 0,
      framesOver50Ms: frameGaps.filter((gap) => gap > 50).length,
      framesOver100Ms: frameGaps.filter((gap) => gap > 100).length,
      longTaskCount: state.longTasks.length,
      longTaskMaxMs: longTaskDurations.length
        ? Math.max(...longTaskDurations)
        : 0,
      longTaskTotalMs: longTaskDurations.reduce(
        (sum, duration) => sum + duration,
        0,
      ),
    };

    state.frameGaps = [];
    state.longTasks = [];
    return metrics;
  });
}

async function collectDenseMapMarkerCounts(
  page: Page,
): Promise<DenseMapMarkerCounts> {
  return {
    angularMarkerCount: await page
      .locator("app-advanced-map-marker, app-event-dot-marker")
      .count(),
    eventMarkerCount: await page.locator("app-event-dot-marker").count(),
    googleMarkerElementCount: await page.locator("gmp-advanced-marker").count(),
    mapAdvancedMarkerElementCount: await page
      .locator("map-advanced-marker")
      .count(),
  };
}

async function runDenseMapVariant(
  page: Page,
  variant: DenseMapVariant,
  minAngularMarkers: number,
): Promise<DenseMapMetrics> {
  const browserDiagnostics: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      browserDiagnostics.push(`[console:${message.type()}] ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    browserDiagnostics.push(`[pageerror] ${error.message}`);
  });

  await page.addInitScript(
    ({ acceptedVersion, selectedVariant }) => {
      localStorage.setItem("acceptedVersion", acceptedVersion);
      localStorage.setItem("pkspotDenseMapPerformance", "1");
      localStorage.setItem("pkspotDenseMapPerformanceVariant", selectedVariant);
    },
    {
      acceptedVersion: CURRENT_TERMS_VERSION,
      selectedVariant: variant,
    },
  );
  await installDenseMapPerformanceProbe(page);

  const startedAt = Date.now();
  await page.goto("/de/map", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator("app-google-map-2d")).toBeVisible({
    timeout: 20_000,
  });
  if (minAngularMarkers > 0) {
    await page.waitForFunction(
      (minimumMarkers) =>
        document.querySelectorAll(
          "app-advanced-map-marker, app-event-dot-marker",
        ).length >= minimumMarkers,
      minAngularMarkers,
      { timeout: 20_000 },
    );
  }
  const mapReadyMs = Date.now() - startedAt;
  const startup = await readAndResetDenseMapRuntimeMetrics(page);

  const mapBounds = await page.locator("app-google-map-2d").boundingBox();
  expect(mapBounds).not.toBeNull();
  if (!mapBounds) {
    throw new Error("Map bounds were not available for dense map perf test.");
  }

  const centerX = mapBounds.x + mapBounds.width / 2;
  const centerY = mapBounds.y + mapBounds.height / 2;

  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  for (let step = 0; step < 16; step += 1) {
    await page.mouse.move(centerX + 10 * step, centerY + 6 * step);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();

  await page.mouse.wheel(0, -450);
  await page.waitForTimeout(250);
  await page.mouse.wheel(0, 450);
  await page.waitForTimeout(1_000);

  return {
    browserDiagnostics,
    counts: await collectDenseMapMarkerCounts(page),
    interaction: await readAndResetDenseMapRuntimeMetrics(page),
    mapReadyMs,
    startup,
    variant,
  };
}

test.describe("@perf Dense map performance", () => {
  test("measures dense marker layer variants", async ({ browser }, testInfo) => {
    const results: DenseMapMetrics[] = [];

    for (const { minAngularMarkers, variant } of DENSE_MAP_VARIANTS) {
      const page = await browser.newPage();
      try {
        const metrics = await runDenseMapVariant(
          page,
          variant,
          minAngularMarkers,
        );
        results.push(metrics);
        console.log("[dense-map-perf]", JSON.stringify(metrics));
      } finally {
        await page.close();
      }
    }

    await testInfo.attach("dense-map-performance.json", {
      body: JSON.stringify(results, null, 2),
      contentType: "application/json",
    });

    const full = results.find((result) => result.variant === "full");
    expect(full).toBeDefined();
    if (!full) return;

    expect(full.counts.angularMarkerCount).toBeGreaterThanOrEqual(900);
    expect(full.interaction.framesOver100Ms).toBeLessThanOrEqual(12);
    expect(full.interaction.longTaskCount).toBeLessThanOrEqual(40);
  });
});
