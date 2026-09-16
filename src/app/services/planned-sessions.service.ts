import { environment } from "../../environments/environment.default";
import { Injectable, inject } from "@angular/core";
import { FunctionsAdapterService } from "./firebase/functions-adapter.service";
import type { PlannedSessionInput, PlannedSessionView, SessionPlan } from "../../db/schemas/PlannedSessionSchema";

@Injectable({ providedIn: "root" })
export class PlannedSessionsService {
  private readonly functions = inject(FunctionsAdapterService);
  // Visual fixtures are confined to the CI build and never authorize a write.
  readonly visualFixture = environment.name === "CI" && !environment.production
    ? (globalThis as typeof globalThis & { __PKSPOT_PLANNED_SESSION_FIXTURE__?: PlannedSessionView }).__PKSPOT_PLANNED_SESSION_FIXTURE__
    : undefined;
  get(id: string, authenticated = true): Promise<PlannedSessionView> {
    if (this.visualFixture) return Promise.resolve(this.visualFixture);
    return authenticated ? this.call({ action: "get", id }) : this.functions.callAppChecked("plannedSessions", { action: "get", id });
  }
  list(scope: "mine" | "community"): Promise<PlannedSessionView[]> {
    if (this.visualFixture) return Promise.resolve([this.visualFixture]);
    return this.call({ action: "list", scope });
  }
  create(session: PlannedSessionInput): Promise<{ id: string }> { return this.call({ action: "create", session }); }
  update(id: string, session: PlannedSessionInput): Promise<void> { return this.call({ action: "update", id, session }); }
  save(id: string, plan: SessionPlan): Promise<void> { return this.call({ action: "save", id, plan }); }
  cancel(id: string): Promise<void> { return this.call({ action: "cancel", id }); }
  invite(id: string, uid: string): Promise<void> { return this.call({ action: "invite", id, uid }); }
  revoke(id: string, uid: string): Promise<void> { return this.call({ action: "revoke", id, uid }); }
  invitations(id: string): Promise<string[]> { return this.call({ action: "invitations", id }); }
  attendees(id: string): Promise<{ uid: string; name: string }[]> { return this.call({ action: "attendees", id }); }
  private call<T>(payload: Record<string, unknown>): Promise<T> {
    if (this.visualFixture) return Promise.reject(new Error("Visual fixtures cannot perform actions."));
    return this.functions.callAuthenticatedAppChecked("plannedSessions", payload);
  }
}
