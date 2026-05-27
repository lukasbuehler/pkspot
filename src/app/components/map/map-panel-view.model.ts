import { CommunityLandingPageData } from "../../services/firebase/firestore/landing-pages.service";
import { Event as PkEvent } from "../../../db/models/Event";
import { LocalSpot, Spot } from "../../../db/models/Spot";
import {
  LocalSpotChallenge,
  SpotChallenge,
} from "../../../db/models/SpotChallenge";
import { PoiData } from "../../../db/models/PoiData";
import { MapIslandCommunity } from "../map-island/map-island.component";

export interface PendingSpotPanel {
  id: string;
  slug?: string;
  name?: string;
  imageSrc?: string;
  locality?: string;
  rating?: number;
}

export interface PendingEventPanel {
  idOrSlug: string;
}

export interface PanelBackTarget {
  path: string;
  label: string;
  typeLabel: string;
}

export type MapPanelView =
  | { kind: "poi"; poi: PoiData }
  | {
      kind: "spot-details";
      spot: Spot | LocalSpot | null;
      pendingSpot: PendingSpotPanel | null;
    }
  | {
      kind: "spot-challenges";
      spot: Spot | LocalSpot;
      spotName: string;
    }
  | {
      kind: "spot-edits";
      spot: Spot | LocalSpot;
      spotName: string;
    }
  | {
      kind: "event-preview";
      event: PkEvent | null;
      pendingEvent: PendingEventPanel | null;
    }
  | {
      kind: "community-landing";
      community: CommunityLandingPageData | null;
      pendingCommunity: MapIslandCommunity | null;
    }
  | { kind: "objects" };

export interface MapPanelViewState {
  poi: PoiData | null;
  spot: Spot | LocalSpot | null;
  pendingSpot: PendingSpotPanel | null;
  selectedChallenge: SpotChallenge | LocalSpotChallenge | null;
  showAllChallenges: boolean;
  showSpotEditHistory: boolean;
  event: PkEvent | null;
  pendingEvent: PendingEventPanel | null;
  community: CommunityLandingPageData | null;
  pendingCommunity: MapIslandCommunity | null;
}

export function getMapPanelView(state: MapPanelViewState): MapPanelView {
  if (state.poi) {
    return { kind: "poi", poi: state.poi };
  }

  if (
    state.pendingSpot ||
    (state.spot &&
      !state.selectedChallenge &&
      !state.showAllChallenges &&
      !state.showSpotEditHistory)
  ) {
    return {
      kind: "spot-details",
      spot: state.spot,
      pendingSpot: state.pendingSpot,
    };
  }

  if (state.spot && (state.selectedChallenge || state.showAllChallenges)) {
    return {
      kind: "spot-challenges",
      spot: state.spot,
      spotName: state.spot.name(),
    };
  }

  if (state.spot && state.showSpotEditHistory) {
    return {
      kind: "spot-edits",
      spot: state.spot,
      spotName: state.spot.name(),
    };
  }

  if (state.event || state.pendingEvent) {
    return {
      kind: "event-preview",
      event: state.event,
      pendingEvent: state.pendingEvent,
    };
  }

  if (state.community || state.pendingCommunity) {
    return {
      kind: "community-landing",
      community: state.community,
      pendingCommunity: state.pendingCommunity,
    };
  }

  return { kind: "objects" };
}
