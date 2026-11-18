import { Injectable, inject } from "@angular/core";
import { CanDeactivateFn } from "@angular/router";

type LeaveCheck = () => Promise<boolean> | boolean;

/**
 * Lets the map page answer whether its open Spot editor may be left. Spot
 * routes are reused map page instances, so the route guard cannot reach the
 * editor through its component argument.
 */
@Injectable({ providedIn: "root" })
export class SpotEditLeaveService {
  private _check: LeaveCheck | null = null;

  register(check: LeaveCheck): void {
    this._check = check;
  }

  unregister(check: LeaveCheck): void {
    if (this._check === check) this._check = null;
  }

  confirmLeave(): Promise<boolean> | boolean {
    return this._check?.() ?? true;
  }
}

/** Asks before Back or a link leaves a Spot whose edits are not saved. */
export const spotEditLeaveGuard: CanDeactivateFn<unknown> = () =>
  inject(SpotEditLeaveService).confirmLeave();
