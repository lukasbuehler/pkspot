import { describe, expect, it, vi } from "vitest";
import type { ActivatedRouteSnapshot, RouterStateSnapshot } from "@angular/router";
import { unsavedChangesGuard } from "./unsaved-changes.guard";

describe("unsavedChangesGuard", () => {
  const route = {} as ActivatedRouteSnapshot;
  const state = {} as RouterStateSnapshot;

  it("asks the page whether it may be left", async () => {
    const confirmLeave = vi.fn().mockResolvedValue(false);

    const result = await unsavedChangesGuard({ confirmLeave }, route, state, state);

    expect(confirmLeave).toHaveBeenCalledTimes(1);
    expect(result).toBe(false);
  });

  it("lets pages without the hook go", () => {
    expect(
      unsavedChangesGuard(
        undefined as unknown as { confirmLeave(): boolean },
        route,
        state,
        state,
      ),
    ).toBe(true);
  });
});
