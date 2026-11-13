import { ApplicationRef } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { WelcomeContentComponent } from "../../components/welcome-content/welcome-content.component";
import { readFileSync } from "node:fs";
import { isBot } from "../../../scripts/BrowserAgents";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENT_TERMS_VERSION } from "../../services/consent-version";
import { WHATS_NEW_STORAGE_KEY } from "../../services/whats-new";

const mocks = vi.hoisted(() => ({ bootstrap: vi.fn(), load: vi.fn() }));
vi.mock("../application-loader", () => ({ loadApplication: mocks.load }));
import { WelcomeStartupComponent } from "./welcome-startup.component";

describe("WelcomeStartupComponent handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.load.mockResolvedValue({ bootstrap: mocks.bootstrap });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      queueMicrotask(() => callback(performance.now())); return 0;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks(); vi.unstubAllGlobals();
    localStorage.removeItem("acceptedVersion"); localStorage.removeItem(WHATS_NEW_STORAGE_KEY);
  });

  function setup() {
    TestBed.configureTestingModule({});
    const destroy = vi.spyOn(TestBed.inject(ApplicationRef), "destroy").mockImplementation(() => {});
    const fixture = TestBed.createComponent(WelcomeStartupComponent);
    fixture.detectChanges();
    const content = fixture.debugElement.query(By.directive(WelcomeContentComponent))
      .componentInstance as WelcomeContentComponent;
    return {
      fixture, destroy,
      accept: () => content.accepted.emit(),
      pending: () => content.pending(),
      failed: () => content.failed(),
    };
  }

  it("holds a pending dialog until the main app is ready and prevents duplicate bootstrap", async () => {
    let ready!: () => void;
    mocks.bootstrap.mockImplementation(() => new Promise<void>(resolve => { ready = resolve; }));
    const { accept, pending, destroy, fixture } = setup();
    accept(); accept();
    await vi.waitFor(() => expect(mocks.bootstrap).toHaveBeenCalledOnce());
    expect(mocks.bootstrap).toHaveBeenCalledWith({ ready: expect.any(Function) });
    expect(localStorage.getItem("acceptedVersion")).toBeNull();
    fixture.detectChanges();
    expect(pending()).toBe(true);
    expect(destroy).not.toHaveBeenCalled();
    const grantConsent = vi.fn();
    mocks.bootstrap.mock.calls[0][0].ready(grantConsent);
    ready();
    await vi.waitFor(() => expect(destroy).toHaveBeenCalledOnce());
    expect(grantConsent).toHaveBeenCalledOnce();
    expect(localStorage.getItem("acceptedVersion")).toBe(CURRENT_TERMS_VERSION);
  });

  it("leaves a manual recovery action when the main bundle cannot load", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.bootstrap.mockRejectedValue(new Error("bundle unavailable"));
    const { accept, pending, failed, destroy, fixture } = setup();
    accept();
    await vi.waitFor(() => { fixture.detectChanges(); expect(failed()).toBe(true); });
    expect(pending()).toBe(false);
    expect(destroy).not.toHaveBeenCalled();
  });

  it("takes over from the server copy and blocks the page until it closes", async () => {
    const page = document.body.appendChild(document.createElement("app-root"));
    const prerendered = document.body.appendChild(document.createElement("app-welcome-prerender"));
    try {
      const { fixture } = setup();
      await fixture.whenStable();
      expect(prerendered.hasAttribute("hidden")).toBe(true);
      expect(page.hasAttribute("inert")).toBe(true);
      expect(document.documentElement.style.overflow).toBe("hidden");
      fixture.destroy();
      expect(page.hasAttribute("inert")).toBe(false);
      expect(document.documentElement.style.overflow).toBe("");
    } finally {
      page.remove(); prerendered.remove();
    }
  });

  it("reveals the server copy with the same bot rule as the browser startup", () => {
    const indexHtml = readFileSync("src/index.html", "utf8");
    const pattern = isBot.toString().match(/\/[^/]+\/i/)?.[0];
    expect(pattern).toBeTruthy();
    expect(indexHtml).toContain(`${pattern}.test(navigator.userAgent)`);
  });
});
