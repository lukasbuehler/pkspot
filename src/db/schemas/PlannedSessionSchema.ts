/** Planned meetings are separate from performed SessionRecords and legacy Events. */
export interface PlannedSessionInput {
  title: string;
  notes: string;
  spotId: string;
  startsAt: number;
  endsAt: number;
  timeZone: string;
  audience: "private" | "community";
}
export interface PlannedSession extends PlannedSessionInput {
  id: string;
  ownerUid: string;
  cancelled: boolean;
  revision: number;
}
export interface SessionPlan {
  saved: boolean;
  attendance: "private" | "visible";
  reminder: boolean;
}
export interface PlannedSessionView {
  session: PlannedSession;
  mine: SessionPlan | null;
  isOwner: boolean;
  canAttendVisibly: boolean;
}
