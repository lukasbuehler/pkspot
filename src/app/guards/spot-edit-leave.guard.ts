import { Injectable, inject } from "@angular/core";
import { CanDeactivateFn } from "@angular/router";

type LeaveCheck = () => Promise<boolean> | boolean;

/**
 * Lets the map page answer whether its open Spot editor may be left. Spot
 * routes are reused map page instances, so the route guard cannot reach the
 * editor through its component argument.
 *
 * Nested Spot routes (`/map`, `/map/spots/:spot`, `/map/spots/:spot/edits`)
 * can each hold a live map page, so every instance registers its own check.
 * One instance going away (for example closing the history view) must not
 * leave the others unguarded.
 */
@Injectable({ providedIn: "root" })
export class SpotEditLeaveService {
  private readonly _checks = new Set<LeaveCheck>();

  register(check: LeaveCheck): void {
    this._checks.add(check);
  }

  unregister(check: LeaveCheck): void {
    this._checks.delete(check);
  }

  private _pending: Promise<boolean> | null = null;

  private readonly _discardChecks = new Set<LeaveCheck>();

  /**
   * A check that only asks whether unsaved edits may be thrown away, without
   * discarding them itself. The editor's own Discard button uses it, then
   * discards through its usual path.
   */
  registerDiscardCheck(check: LeaveCheck): void {
    this._discardChecks.add(check);
  }

  unregisterDiscardCheck(check: LeaveCheck): void {
    this._discardChecks.delete(check);
  }

  async confirmDiscard(): Promise<boolean> {
    for (const check of [...this._discardChecks]) {
      if (!(await check())) return false;
    }
    return true;
  }

  /**
   * Leaving is allowed only when every open map page agrees. The guard sits on
   * both `/map` and `/map/spots/:spot`, so one navigation can ask twice; the
   * second ask shares the first one's answer instead of opening a second
   * dialog.
   */
  confirmLeave(): Promise<boolean> | boolean {
    if (this._pending) return this._pending;
    const checks = [...this._checks];
    if (checks.length === 0) return true;
    const pending = (async () => {
      for (const check of checks) {
        if (!(await check())) return false;
      }
      return true;
    })();
    this._pending = pending;
    void pending.finally(() => {
      if (this._pending === pending) this._pending = null;
    });
    return pending;
  }
}

/** Asks before Back or a link leaves a Spot whose edits are not saved. */
export const spotEditLeaveGuard: CanDeactivateFn<unknown> = () =>
  inject(SpotEditLeaveService).confirmLeave();
