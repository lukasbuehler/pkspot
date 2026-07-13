const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

export interface EventPromoDismissalRecord {
  showAgainAt: string;
  dismissCount: number;
}

export type EventPromoDismissalStage = "one-day" | "seven-days" | "event-end";

export interface EventPromoDismissal extends EventPromoDismissalRecord {
  stage: EventPromoDismissalStage;
}

/**
 * Repeated dismissals express an increasingly strong preference. The third
 * dismissal suppresses only this event promotion, until the event ends.
 */
export function getNextEventPromoDismissal(
  previous: EventPromoDismissalRecord | undefined,
  eventEnd: Date,
  now = new Date(),
): EventPromoDismissal {
  const dismissCount = (previous?.dismissCount ?? 0) + 1;
  const stage: EventPromoDismissalStage =
    dismissCount === 1
      ? "one-day"
      : dismissCount === 2
        ? "seven-days"
        : "event-end";
  const showAgainAt =
    stage === "event-end"
      ? eventEnd
      : new Date(
          now.getTime() +
            (stage === "one-day" ? ONE_DAY_MS : SEVEN_DAYS_MS),
        );

  return {
    showAgainAt: showAgainAt.toISOString(),
    dismissCount,
    stage,
  };
}
