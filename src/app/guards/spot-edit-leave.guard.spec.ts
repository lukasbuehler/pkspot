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

  it("stays guarded when another map page instance goes away", async () => {
    const service = TestBed.inject(SpotEditLeaveService);
    const editingPage = async () => false;
    const historyPage = () => true;
    service.register(editingPage);
    service.register(historyPage);
    // Closing the history view destroys its map page instance.
    service.unregister(historyPage);
    expect(await run()).toBe(false);
    service.unregister(editingPage);
  });

  it("asks once when both guarded map routes check the same navigation", async () => {
    const service = TestBed.inject(SpotEditLeaveService);
    let asked = 0;
    let answer!: (value: boolean) => void;
    const check = () => {
      asked++;
      return new Promise<boolean>((resolve) => (answer = resolve));
    };
    service.register(check);
    const first = run() as Promise<boolean>;
    const second = run() as Promise<boolean>;
    answer(false);
    expect(await first).toBe(false);
    expect(await second).toBe(false);
    expect(asked).toBe(1);
    service.unregister(check);
  });

  it("lets the editor's Discard ask without discarding through the leave check", async () => {
    const service = TestBed.inject(SpotEditLeaveService);
    let left = 0;
    const leave = () => {
      left++;
      return true;
    };
    const keepEditing = () => false;
    service.register(leave);
    expect(await service.confirmDiscard()).toBe(true);
    service.registerDiscardCheck(keepEditing);
    expect(await service.confirmDiscard()).toBe(false);
    expect(left).toBe(0);
    service.unregisterDiscardCheck(keepEditing);
    service.unregister(leave);
  });
});
