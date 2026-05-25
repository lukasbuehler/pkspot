import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { MapPage } from "../pages/map.page";

type LongTaskMetric = {
  duration: number;
  startTime: number;
};

type FrameMetrics = {
  sampleCount: number;
  maxFrameGapMs: number;
  averageFrameGapMs: number;
  framesOver50Ms: number;
  framesOver100Ms: number;
};

type MapPerformanceMetrics = FrameMetrics & {
  mapReadyMs: number;
  markerCount: number;
  longTaskCount: number;
  longTaskMaxMs: number;
  longTaskTotalMs: number;
  clusterLikeRequestCount: number;
  searchRequestCount: number;
  firestoreRequestCount: number;
  googleMapsRequestCount: number;
};

const MAP_READY_BUDGET_MS = Number(
  process.env["PKSPOT_MAP_READY_BUDGET_MS"] ?? 10_000
);
const MAX_FRAME_GAP_BUDGET_MS = Number(
  process.env["PKSPOT_MAP_MAX_FRAME_GAP_MS"] ?? 500
);
const FRAMES_OVER_100_BUDGET = Number(
  process.env["PKSPOT_MAP_FRAMES_OVER_100_BUDGET"] ?? 6
);
const LONG_TASK_COUNT_BUDGET = Number(
  process.env["PKSPOT_MAP_LONG_TASK_COUNT_BUDGET"] ?? 20
);

function isClusterLikeRequest(url: string): boolean {
  const normalizedUrl = url.toLowerCase();
  return (
    normalizedUrl.includes("spotcluster") ||
    normalizedUrl.includes("spot-cluster") ||
    normalizedUrl.includes("spot_cluster") ||
    normalizedUrl.includes("getspotclustertiles")
  );
}

async function installMapPerformanceProbe(page: Page) {
  await page.addInitScript(() => {
    const perfWindow = window as Window & {
      __pkspotMapPerf?: {
        frameGaps: number[];
        longTasks: LongTaskMetric[];
        stopFrames: boolean;
      };
    };

    perfWindow.__pkspotMapPerf = {
      frameGaps: [],
      longTasks: [],
      stopFrames: false,
    };

    let previousFrameTime = performance.now();
    const sampleFrame = (frameTime: number) => {
      const state = perfWindow.__pkspotMapPerf;
      if (!state || state.stopFrames) return;

      state.frameGaps.push(frameTime - previousFrameTime);
      previousFrameTime = frameTime;
      requestAnimationFrame(sampleFrame);
    };
    requestAnimationFrame(sampleFrame);

    try {
      new PerformanceObserver((entryList) => {
        const state = perfWindow.__pkspotMapPerf;
        if (!state) return;

        entryList.getEntries().forEach((entry) => {
          state.longTasks.push({
            duration: entry.duration,
            startTime: entry.startTime,
          });
        });
      }).observe({ type: "longtask", buffered: true });
    } catch {
      // The Long Tasks API is Chromium-only and can be unavailable in some modes.
    }
  });
}

async function collectMapPerformanceMetrics(
  page: Page,
  mapReadyMs: number,
  requestCounts: {
    clusterLike: number;
    firestore: number;
    googleMaps: number;
    search: number;
  }
): Promise<MapPerformanceMetrics> {
  const frameAndLongTaskMetrics = await page.evaluate(() => {
    const perfWindow = window as Window & {
      __pkspotMapPerf?: {
        frameGaps: number[];
        longTasks: LongTaskMetric[];
        stopFrames: boolean;
      };
    };
    const state = perfWindow.__pkspotMapPerf ?? {
      frameGaps: [],
      longTasks: [],
      stopFrames: true,
    };

    state.stopFrames = true;
    const frameGaps = state.frameGaps.filter((gap) => Number.isFinite(gap));
    const maxFrameGapMs = frameGaps.length ? Math.max(...frameGaps) : 0;
    const totalFrameGapMs = frameGaps.reduce((sum, gap) => sum + gap, 0);
    const longTaskDurations = state.longTasks.map((task) => task.duration);

    return {
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
        0
      ),
    };
  });

  const markerCount = await page
    .locator("gmp-advanced-marker, app-advanced-map-marker, app-event-dot-marker")
    .count();

  return {
    ...frameAndLongTaskMetrics,
    mapReadyMs,
    markerCount,
    clusterLikeRequestCount: requestCounts.clusterLike,
    firestoreRequestCount: requestCounts.firestore,
    googleMapsRequestCount: requestCounts.googleMaps,
    searchRequestCount: requestCounts.search,
  };
}

test.describe("@perf Map performance", () => {
  test("keeps the main map responsive during basic pan and zoom", async ({
    page,
  }, testInfo) => {
    const requestCounts = {
      clusterLike: 0,
      firestore: 0,
      googleMaps: 0,
      search: 0,
    };
    const clusterLikeUrls = new Set<string>();

    page.on("request", (request) => {
      const url = request.url();
      if (isClusterLikeRequest(url)) {
        requestCounts.clusterLike += 1;
        clusterLikeUrls.add(url);
      }
      if (url.includes("firestore.googleapis.com")) {
        requestCounts.firestore += 1;
      }
      if (url.includes("maps.googleapis.com") || url.includes("gstatic.com")) {
        requestCounts.googleMaps += 1;
      }
      if (url.includes("typesense") || url.includes("/multi_search")) {
        requestCounts.search += 1;
      }
    });

    await installMapPerformanceProbe(page);

    const startedAt = Date.now();
    const mapPage = new MapPage(page);
    await mapPage.goto("de");
    await expect(mapPage.spotMap).toBeVisible({ timeout: 15_000 });
    const mapReadyMs = Date.now() - startedAt;

    const mapBounds = await mapPage.spotMap.boundingBox();
    expect(mapBounds).not.toBeNull();
    if (!mapBounds) return;

    const centerX = mapBounds.x + mapBounds.width / 2;
    const centerY = mapBounds.y + mapBounds.height / 2;

    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    for (let step = 0; step < 10; step += 1) {
      await page.mouse.move(centerX + 12 * step, centerY + 5 * step);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();

    await page.mouse.wheel(0, -550);
    await page.waitForTimeout(250);
    await page.mouse.wheel(0, 550);
    await page.waitForTimeout(1_000);

    const metrics = await collectMapPerformanceMetrics(
      page,
      mapReadyMs,
      requestCounts
    );

    const report = {
      metrics,
      budgets: {
        mapReadyMs: MAP_READY_BUDGET_MS,
        maxFrameGapMs: MAX_FRAME_GAP_BUDGET_MS,
        framesOver100Ms: FRAMES_OVER_100_BUDGET,
        longTaskCount: LONG_TASK_COUNT_BUDGET,
      },
      clusterLikeUrls: Array.from(clusterLikeUrls),
    };

    await testInfo.attach("map-performance.json", {
      body: JSON.stringify(report, null, 2),
      contentType: "application/json",
    });

    console.log("[map-perf]", JSON.stringify(metrics));

    expect(metrics.mapReadyMs).toBeLessThanOrEqual(MAP_READY_BUDGET_MS);
    expect(metrics.maxFrameGapMs).toBeLessThanOrEqual(
      MAX_FRAME_GAP_BUDGET_MS
    );
    expect(metrics.framesOver100Ms).toBeLessThanOrEqual(
      FRAMES_OVER_100_BUDGET
    );
    expect(metrics.longTaskCount).toBeLessThanOrEqual(LONG_TASK_COUNT_BUDGET);
    expect(metrics.clusterLikeRequestCount).toBe(0);
  });
});
