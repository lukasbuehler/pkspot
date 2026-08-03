export function eventRescheduleTimingChange(
  payload: Record<string, string>,
  locale: string,
): string | null {
  if (payload["live_update_type"] !== "event_rescheduled") return null;

  const previousStart = numericDate(payload["previous_start_ms"]);
  const nextStart = numericDate(payload["next_start_ms"]);
  const previousEnd = numericDate(payload["previous_end_ms"]);
  const nextEnd = numericDate(payload["next_end_ms"]);
  const changedPair = changedTimingPair(
    previousStart,
    nextStart,
    previousEnd,
    nextEnd,
  );
  if (!changedPair) return null;

  const timeZone = validTimeZone(payload["time_zone"]);
  const dateKey = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const sameDay = dateKey.format(changedPair[0]) === dateKey.format(changedPair[1]);
  const delta = formatTimingDelta(changedPair[1].getTime() - changedPair[0].getTime());
  if (sameDay) {
    const date = new Intl.DateTimeFormat(locale, {
      timeZone,
      dateStyle: "medium",
    }).format(changedPair[0]);
    const time = new Intl.DateTimeFormat(locale, {
      timeZone,
      timeStyle: "short",
    });
    return `${date}, ${time.format(changedPair[0])} → ${time.format(changedPair[1])} (${delta})`;
  }
  const dateTime = new Intl.DateTimeFormat(locale, {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  });
  return `${dateTime.format(changedPair[0])} → ${dateTime.format(changedPair[1])} (${delta})`;
}

function changedTimingPair(
  previousStart: Date | null,
  nextStart: Date | null,
  previousEnd: Date | null,
  nextEnd: Date | null,
): readonly [Date, Date] | null {
  if (previousStart && nextStart && previousStart.getTime() !== nextStart.getTime()) {
    return [previousStart, nextStart];
  }
  if (previousEnd && nextEnd && previousEnd.getTime() !== nextEnd.getTime()) {
    return [previousEnd, nextEnd];
  }
  return null;
}

function formatTimingDelta(milliseconds: number): string {
  const sign = milliseconds >= 0 ? "+" : "-";
  let minutes = Math.round(Math.abs(milliseconds) / 60_000);
  const days = Math.floor(minutes / (24 * 60));
  minutes -= days * 24 * 60;
  const hours = Math.floor(minutes / 60);
  minutes -= hours * 60;
  const parts = [
    ...(days ? [`${days} d`] : []),
    ...(hours ? [`${hours} h`] : []),
    ...(minutes || (!days && !hours) ? [`${minutes} min`] : []),
  ];
  return `${sign}${parts.join(" ")}`;
}

function numericDate(value: string | undefined): Date | null {
  const milliseconds = Number(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds) : null;
}

function validTimeZone(value: string | undefined): string {
  if (!value) return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return value;
  } catch {
    return "UTC";
  }
}
