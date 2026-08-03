import type { Event as PkEvent } from "../../../db/models/Event";

export type MyEventsTab = "going" | "saved" | "past";

export interface MyEventsDialogData {
  goingEvents: readonly PkEvent[];
  savedEvents: readonly PkEvent[];
  pastEvents: readonly PkEvent[];
  initialTab: MyEventsTab;
}
