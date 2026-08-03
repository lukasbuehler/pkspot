import { Injectable, inject } from "@angular/core";
import type {
  EventOwnershipClaimSchema,
  FormerOwnerOutcome,
} from "../../../../db/schemas/EventOwnershipClaimSchema";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { FunctionsAdapterService } from "../functions-adapter.service";

export type EventOwnershipClaimDocument = EventOwnershipClaimSchema & {
  id: string;
};

interface ScreenshotGlobal {
  __PKSPOT_SCREENSHOT_EVENT_OWNERSHIP_CLAIMS__?: EventOwnershipClaimDocument[];
}

@Injectable({ providedIn: "root" })
export class EventOwnershipClaimsService {
  private readonly firestore = inject(FirestoreAdapterService);
  private readonly functions = inject(FunctionsAdapterService);

  listPending(): Promise<EventOwnershipClaimDocument[]> {
    const fixture = (globalThis as ScreenshotGlobal)
      .__PKSPOT_SCREENSHOT_EVENT_OWNERSHIP_CLAIMS__;
    if (fixture) return Promise.resolve([...fixture]);
    return this.firestore.getCollection<EventOwnershipClaimDocument>(
      "event_ownership_claims",
      [{ fieldPath: "status", opStr: "==", value: "pending" }],
      [{ type: "orderBy", fieldPath: "time_created", direction: "asc" }],
    );
  }

  getById(claimId: string): Promise<EventOwnershipClaimDocument | null> {
    return this.firestore.getDocument<EventOwnershipClaimDocument>(
      `event_ownership_claims/${claimId}`,
    );
  }

  submit(input: {
    eventId: string;
    organizationId: string;
    explanation: string;
    evidenceUrls: string[];
    suggestedFormerOwnerOutcome: FormerOwnerOutcome;
  }): Promise<{ claimId: string }> {
    return this.functions.call("submitEventOwnershipClaim", input);
  }

  respond(input: {
    claimId: string;
    position: "support" | "contest";
    message?: string;
  }): Promise<{ ok: true }> {
    return this.functions.call("respondToEventOwnershipClaim", input);
  }

  review(input: {
    claimId: string;
    approve: boolean;
    transferOwnership: boolean;
    linkOrganizer: boolean;
    formerOwnerOutcome: FormerOwnerOutcome;
    reason?: string;
  }): Promise<{ ok: true }> {
    return this.functions.call("reviewEventOwnershipClaim", input);
  }
}
