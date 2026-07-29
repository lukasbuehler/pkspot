import type { Timestamp } from "firebase/firestore";
import type {
  EventOrganizerSchema,
  EventOwnerSchema,
} from "./EventSchema";
import type { OrganizationReferenceSchema } from "./OrganizationSchema";

export type EventOwnershipClaimStatus = "pending" | "approved" | "rejected";
export type FormerOwnerOutcome = "retain_editor" | "remove_access";

export interface EventOwnershipClaimSchema {
  event_id: string;
  event_name: string;
  organization_id: string;
  organization: OrganizationReferenceSchema;
  submitter_id: string;
  explanation: string;
  evidence_urls: string[];
  suggested_former_owner_outcome: FormerOwnerOutcome;
  status: EventOwnershipClaimStatus;
  owner_before: EventOwnerSchema | null;
  organizer_before: EventOrganizerSchema | null;
  owner_response?: {
    position: "support" | "contest";
    message?: string;
    responded_by: string;
    responded_at: Timestamp;
  };
  decision?: {
    transfer_ownership: boolean;
    link_organizer: boolean;
    former_owner_outcome: FormerOwnerOutcome;
    reason?: string;
    decided_by: string;
    decided_at: Timestamp;
    owner_after: EventOwnerSchema | null;
    organizer_after: EventOrganizerSchema | null;
  };
  time_created: Timestamp;
  time_updated: Timestamp;
}

export interface EventOwnershipClaimAuditSchema {
  claim_id: string;
  event_id: string;
  organization_id: string;
  owner_before: EventOwnerSchema | null;
  owner_after: EventOwnerSchema | null;
  organizer_before: EventOrganizerSchema | null;
  organizer_after: EventOrganizerSchema | null;
  former_owner_outcome: FormerOwnerOutcome;
  decided_by: string;
  decided_at: Timestamp;
}
