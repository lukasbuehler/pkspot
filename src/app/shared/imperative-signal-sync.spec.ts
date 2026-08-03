import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it, vi } from "vitest";
import { bindSignalToImperativeApi } from "./imperative-signal-sync";

describe("bindSignalToImperativeApi", () => {
  it("reacts to the source without tracking signals read by the imperative API", () => {
    const source = signal(4);
    const internalCameraZoom = signal(4);
    const apply = vi.fn(() => internalCameraZoom());

    TestBed.runInInjectionContext(() => {
      bindSignalToImperativeApi(source, apply);
    });
    TestBed.flushEffects();

    internalCameraZoom.set(5);
    TestBed.flushEffects();
    expect(apply).toHaveBeenCalledTimes(1);

    source.set(6);
    TestBed.flushEffects();
    expect(apply).toHaveBeenCalledTimes(2);
  });
});
