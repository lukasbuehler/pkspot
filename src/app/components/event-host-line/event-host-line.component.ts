import { ChangeDetectionStrategy, Component, computed, input, signal } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import type { EventListingTier } from "../../../db/schemas/EventSchema";

/**
 * The organizer data an event listing carries. Search previews always have
 * `listingTier` and `hasOrganization`; the `organizer*` fields come from the
 * events index and are missing on documents that have not been reindexed, so
 * every one of them is optional.
 */
export interface EventHostSource {
  listingTier: EventListingTier;
  hasOrganization: boolean;
  organizerKind?: "organization" | "user" | "name";
  organizerName?: string;
  organizerLogoSrc?: string;
  organizerLogoBackgroundColor?: string;
}

/** Who hosts an event, as far as the listing can tell. */
export type EventHost =
  | {
      /** An organisation approved by PK Spot. The name may not be indexed yet. */
      kind: "organization";
      name: string | null;
      logoUrl: string | null;
      logoBackground: string | null;
    }
  | {
      /** A community member's event, not run by an approved organisation. */
      kind: "community";
      name: string | null;
    }
  | {
      /** A named organiser without an approved organisation profile. */
      kind: "named";
      name: string;
    };

export function eventHost(event: EventHostSource): EventHost | null {
  const name = event.organizerName?.trim() || null;
  if (event.hasOrganization || event.organizerKind === "organization") {
    return {
      kind: "organization",
      name,
      logoUrl: event.organizerLogoSrc || null,
      logoBackground: event.organizerLogoBackgroundColor || null,
    };
  }
  if (event.listingTier === "community") return { kind: "community", name };
  return name ? { kind: "named", name } : null;
}

/**
 * One line naming who hosts an event. Approved organisations show their logo
 * and a verified mark so they read as official; community events show the
 * people icon and say they come from the community. `compact` keeps only the
 * icon, for dense calendar rows.
 */
@Component({
  selector: "app-event-host-line",
  imports: [MatIconModule, MatTooltipModule],
  templateUrl: "./event-host-line.component.html",
  styleUrl: "./event-host-line.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    "[class.is-compact]": "compact()",
    "[class.is-official]": "host()?.kind === 'organization'",
  },
})
export class EventHostLineComponent {
  readonly event = input.required<EventHostSource>();
  readonly compact = input(false);

  readonly host = computed(() => eventHost(this.event()));
  /** A logo that failed to load; the line then shows the name alone. */
  readonly failedLogo = signal<string | null>(null);

  readonly verifiedLabel = $localize`:@@event_host.verified:Verified organizer`;
  readonly communityLabel = $localize`:@@event_host.community_hint:Community event, organized by members`;
}
