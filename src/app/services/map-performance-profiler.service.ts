import { isPlatformBrowser } from "@angular/common";
import { Inject, Injectable, PLATFORM_ID } from "@angular/core";

export type MapProfilePayload = Record<string, unknown>;

export interface MapProfileEvent {
  label: string;
  payload: MapProfilePayload;
  timestampMs: number;
}

interface MapProfileEnableOptions {
  verbose?: boolean;
}

interface MapProfileState {
  enabled: boolean;
  eventCount: number;
  verbose: boolean;
}

interface MapProfileConsoleApi {
  clear: () => void;
  disable: () => void;
  dump: () => MapProfileEvent[];
  enable: (options?: MapProfileEnableOptions) => void;
  json: () => string;
  snapshot: (label?: string) => MapProfileEvent | null;
  state: () => MapProfileState;
}

interface LongTaskPerformanceEntry extends PerformanceEntry {
  attribution?: { containerType?: string; name?: string }[];
}

interface PerformanceMemory {
  jsHeapSizeLimit?: number;
  totalJSHeapSize?: number;
  usedJSHeapSize?: number;
}

interface NavigatorWithDeviceMemory extends Navigator {
  deviceMemory?: number;
}

interface WindowWithMapProfile extends Window {
  chrome?: unknown;
  pkspotMapProfile?: MapProfileConsoleApi;
}

const PROFILE_STORAGE_KEY = "pkspotMapProfile";
const PROFILE_VERBOSE_STORAGE_KEY = "pkspotMapProfileVerbose";
const MAX_STORED_EVENTS = 1_000;
const FRAME_REPORT_INTERVAL_MS = 1_000;

@Injectable({
  providedIn: "root",
})
export class MapPerformanceProfilerService {
  private readonly _isBrowser: boolean;
  private _enabled = false;
  private _events: MapProfileEvent[] = [];
  private _frameGaps: number[] = [];
  private _frameLoopId: number | null = null;
  private _lastFrameTimestamp: number | null = null;
  private _lastFrameReportTimestamp = 0;
  private _longTaskObserver: PerformanceObserver | null = null;
  private _verbose = false;

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this._isBrowser = isPlatformBrowser(platformId);
    if (!this._isBrowser) return;

    this._installConsoleApi();

    if (this._shouldAutoEnable()) {
      this.enable({
        verbose: localStorage.getItem(PROFILE_VERBOSE_STORAGE_KEY) === "1",
      });
      this.record("profiler:auto-enabled", this._getBrowserSnapshot());
    }
  }

  enable(options: MapProfileEnableOptions = {}): void {
    if (!this._isBrowser) return;

    this._enabled = true;
    this._verbose = !!options.verbose;
    localStorage.setItem(PROFILE_STORAGE_KEY, "1");
    localStorage.setItem(PROFILE_VERBOSE_STORAGE_KEY, this._verbose ? "1" : "0");
    this._startFrameLoop();
    this._startLongTaskObserver();
    this.record("profiler:enabled", {
      ...this._getBrowserSnapshot(),
      verbose: this._verbose,
    });
  }

  disable(): void {
    if (!this._isBrowser) return;

    this.record("profiler:disabled", {});
    this._enabled = false;
    localStorage.removeItem(PROFILE_STORAGE_KEY);
    this._stopFrameLoop();
    this._stopLongTaskObserver();
  }

  isEnabled(): boolean {
    return this._enabled;
  }

  record(label: string, payload: MapProfilePayload = {}): MapProfileEvent | null {
    if (!this._enabled) return null;

    const event: MapProfileEvent = {
      label,
      payload,
      timestampMs: Math.round(performance.now()),
    };
    this._events.push(event);
    if (this._events.length > MAX_STORED_EVENTS) {
      this._events.shift();
    }

    console.info(`[MapProfile] ${label}`, {
      ...payload,
      timestampMs: event.timestampMs,
    });
    return event;
  }

  snapshot(label = "manual"): MapProfileEvent | null {
    if (!this._isBrowser) return null;

    const payload = {
      ...this._getBrowserSnapshot(),
      ...this._getDomSnapshot(),
    };

    if (!this._enabled) {
      console.info(`[MapProfile] snapshot:${label}`, payload);
      return null;
    }

    return this.record(`snapshot:${label}`, payload);
  }

  dump(): MapProfileEvent[] {
    const events = [...this._events];
    console.info("[MapProfile] dump", events);
    return events;
  }

  json(): string {
    const json = JSON.stringify(this._events, null, 2);
    console.info("[MapProfile] json", json);
    return json;
  }

  clear(): void {
    this._events = [];
    this._frameGaps = [];
    console.info("[MapProfile] cleared");
  }

  state(): MapProfileState {
    return {
      enabled: this._enabled,
      eventCount: this._events.length,
      verbose: this._verbose,
    };
  }

  private _installConsoleApi(): void {
    const win = window as WindowWithMapProfile;
    win.pkspotMapProfile = {
      clear: () => this.clear(),
      disable: () => this.disable(),
      dump: () => this.dump(),
      enable: (options?: MapProfileEnableOptions) => this.enable(options),
      json: () => this.json(),
      snapshot: (label?: string) => this.snapshot(label),
      state: () => this.state(),
    };
  }

  private _shouldAutoEnable(): boolean {
    const params = new URLSearchParams(window.location.search);
    return (
      params.get("mapProfile") === "1" ||
      localStorage.getItem(PROFILE_STORAGE_KEY) === "1"
    );
  }

  private _startFrameLoop(): void {
    if (this._frameLoopId !== null) return;

    this._lastFrameTimestamp = null;
    this._lastFrameReportTimestamp = performance.now();

    const loop = (timestamp: number) => {
      if (!this._enabled) {
        this._frameLoopId = null;
        return;
      }

      if (this._lastFrameTimestamp !== null) {
        this._frameGaps.push(timestamp - this._lastFrameTimestamp);
      }
      this._lastFrameTimestamp = timestamp;

      if (timestamp - this._lastFrameReportTimestamp >= FRAME_REPORT_INTERVAL_MS) {
        this._reportFrameStats(timestamp);
      }

      this._frameLoopId = requestAnimationFrame(loop);
    };

    this._frameLoopId = requestAnimationFrame(loop);
  }

  private _stopFrameLoop(): void {
    if (this._frameLoopId !== null) {
      cancelAnimationFrame(this._frameLoopId);
      this._frameLoopId = null;
    }
    this._lastFrameTimestamp = null;
  }

  private _reportFrameStats(timestamp: number): void {
    const frameGaps = this._frameGaps;
    this._frameGaps = [];
    this._lastFrameReportTimestamp = timestamp;
    if (frameGaps.length === 0) return;

    const totalGapMs = frameGaps.reduce((sum, gap) => sum + gap, 0);
    const maxGapMs = Math.max(...frameGaps);
    const averageGapMs = totalGapMs / frameGaps.length;

    this.record("frames", {
      averageGapMs: Math.round(averageGapMs * 10) / 10,
      estimatedFps: Math.round((1_000 / averageGapMs) * 10) / 10,
      framesOver100Ms: frameGaps.filter((gap) => gap > 100).length,
      framesOver50Ms: frameGaps.filter((gap) => gap > 50).length,
      maxGapMs: Math.round(maxGapMs * 10) / 10,
      sampleCount: frameGaps.length,
    });
  }

  private _startLongTaskObserver(): void {
    if (this._longTaskObserver) return;

    try {
      this._longTaskObserver = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries() as LongTaskPerformanceEntry[]) {
          this.record("long-task", {
            attribution:
              entry.attribution?.map((item) => ({
                containerType: item.containerType ?? null,
                name: item.name ?? null,
              })) ?? [],
            durationMs: Math.round(entry.duration),
            startTimeMs: Math.round(entry.startTime),
          });
        }
      });
      this._longTaskObserver.observe({
        buffered: true,
        type: "longtask",
      } as PerformanceObserverInit);
    } catch (error) {
      this.record("long-task-observer-unavailable", {
        error: String(error),
      });
    }
  }

  private _stopLongTaskObserver(): void {
    this._longTaskObserver?.disconnect();
    this._longTaskObserver = null;
  }

  private _getBrowserSnapshot(): MapProfilePayload {
    const nav = navigator as NavigatorWithDeviceMemory;
    const memory = (performance as Performance & { memory?: PerformanceMemory })
      .memory;

    return {
      browser: {
        chromeRuntimePresent: !!(window as WindowWithMapProfile).chrome,
        deviceMemoryGb: nav.deviceMemory ?? null,
        devicePixelRatio: window.devicePixelRatio,
        hardwareConcurrency: navigator.hardwareConcurrency,
        maxTouchPoints: navigator.maxTouchPoints,
        userAgent: navigator.userAgent,
        viewport: {
          height: window.innerHeight,
          width: window.innerWidth,
        },
      },
      memory: memory
        ? {
            jsHeapSizeLimit: memory.jsHeapSizeLimit ?? null,
            totalJSHeapSize: memory.totalJSHeapSize ?? null,
            usedJSHeapSize: memory.usedJSHeapSize ?? null,
          }
        : null,
      webgl: this._getWebGlSnapshot(),
    };
  }

  private _getDomSnapshot(): MapProfilePayload {
    return {
      domCounts: {
        advancedMarkerComponents:
          document.querySelectorAll("app-advanced-map-marker").length,
        eventMarkerComponents:
          document.querySelectorAll("app-event-dot-marker").length,
        googleAdvancedMarkerElements:
          document.querySelectorAll("gmp-advanced-marker").length,
        mapAdvancedMarkerElements:
          document.querySelectorAll("map-advanced-marker").length,
        mapCircles: document.querySelectorAll("map-circle").length,
        mapPolygons: document.querySelectorAll("map-polygon").length,
        mapRectangles: document.querySelectorAll("map-rectangle").length,
      },
    };
  }

  private _getWebGlSnapshot(): MapProfilePayload {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ??
      canvas.getContext("webgl") ??
      canvas.getContext("experimental-webgl");

    if (!gl) {
      return {
        available: false,
      };
    }

    const renderingContext = gl as WebGLRenderingContext;
    const debugInfo = renderingContext.getExtension("WEBGL_debug_renderer_info");

    return {
      available: true,
      renderer: debugInfo
        ? renderingContext.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        : renderingContext.getParameter(renderingContext.RENDERER),
      vendor: debugInfo
        ? renderingContext.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
        : renderingContext.getParameter(renderingContext.VENDOR),
      version: renderingContext.getParameter(renderingContext.VERSION),
      webgl2:
        typeof WebGL2RenderingContext !== "undefined" &&
        gl instanceof WebGL2RenderingContext,
    };
  }
}
