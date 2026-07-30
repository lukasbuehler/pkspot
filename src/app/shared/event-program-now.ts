import type { Event as PkEvent, EventProgramItem } from "../../db/models/Event";
import { effectiveProgramItem } from "./event-program-spots";

export interface EventProgramMomentItem {
  item: EventProgramItem;
  start: Date;
  end?: Date;
}

export interface EventProgramMoment {
  current: readonly EventProgramMomentItem[];
  next: readonly EventProgramMomentItem[];
}

export function activeEventProgramItems(
  event: Pick<PkEvent, "program">,
): readonly EventProgramItem[] {
  const program = event.program;
  if (!program) return [];
  return (
    program.plans.find((plan) => plan.id === program.active_plan_id) ??
    program.plans[0]
  )?.items ?? [];
}

export function eventProgramMoment(
  items: readonly EventProgramItem[],
  now: Date,
): EventProgramMoment {
  const scheduled = items
    .map((item): EventProgramMomentItem | null => {
      const effective = effectiveProgramItem(item);
      return effective.status === "cancelled"
        ? null
        : { item, start: effective.start, end: effective.end };
    })
    .filter((item): item is EventProgramMomentItem => item !== null)
    .sort((left, right) => left.start.getTime() - right.start.getTime());

  const current = scheduled.filter(
    ({ start, end }) => start <= now && !!end && now < end,
  );
  const nextStart = scheduled.find(({ start }) => start > now)?.start.getTime();
  const next =
    nextStart === undefined
      ? []
      : scheduled.filter(({ start }) => start.getTime() === nextStart);

  return { current, next };
}
