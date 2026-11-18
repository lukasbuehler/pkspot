import { TestBed } from "@angular/core/testing";
import { ActivatedRouteSnapshot, RouterStateSnapshot } from "@angular/router";
import { describe, expect, it } from "vitest";
import { SpotEditLeaveService, spotEditLeaveGuard } from "./spot-edit-leave.guard";

describe("spotEditLeaveGuard", () => {
  const run = () =>
    TestBed.runInInjectionContext(() =>
      spotEditLeaveGuard(
        null,
        {} as ActivatedRouteSnapshot,
        {} as RouterStateSnapshot,
        {} as RouterStateSnapshot,
      ),
    );

  it("lets the map be left when no editor is open", () => {
    expect(run()).toBe(true);
  });

  it("asks the open editor and stops leaving when the person keeps editing", async () => {
    const service = TestBed.inject(SpotEditLeaveService);
    const keepEditing = async () => false;
    service.register(keepEditing);
    expect(await run()).toBe(false);

    service.unregister(keepEditing);
    expect(run()).toBe(true);
  });

  it("ignores an unregister from a page that is no longer the registered one", async () => {
    const service = TestBed.inject(SpotEditLeaveService);
    const current = async () => false;
    service.register(current);
    service.unregister(async () => true);
    expect(await run()).toBe(false);
  });
});
